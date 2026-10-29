import { api, intParam } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { dischargeSchema } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

// CALL the stored procedure: closes admission + allocations, frees room, generates bill
export const POST = api<Ctx>(async (req, { params }) => {
  const s = await requireRole("admin", "receptionist");
  const id = intParam((await params).id);
  const body = dischargeSchema.parse(await req.json().catch(() => ({})));
  const billId = await withTransaction(s.username, async (c) => {
    const r = await c.query<{ p_bill_id: number }>(
      "CALL sp_discharge_patient($1, COALESCE($2::date, CURRENT_DATE), NULL)", [id, body.discharge_date ?? null]);
    return r.rows[0].p_bill_id;
  });
  return { bill_id: billId };
});
