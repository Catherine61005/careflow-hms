import { z } from "zod";
import { api, intParam, HttpError } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { withTransaction } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ availability: z.enum(["Available", "Maintenance"]) });

// Admin can take a FREE room out of service or bring it back.
// 'Occupied' is never set by hand - it is derived by the allocation trigger.
export const PATCH = api<Ctx>(async (req, { params }) => {
  const s = await requireRole("admin");
  const id = intParam((await params).id);
  const { availability } = schema.parse(await req.json());
  const r = await withTransaction(s.username, (c) => c.query(
    `UPDATE room SET availability = $2
      WHERE room_id = $1 AND availability <> 'Occupied' RETURNING room_id`, [id, availability]));
  if (!r.rowCount) throw new HttpError(409, "Room is occupied or does not exist");
  return { ok: true };
});
