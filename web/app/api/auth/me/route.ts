import { api } from "@/lib/http";
import { requireRole } from "@/lib/auth";

export const GET = api(async () => ({ user: await requireRole() }));
