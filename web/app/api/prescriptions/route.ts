import { api, optInt, HttpError } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { prescriptionSchema } from "@/lib/validators";

export const GET = api(async (req) => {
  const s = await requireRole("admin", "doctor");
  const patientId = optInt(new URL(req.url).searchParams.get("patient_id"));
  const rows = await query(`
    SELECT pr.prescription_id, pr.prescription_date, pr.patient_id,
           p.first_name || ' ' || p.last_name AS patient_name, d.name AS doctor_name,
           json_agg(json_build_object('medicine_name', m.medicine_name, 'dosage', m.dosage,
                    'frequency', m.frequency, 'duration', m.duration) ORDER BY m.medicine_name) AS medications
      FROM prescription pr
      JOIN patient p ON p.patient_id = pr.patient_id
      JOIN doctor d  ON d.doctor_id = pr.doctor_id
      LEFT JOIN medication m ON m.prescription_id = pr.prescription_id
     WHERE ($1::int IS NULL OR pr.doctor_id = $1) AND ($2::int IS NULL OR pr.patient_id = $2)
     GROUP BY pr.prescription_id, p.first_name, p.last_name, d.name
     ORDER BY pr.prescription_date DESC, pr.prescription_id DESC LIMIT 100`,
    [s.role === "doctor" ? s.doctorId : null, patientId]);
  return { rows };
});

// Prescription header + N medication rows: all-or-nothing transaction
export const POST = api(async (req) => {
  const s = await requireRole("doctor");
  if (!s.doctorId) throw new HttpError(403, "Account is not linked to a doctor");
  const body = prescriptionSchema.parse(await req.json());
  const id = await withTransaction(s.username, async (c) => {
    const r = await c.query<{ id: number }>(
      "INSERT INTO prescription (patient_id, doctor_id) VALUES ($1, $2) RETURNING prescription_id AS id",
      [body.patient_id, s.doctorId]);
    for (const m of body.medications) {          // duplicate medicine -> composite PK violation -> rollback
      await c.query("INSERT INTO medication VALUES ($1, $2, $3, $4, $5)",
        [r.rows[0].id, m.medicine_name, m.dosage, m.frequency, m.duration]);
    }
    return r.rows[0].id;
  });
  return Response.json({ prescription_id: id }, { status: 201 });
});
