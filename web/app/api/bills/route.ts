import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db";

// GET /api/bills?status=Unpaid&q=name
export const GET = api(async (req) => {
  await requireRole("admin", "receptionist");
  const u = new URL(req.url);
  const status = u.searchParams.get("status") || null;
  const q = u.searchParams.get("q")?.trim() || null;
  const rows = await query(`
    SELECT * FROM v_bill_status
     WHERE ($1::text IS NULL OR status = $1)
       AND ($2::text IS NULL OR patient_name ILIKE '%' || $2 || '%' OR bill_id::text = $2)
     ORDER BY (status IN ('Unpaid','Partially Paid')) DESC, bill_date DESC
     LIMIT 200`, [status, q]);
  const summary = await query(`
    SELECT status, COUNT(*)::int AS bills, SUM(total_amount)::float AS billed, SUM(outstanding)::float AS outstanding
      FROM v_bill_status GROUP BY status ORDER BY status`);
  return { rows, summary };
});
