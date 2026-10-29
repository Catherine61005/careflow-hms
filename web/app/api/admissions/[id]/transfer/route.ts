import { api, intParam } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { transferSchema } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api<Ctx>(async (req, { params }) => {
  const s = await requireRole("admin", "receptionist");
  const id = intParam((await params).id);
  const { room_id } = transferSchema.parse(await req.json());
  const allocation = await withTransaction(s.username, async (c) =>
    (await c.query<{ id: number }>("SELECT fn_transfer_room($1, $2) AS id", [id, room_id])).rows[0].id);
  return { allocation_id: allocation };
});
