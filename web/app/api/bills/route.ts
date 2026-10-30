import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db";

// GET /api/bills?status=Unpaid&q=name
export const GET = api(async (req) => {
  await requireRole("admin", "receptionist");
  const u = new URL(req.url);
  const status = u.searchParams.get("status") || null;
  const q = u.searchParams.get("q")?.trim() || null;
  const csv = u.searchParams.get("format") === "csv";
  const rows = await query(`
    SELECT * FROM v_bill_status
     WHERE ($1::text IS NULL OR status = $1)
       AND ($2::text IS NULL OR patient_name ILIKE '%' || $2 || '%' OR bill_id::text = $2)
     ORDER BY (status IN ('Unpaid','Partially Paid')) DESC, bill_date DESC
     ${csv ? "" : "LIMIT 200"}`, [status, q]);
  if (csv) {
    const columns = ["bill_id", "bill_date", "patient_id", "patient_name", "admission_id", "total_amount", "amount_paid", "outstanding", "age_days", "status"];
    const escape = (value: unknown) => {
      const raw = value instanceof Date ? [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-") : String(value ?? "");
      // Neutralise spreadsheet formulas in user-controlled text, then quote RFC 4180 fields.
      const safe = /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
      return '"' + safe.replace(/"/g, '""') + '"';
    };
    const body = [columns.join(","), ...rows.map((row) => columns.map((key) => escape(row[key])).join(","))].join("\r\n") + "\r\n";
    return new Response("\uFEFF" + body, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="careflow-bills.csv"',
      "Cache-Control": "no-store",
    } });
  }
  const summary = await query(`
    SELECT status, COUNT(*)::int AS bills, SUM(total_amount)::float AS billed, SUM(outstanding)::float AS outstanding
      FROM v_bill_status GROUP BY status ORDER BY status`);
  return { rows, summary };
});
