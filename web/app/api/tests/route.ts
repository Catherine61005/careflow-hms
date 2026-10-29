import { api, optInt, HttpError } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { testSchema } from "@/lib/validators";

// GET /api/tests?status=&abnormal=true&patient_id=
export const GET = api(async (req) => {
  const s = await requireRole();
  const u = new URL(req.url);
  const status = u.searchParams.get("status") || null;
  const abnormal = u.searchParams.get("abnormal") === "true";
  const patientId = optInt(u.searchParams.get("patient_id"));
  const rows = await query(`
    SELECT test_id, test_name, test_date, status, patient_id, patient_name, doctor_name,
           bool_or(is_abnormal) AS has_abnormal,
           json_agg(json_build_object('result_value', result_value, 'units', units,
                    'reference_range', reference_range, 'is_abnormal', is_abnormal))
             FILTER (WHERE result_id IS NOT NULL) AS results
      FROM v_test_results
     WHERE ($1::int IS NULL OR doctor_id = $1) AND ($2::text IS NULL OR status = $2)
       AND ($3::int IS NULL OR patient_id = $3)
     GROUP BY test_id, test_name, test_date, status, patient_id, patient_name, doctor_name
    HAVING NOT $4 OR bool_or(is_abnormal)
     ORDER BY (status IN ('Ordered','In Progress')) DESC, test_date DESC LIMIT 150`,
    [s.role === "doctor" ? s.doctorId : null, status, patientId, abnormal]);
  return { rows };
});

export const POST = api(async (req) => {
  const s = await requireRole("doctor");
  if (!s.doctorId) throw new HttpError(403, "Account is not linked to a doctor");
  const t = testSchema.parse(await req.json());
  const row = await withTransaction(s.username, async (c) => (await c.query(
    "INSERT INTO test (patient_id, doctor_id, test_name) VALUES ($1, $2, $3) RETURNING test_id",
    [t.patient_id, s.doctorId, t.test_name])).rows[0]);
  return Response.json(row, { status: 201 });
});
