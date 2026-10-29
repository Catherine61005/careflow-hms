import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { queryOne } from "@/lib/db";
import { api, HttpError } from "@/lib/http";
import { signSession, cookieOptions, SESSION_COOKIE, Role } from "@/lib/auth";

const schema = z.object({ username: z.string().trim().toLowerCase().min(1), password: z.string().min(1) });

export const POST = api(async (req) => {
  const { username, password } = schema.parse(await req.json());
  const u = await queryOne<{ user_id: number; username: string; full_name: string; role: Role;
                             doctor_id: number | null; password_hash: string; is_active: boolean }>(
    "SELECT user_id, username, full_name, role, doctor_id, password_hash, is_active FROM app_user WHERE username = $1",
    [username]);
  // Same message for unknown user / wrong password (no user enumeration)
  if (!u || !u.is_active || !(await bcrypt.compare(password, u.password_hash))) {
    throw new HttpError(401, "Invalid username or password");
  }
  const session = { uid: u.user_id, username: u.username, name: u.full_name, role: u.role, doctorId: u.doctor_id };
  const res = NextResponse.json({ user: session });
  res.cookies.set(SESSION_COOKIE, await signSession(session), cookieOptions);
  return res;
});
