import { api, intParam, HttpError } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// "Similar past cases": nearest neighbours of this admission's stored embedding,
// joined back to relational data for outcome (length of stay, doctor, bill).
export const GET = api<Ctx>(async (_req, { params }) => {
  await requireRole();
  const id = intParam((await params).id);
  const src = await queryOne("SELECT embedding FROM clinical_embedding WHERE source_type='admission' AND source_id=$1", [id]);
  if (!src) throw new HttpError(404, "This admission has not been embedded yet (run npm run embed)");
  const rows = await query(`
    WITH q AS (SELECT embedding FROM clinical_embedding WHERE source_type='admission' AND source_id=$1)
    SELECT a.admission_id, a.reason, a.admission_date, a.discharge_date,
           a.discharge_date - a.admission_date AS stay_days,
           d.name AS doctor_name, dep.department_name, b.total_amount,
           ROUND((1 - (ce.embedding <=> q.embedding))::numeric, 3)::float AS similarity
      FROM clinical_embedding ce CROSS JOIN q
      JOIN admission a    ON a.admission_id = ce.source_id
      JOIN doctor d       ON d.doctor_id = a.doctor_id
      JOIN department dep ON dep.department_id = d.department_id
      LEFT JOIN bill b    ON b.admission_id = a.admission_id
     WHERE ce.source_type = 'admission' AND ce.source_id <> $1 AND a.discharge_date IS NOT NULL
     ORDER BY ce.embedding <=> q.embedding
     LIMIT 8`, [id]);
  const stats = rows.length ? {
    avg_stay: +(rows.reduce((s, r) => s + Number(r.stay_days), 0) / rows.length).toFixed(1),
    avg_bill: Math.round(rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0) / rows.length),
  } : null;
  return { rows, stats };
});
