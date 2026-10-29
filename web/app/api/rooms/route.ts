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
  return { rows };
});
