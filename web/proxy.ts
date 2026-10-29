import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Runs before page routes: unauthenticated visitors are sent to /login.
// (API routes do their own, stricter role check with requireRole().)
export async function proxy(req: NextRequest) {
  const token = req.cookies.get("hms_session")?.value;
  let valid = false;
  if (token && process.env.JWT_SECRET) {
    try { await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET)); valid = true; } catch {}
  }
  const { pathname } = req.nextUrl;
  if (pathname === "/login") {
    return valid ? NextResponse.redirect(new URL("/dashboard", req.url)) : NextResponse.next();
  }
  if (!valid) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
