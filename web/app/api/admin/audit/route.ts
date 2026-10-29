import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db";

export const GET = api(async (req) => {
  await requireRole("admin");
  const u = new URL(req.url);
  const table = u.searchParams.get("table") || null;
  const rows = await query(`
    SELECT audit_id, table_name, operation, row_pk, changed_by, changed_at,
           -- only the columns that actually changed (JSONB set difference)
           (SELECT jsonb_object_agg(k, jsonb_build_array(old_data -> k, new_data -> k))
              FROM jsonb_object_keys(COALESCE(new_data, old_data)) k
             WHERE old_data -> k IS DISTINCT FROM new_data -> k) AS changes
      FROM audit_log
     WHERE ($1::text IS NULL OR table_name = $1) AND changed_by <> 'seed'
     ORDER BY audit_id DESC LIMIT 100`, [table]);
  return { rows };
});
