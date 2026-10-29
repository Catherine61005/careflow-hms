import { z } from "zod";
import bcrypt from "bcryptjs";
import { api, intParam, HttpError } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { withTransaction } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ is_active: z.boolean().optional(), password: z.string().min(8).max(72).optional() });

export const PATCH = api<Ctx>(async (req, { params }) => {
  const s = await requireRole("admin");
  const id = intParam((await params).id);
  const body = schema.parse(await req.json());
  if (id === s.uid && body.is_active === false) throw new HttpError(400, "You cannot deactivate yourself");
  const hash = body.password ? await bcrypt.hash(body.password, 10) : null;
  const r = await withTransaction(s.username, (c) => c.query(
    `UPDATE app_user SET is_active = COALESCE($2, is_active), password_hash = COALESCE($3, password_hash)
      WHERE user_id = $1 RETURNING user_id`, [id, body.is_active ?? null, hash]));
  if (!r.rowCount) throw new HttpError(404, "User not found");
  return { ok: true };
});
