import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db";

export const GET = api(async () => {
  await requireRole();
  const rows = await query(`
    SELECT dep.department_id, dep.department_name, dep.location, COUNT(d.doctor_id)::int AS doctors
      FROM department dep LEFT JOIN doctor d ON d.department_id = dep.department_id
     GROUP BY dep.department_id ORDER BY dep.department_name`);
  return { rows };
});
