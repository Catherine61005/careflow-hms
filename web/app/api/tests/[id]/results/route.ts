import { api, intParam, HttpError } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { queryOne, withTransaction } from "@/lib/db";
import { resultSchema } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

// Record one or more parameters; trg_result_complete marks the test Completed
export const POST = api<Ctx>(async (req, { params }) => {
  const s = await requireRole("doctor", "admin");
  const id = intParam((await params).id);
  const { results } = resultSchema.parse(await req.json());
  const t = await queryOne<{ doctor_id: number }>("SELECT doctor_id FROM test WHERE test_id = $1", [id]);
  if (!t) throw new HttpError(404, "Test not found");
  if (s.role === "doctor" && t.doctor_id !== s.doctorId) throw new HttpError(403, "Not your test");
  await withTransaction(s.username, async (c) => {
    for (const r of results) {
      await c.query("INSERT INTO test_result (test_id, result_value, units, reference_range) VALUES ($1, $2, $3, $4)",
        [id, r.result_value, r.units || null, r.reference_range || null]);
    }
  });
  return Response.json({ ok: true }, { status: 201 });
});
