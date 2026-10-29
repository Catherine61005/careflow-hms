import bcrypt from "bcryptjs";
import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { userSchema } from "@/lib/validators";

export const GET = api(async () => {
  await requireRole("admin");
  const rows = await query(`
    SELECT u.user_id, u.username, u.full_name, u.role, u.is_active, u.created_at, u.doctor_id, d.name AS doctor_name
      FROM app_user u LEFT JOIN doctor d ON d.doctor_id = u.doctor_id
     ORDER BY u.role, u.username`);
  return { rows };
});

export const POST = api(async (req) => {
  const s = await requireRole("admin");
  const u = userSchema.parse(await req.json());
  const hash = await bcrypt.hash(u.password, 10);
  const row = await withTransaction(s.username, async (c) => (await c.query(
    `INSERT INTO app_user (username, password_hash, full_name, role, doctor_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
    [u.username, hash, u.full_name, u.role, u.role === "doctor" ? u.doctor_id ?? null : null])).rows[0]);
  return Response.json(row, { status: 201 });
});
