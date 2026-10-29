import { api, intParam, HttpError } from "@/lib/http";
import { requireRole } from "@/lib/auth";
import { query, queryOne, withTransaction } from "@/lib/db";
import { patientUpdateSchema } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

// Complete patient record: demographics + every related history table
export const GET = api<Ctx>(async (_req, { params }) => {
  const s = await requireRole();
  const id = intParam((await params).id);
  const patient = await queryOne(
    `SELECT v.*, p.email FROM v_patient_summary v JOIN patient p USING (patient_id) WHERE v.patient_id = $1`, [id]);
  if (!patient) throw new HttpError(404, "Patient not found");

  const [appointments, admissions, prescriptions, tests, bills] = await Promise.all([
    query(`SELECT a.appointment_id, a.appointment_date, a.status, a.symptoms, d.name AS doctor_name, dep.department_name
             FROM appointment a JOIN doctor d USING (doctor_id) JOIN department dep USING (department_id)
            WHERE a.patient_id = $1 ORDER BY a.appointment_date DESC`, [id]),
    query(`SELECT a.admission_id, a.admission_date, a.discharge_date, a.reason, d.name AS doctor_name,
                  string_agg(r.room_number || ' (' || r.room_type || ')', ' -> ' ORDER BY ra.from_date) AS rooms
             FROM admission a JOIN doctor d USING (doctor_id)
             LEFT JOIN room_allocation ra ON ra.admission_id = a.admission_id
             LEFT JOIN room r ON r.room_id = ra.room_id
            WHERE a.patient_id = $1 GROUP BY a.admission_id, d.name ORDER BY a.admission_date DESC`, [id]),
    query(`SELECT pr.prescription_id, pr.prescription_date, d.name AS doctor_name,
                  json_agg(json_build_object('medicine_name', m.medicine_name, 'dosage', m.dosage,
                           'frequency', m.frequency, 'duration', m.duration) ORDER BY m.medicine_name) AS medications
             FROM prescription pr JOIN doctor d USING (doctor_id)
             LEFT JOIN medication m ON m.prescription_id = pr.prescription_id
            WHERE pr.patient_id = $1 GROUP BY pr.prescription_id, d.name ORDER BY pr.prescription_date DESC`, [id]),
    query(`SELECT test_id, test_name, test_date, status, doctor_name,
                  json_agg(json_build_object('result_value', result_value, 'units', units,
                           'reference_range', reference_range, 'is_abnormal', is_abnormal))
                    FILTER (WHERE result_id IS NOT NULL) AS results
             FROM v_test_results WHERE patient_id = $1
            GROUP BY test_id, test_name, test_date, status, doctor_name ORDER BY test_date DESC`, [id]),
    s.role === "doctor" ? Promise.resolve([]) :
      query(`SELECT bill_id, bill_date, total_amount, amount_paid, outstanding, status, admission_id
               FROM v_bill_status WHERE patient_id = $1 ORDER BY bill_date DESC`, [id]),
  ]);
  return { patient, appointments, admissions, prescriptions, tests, bills };
});

export const PATCH = api<Ctx>(async (req, { params }) => {
  const s = await requireRole("admin", "receptionist");
  const id = intParam((await params).id);
  const body = patientUpdateSchema.parse(await req.json());
  const cols = Object.keys(body) as (keyof typeof body)[];
  if (!cols.length) throw new HttpError(400, "Nothing to update");
  // Column names come from the zod whitelist, values are bound parameters
  const set = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
  const row = await withTransaction(s.username, async (c) =>
    (await c.query(`UPDATE patient SET ${set} WHERE patient_id = $1 RETURNING patient_id`,
                   [id, ...cols.map((c) => body[c])])).rows[0]);
  if (!row) throw new HttpError(404, "Patient not found");
  return row;
});

export const DELETE = api<Ctx>(async (_req, { params }) => {
  const s = await requireRole("admin");
  const id = intParam((await params).id);
  // FK RESTRICT on admission/bill blocks deleting patients with financial/clinical stays
  await withTransaction(s.username, (c) => c.query("DELETE FROM patient WHERE patient_id = $1", [id]));
  return { ok: true };
});
