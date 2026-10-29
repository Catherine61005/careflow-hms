import { api, optInt } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { appointmentSchema } from "@/lib/validators";

// GET /api/appointments?doctor_id=&date=YYYY-MM-DD&status=&patient_id=
export const GET = api(async (req) => {
  const s = await requireRole();
  const u = new URL(req.url);
  // Doctors only ever see their own schedule
  const doctorId = s.role === "doctor" ? s.doctorId : optInt(u.searchParams.get("doctor_id"));
  const date = u.searchParams.get("date") || null;
  const status = u.searchParams.get("status") || null;
  const patientId = optInt(u.searchParams.get("patient_id"));
  const rows = await query(`
    SELECT v.*, a.symptoms
      FROM v_doctor_schedule v JOIN appointment a USING (appointment_id)
     WHERE ($1::int  IS NULL OR v.doctor_id = $1)
       AND ($2::date IS NULL OR v.appointment_date::date = $2)
       AND ($3::text IS NULL OR v.status = $3)
       AND ($4::int  IS NULL OR v.patient_id = $4)
     ORDER BY (v.appointment_date::date = CURRENT_DATE) DESC,
              (v.appointment_date >= now()) DESC,
              CASE WHEN v.appointment_date >= now() THEN v.appointment_date END ASC,
              v.appointment_date DESC
     LIMIT 200`, [doctorId, date, status, patientId]);
  return { rows };
});

export const POST = api(async (req) => {
  const s = await requireRole("admin", "receptionist");
  const a = appointmentSchema.parse(await req.json());
  // Past-time check (trigger) and 30-minute double-booking check (EXCLUDE constraint)
  // are enforced by the database; errors map to 400 / 409.
  const row = await withTransaction(s.username, async (c) =>
    (await c.query(
      `INSERT INTO appointment (patient_id, doctor_id, appointment_date, symptoms)
       VALUES ($1, $2, $3::timestamp, NULLIF($4, '')) RETURNING appointment_id`,
      [a.patient_id, a.doctor_id, a.appointment_date, a.symptoms ?? ""])).rows[0]);
  return Response.json(row, { status: 201 });
});
