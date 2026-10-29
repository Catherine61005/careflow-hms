import { api, intParam } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { paymentSchema } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api<Ctx>(async (_req, { params }) => {
  await requireRole("admin", "receptionist");
  const id = intParam((await params).id);
  return { rows: await query("SELECT * FROM payment WHERE bill_id = $1 ORDER BY payment_date, payment_id", [id]) };
});

// Overpayment / paying a settled bill is rejected by trg_payment_validate (row lock on bill);
// bill status is updated by trg_payment_status - the app never computes it.
export const POST = api<Ctx>(async (req, { params }) => {
  const s = await requireRole("admin", "receptionist");
  const id = intParam((await params).id);
  const p = paymentSchema.parse(await req.json());
  const row = await withTransaction(s.username, async (c) => {
    const ins = await c.query("INSERT INTO payment (bill_id, amount, payment_method) VALUES ($1, $2, $3) RETURNING payment_id",
      [id, p.amount, p.payment_method]);
    const bill = await c.query("SELECT status, outstanding FROM v_bill_status WHERE bill_id = $1", [id]);
    return { ...ins.rows[0], ...bill.rows[0] };
  });
  return Response.json(row, { status: 201 });
});
