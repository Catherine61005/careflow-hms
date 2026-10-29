import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { queryOne } from "./db";
import { HttpError } from "./http";

export type Role = "admin" | "receptionist" | "doctor";
export interface Session {
  uid: number;
  username: string;
  name: string;
  role: Role;
  doctorId: number | null;
}

export const SESSION_COOKIE = "hms_session";
const MAX_AGE = 60 * 60 * 8; // 8-hour shift

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET must be set (>= 16 chars)");
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifyToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

/** Current session from the cookie, re-checked against the DB (deactivated users lose access immediately). */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const s = await verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const row = await queryOne<{ is_active: boolean; role: Role }>(
    "SELECT is_active, role FROM app_user WHERE user_id = $1", [s.uid]);
  if (!row || !row.is_active || row.role !== s.role) return null;
  return s;
}

/** Backend authorisation gate used by every API route. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Not signed in");
  if (roles.length && !roles.includes(s.role)) {
    throw new HttpError(403, `Role '${s.role}' is not allowed to do this`);
  }
  return s;
}
