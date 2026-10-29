import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db";

export const GET = api(async () => {
  await requireRole("admin");
  const byDept = await query(`
    SELECT department_name, SUM(revenue)::float AS revenue, SUM(bills)::int AS bills
      FROM mv_monthly_department_revenue GROUP BY department_name ORDER BY revenue DESC`);
  // CTE + window functions: running total and month-over-month change
  const monthly = await query(`
    WITH m AS (SELECT date_trunc('month', payment_date)::date AS month, SUM(amount) AS revenue FROM payment GROUP BY 1)
    SELECT to_char(month, 'Mon YYYY') AS label, revenue::float,
           SUM(revenue) OVER (ORDER BY month)::float          AS running_total,
           (revenue - LAG(revenue) OVER (ORDER BY month))::float AS change
      FROM m ORDER BY month`);
  const ageing = await query(`
    SELECT CASE WHEN age_days <= 30 THEN '0-30 days' WHEN age_days <= 60 THEN '31-60 days'
                WHEN age_days <= 90 THEN '61-90 days' ELSE '90+ days' END AS bucket,
           COUNT(*)::int AS bills, SUM(outstanding)::float AS outstanding
      FROM v_bill_status WHERE status IN ('Unpaid','Partially Paid')
     GROUP BY 1 ORDER BY MIN(age_days)`);
  return { byDept, monthly, ageing };
});

// Refresh the materialized view (SECURITY DEFINER function, since hms_app does not own it)
export const POST = api(async () => {
  await requireRole("admin");
  await query("SELECT fn_refresh_revenue()");
  return { ok: true };
});
