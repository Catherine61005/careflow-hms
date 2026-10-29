import { api, intParam, HttpError } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { queryOne, withTransaction } from "@/lib/db";
import { appointmentStatusSchema } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api<Ctx>(async (req, { params }) => {
  const s = await requireRole("admin", "receptionist", "doctor");
  const id = intParam((await params).id);
  const { status } = appointmentStatusSchema.parse(await req.json());

  const appt = await queryOne<{ doctor_id: number; status: string }>(
    "SELECT doctor_id, status FROM appointment WHERE appointment_id = $1", [id]);
  if (!appt) throw new HttpError(404, "Appointment not found");
  if (s.role === "doctor") {
    if (appt.doctor_id !== s.doctorId) throw new HttpError(403, "Not your appointment");
    if (!["Completed", "No-Show"].includes(status)) throw new HttpError(403, "Doctors can only complete or mark no-show");
  }
  if (appt.status !== "Scheduled") throw new HttpError(409, `Appointment is already ${appt.status}`);

  await withTransaction(s.username, (c) =>
    c.query("UPDATE appointment SET status = $2 WHERE appointment_id = $1", [id, status]));
  return { ok: true };
});
