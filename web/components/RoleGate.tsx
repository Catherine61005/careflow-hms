"use client";
import type { Role } from "@/lib/auth";
import { useSession } from "./client";

/** UI-level guard; the API independently returns 403 for the same roles. */
export default function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const s = useSession();
  if (!roles.includes(s.role)) {
    return <div className="card"><h2>Not permitted</h2><p className="muted">Your role ({s.role}) cannot open this page.</p></div>;
  }
  return <>{children}</>;
}
