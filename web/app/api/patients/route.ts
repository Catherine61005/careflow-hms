import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { patientSchema } from "@/lib/validators";

// GET /api/patients?q=&gender=&admitted=true&page=1
export const GET = api(async (req) => {
  await requireRole();
  const u = new URL(req.url);
  const q = u.searchParams.get("q")?.trim() || null;
  const gender = u.searchParams.get("gender") || null;
  const admitted = u.searchParams.get("admitted");
  const page = Math.max(1, Number(u.searchParams.get("page")) || 1);
  const size = 20;

  // Search: exact id / phone match, substring, trigram similarity (typo tolerant) or e-mail
  const rows = await query(`
    SELECT v.patient_id, v.full_name, v.gender, v.age, v.phone_number, p.email,
           v.is_admitted, v.last_visit, v.outstanding_due,
           COUNT(*) OVER () AS total
      FROM v_patient_summary v
      JOIN patient p ON p.patient_id = v.patient_id
     WHERE ($1::text IS NULL
            OR v.patient_id::text = $1
            OR v.phone_number LIKE '%' || $1 || '%'
            OR v.full_name ILIKE '%' || $1 || '%'
            OR v.full_name % $1
            OR p.email ILIKE '%' || $1 || '%')
       AND ($2::text IS NULL OR v.gender = $2)
       AND ($3::text IS NULL OR v.is_admitted = ($3 = 'true'))
     ORDER BY CASE WHEN $1::text IS NULL THEN 0 ELSE 1 - similarity(v.full_name, $1) END, v.patient_id DESC
     LIMIT ${size} OFFSET $4`,
    [q, gender, admitted, (page - 1) * size]);
  return { rows, total: Number(rows[0]?.total ?? 0), page, size };
});

export const POST = api(async (req) => {
  const s = await requireRole("admin", "receptionist");
  const p = patientSchema.parse(await req.json());
  const row = await withTransaction(s.username, async (c) => {
    const r = await c.query(
      `INSERT INTO patient (first_name, last_name, gender, date_of_birth, phone_number, hospital_id, email)
       VALUES ($1, $2, $3, $4, $5, 1, $6) RETURNING patient_id`,
      [p.first_name, p.last_name, p.gender, p.date_of_birth, p.phone_number, p.email]);
    return r.rows[0];
  });
  return Response.json(row, { status: 201 });
});
