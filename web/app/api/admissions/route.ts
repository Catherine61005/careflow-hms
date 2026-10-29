import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { admitSchema } from "@/lib/validators";
import { indexAdmission } from "@/lib/vectorstore";

// GET /api/admissions?active=true|false&q=keyword
export const GET = api(async (req) => {
  const s = await requireRole();
  const u = new URL(req.url);
  const active = u.searchParams.get("active");
  const q = u.searchParams.get("q")?.trim() || null;
  const rows = await query(`
    SELECT a.admission_id, a.admission_date, a.discharge_date, a.reason,
           p.patient_id, p.first_name || ' ' || p.last_name AS patient_name,
           d.doctor_id, d.name AS doctor_name, dep.department_name,
           r.room_id, r.room_number, r.room_type,
           COALESCE(a.discharge_date, CURRENT_DATE) - a.admission_date AS days,
           b.bill_id, b.status AS bill_status,
           CASE WHEN a.discharge_date IS NULL THEN fn_calculate_bill(a.admission_id) ELSE b.total_amount END AS amount
      FROM admission a
      JOIN patient p      ON p.patient_id = a.patient_id
      JOIN doctor d       ON d.doctor_id = a.doctor_id
      JOIN department dep ON dep.department_id = d.department_id
      LEFT JOIN LATERAL (SELECT room_id FROM room_allocation ra WHERE ra.admission_id = a.admission_id
                          ORDER BY from_date DESC, allocation_id DESC LIMIT 1) last_ra ON true
      LEFT JOIN room r    ON r.room_id = last_ra.room_id
      LEFT JOIN bill b    ON b.admission_id = a.admission_id
     WHERE ($1::text IS NULL OR (a.discharge_date IS NULL) = ($1 = 'true'))
       AND ($2::text IS NULL OR to_tsvector('english', a.reason) @@ websearch_to_tsquery('english', $2))
       AND ($3::int IS NULL OR a.doctor_id = $3)
     ORDER BY a.discharge_date IS NULL DESC, a.admission_date DESC
     LIMIT 150`, [active, q, s.role === "doctor" ? s.doctorId : null]);
  return { rows };
});

// Admit = admission + room allocation in ONE transaction (fn_admit_patient locks the room row)
export const POST = api(async (req) => {
  const s = await requireRole("admin", "receptionist");
  const a = admitSchema.parse(await req.json());
  const admissionId = await withTransaction(s.username, async (c) => {
    const r = await c.query<{ id: number }>("SELECT fn_admit_patient($1, $2, $3, $4) AS id",
      [a.patient_id, a.doctor_id, a.room_id, a.reason]);
    return r.rows[0].id;
  });
  // After commit: embed the reason so it joins the semantic triage corpus.
  // Failure here must not undo a valid admission, so it is best-effort.
  indexAdmission(admissionId).catch((e) => console.error("embedding failed", e));
  return Response.json({ admission_id: admissionId }, { status: 201 });
});
