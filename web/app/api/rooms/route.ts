import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db";

export const GET = api(async (req) => {
  await requireRole();
  const avail = new URL(req.url).searchParams.get("availability") || null;
  const rows = await query(`
    SELECT * FROM v_current_occupancy
     WHERE ($1::text IS NULL OR availability = $1)
     ORDER BY room_number`, [avail]);
  // Compute against the whole ward, independently of the displayed filter.
  const occupancy = await query(`
    SELECT room_type, COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE availability = 'Occupied')::int AS occupied,
           ROUND(100.0 * COUNT(*) FILTER (WHERE availability = 'Occupied') / COUNT(*), 1) AS occupancy_pct
      FROM room GROUP BY room_type ORDER BY room_type`);
  return { rows, occupancy };
});
