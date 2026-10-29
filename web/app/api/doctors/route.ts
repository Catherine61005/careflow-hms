import { api, optInt } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db";

// Doctors with their workload for the next 7 days (subquery per row)
export const GET = api(async (req) => {
  await requireRole();
  const dept = optInt(new URL(req.url).searchParams.get("department_id"));
  const rows = await query(`
    SELECT d.doctor_id, d.name, d.specialization, d.phone_number, dep.department_id, dep.department_name,
           (SELECT COUNT(*) FROM appointment a WHERE a.doctor_id = d.doctor_id AND a.status = 'Scheduled'
               AND a.appointment_date < now() + INTERVAL '7 days')::int AS upcoming_7d,
           (SELECT COUNT(*) FROM admission a WHERE a.doctor_id = d.doctor_id AND a.discharge_date IS NULL)::int AS inpatients
      FROM doctor d JOIN department dep ON dep.department_id = d.department_id
     WHERE ($1::int IS NULL OR d.department_id = $1)
     ORDER BY dep.department_name, d.name`, [dept]);
  return { rows };
});
