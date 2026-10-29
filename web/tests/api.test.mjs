// End-to-end API tests: run against a running server (npm run dev / npm start).
//   npm test                       (BASE_URL defaults to http://localhost:3000)
// NOTE: creates real rows (a test patient, admission, bill...). Use a dev database.
import { test, before } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DOCTOR_USER = process.env.TEST_DOCTOR || "dr.arjun1";

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  return { status: r.status, cookie, body: await r.json() };
}
function client(cookie) {
  return async (method, path, body) => {
    const r = await fetch(`${BASE}${path}`, {
      method, headers: { Cookie: cookie || "", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
const futureSlot = (days, hour) => {
  const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`;
};

let admin, rec, doc, anon, me = {};
before(async () => {
  admin = client((await login("admin", "Admin@123")).cookie);
  rec = client((await login("reception", "Reception@123")).cookie);
  const d = await login(DOCTOR_USER, "Doctor@123");
  doc = client(d.cookie); me.doctorId = d.body.user?.doctorId;
  anon = client("");
});

// ---------------------------------------------------------------- authentication
test("API01 wrong password is rejected with 401 and a generic message", async () => {
  const r = await login("reception", "wrong-password");
  assert.equal(r.status, 401);
  assert.equal(r.body.error, "Invalid username or password");
});
test("API02 unknown user gets the same generic message (no user enumeration)", async () => {
  const r = await login("nobody_here", "x");
  assert.equal(r.status, 401);
  assert.equal(r.body.error, "Invalid username or password");
});
test("API03 unauthenticated request to a protected API returns 401", async () => {
  assert.equal((await anon("GET", "/api/patients")).status, 401);
});

// ---------------------------------------------------------------- authorization (RBAC)
test("API04 receptionist cannot open admin user management (403)", async () => {
  assert.equal((await rec("GET", "/api/admin/users")).status, 403);
});
test("API05 doctor cannot view billing (403)", async () => {
  assert.equal((await doc("GET", "/api/bills")).status, 403);
});
test("API06 doctor cannot register patients (403)", async () => {
  assert.equal((await doc("POST", "/api/patients", {})).status, 403);
});
test("API07 receptionist cannot write prescriptions (403)", async () => {
  assert.equal((await rec("POST", "/api/prescriptions", {})).status, 403);
});
test("API08 doctor sees only their own appointments", async () => {
  const r = await doc("GET", "/api/appointments");
  assert.equal(r.status, 200);
  assert.ok(r.body.rows.every((a) => a.doctor_id === me.doctorId));
});

// ---------------------------------------------------------------- patients + validation
let patientId;
test("API09 receptionist registers a valid patient (201)", async () => {
  const r = await rec("POST", "/api/patients", { first_name: "Test", last_name: "Patient", gender: "Female",
    date_of_birth: "1990-05-10", phone_number: "9876500001", email: "test.patient@example.com" });
  assert.equal(r.status, 201);
  patientId = r.body.patient_id;
});
test("API10 invalid phone rejected by API validation (400)", async () => {
  const r = await rec("POST", "/api/patients", { first_name: "Bad", last_name: "Phone", gender: "Male",
    date_of_birth: "1990-01-01", phone_number: "12ab" });
  assert.equal(r.status, 400);
});
test("API11 future date of birth passes API but is rejected by the DATABASE trigger (400)", async () => {
  const r = await rec("POST", "/api/patients", { first_name: "Future", last_name: "Baby", gender: "Male",
    date_of_birth: "2099-01-01", phone_number: "9876500002" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /future/);
});
test("API12 SQL-injection text in search is treated as data", async () => {
  const before = (await rec("GET", "/api/patients")).body.total;
  const r = await rec("GET", `/api/patients?q=${encodeURIComponent("x'; DROP TABLE hms.patient; --")}`);
  assert.equal(r.status, 200);
  assert.equal((await rec("GET", "/api/patients")).body.total, before);
});
test("API13 fuzzy search finds the patient despite a typo", async () => {
  const r = await rec("GET", `/api/patients?q=${encodeURIComponent("Tset Patient")}`);
  assert.ok(r.body.rows.some((p) => p.patient_id === patientId));
});

// ---------------------------------------------------------------- appointments
test("API14 booking + double-booking the same 30-min slot returns 409 (EXCLUDE constraint)", async () => {
  // random far-future slot so the suite can be re-run against the same database
  const when = futureSlot(30 + Math.floor(Math.random() * 300), 9 + Math.floor(Math.random() * 8));
  const ok = await rec("POST", "/api/appointments", { patient_id: patientId, doctor_id: me.doctorId, appointment_date: when, symptoms: "check-up" });
  assert.equal(ok.status, 201);
  const clash = await rec("POST", "/api/appointments", { patient_id: 1, doctor_id: me.doctorId, appointment_date: when.replace(":00", ":15") });
  assert.equal(clash.status, 409);
  assert.match(clash.body.error, /30-minute slot/);
});
test("API15 booking in the past is rejected (trigger, 400)", async () => {
  const r = await rec("POST", "/api/appointments", { patient_id: patientId, doctor_id: me.doctorId, appointment_date: "2020-01-01T10:00" });
  assert.equal(r.status, 400);
});

// ---------------------------------------------------------------- admission -> discharge -> billing
let admissionId, billId, roomId;
test("API16 admit patient (transaction) marks the room Occupied", async () => {
  const rooms = await rec("GET", "/api/rooms?availability=Available");
  roomId = rooms.body.rows.find((r) => r.room_type === "General").room_id;
  const r = await rec("POST", "/api/admissions", { patient_id: patientId, doctor_id: me.doctorId, room_id: roomId,
    reason: "Severe chest pain radiating to the jaw with sweating" });
  assert.equal(r.status, 201);
  admissionId = r.body.admission_id;
  const after = await rec("GET", "/api/rooms");
  assert.equal(after.body.rows.find((x) => x.room_id === roomId).availability, "Occupied");
});
test("API17 admitting an already-admitted patient returns 409", async () => {
  const free = (await rec("GET", "/api/rooms?availability=Available")).body.rows[0].room_id;
  const r = await rec("POST", "/api/admissions", { patient_id: patientId, doctor_id: me.doctorId, room_id: free, reason: "Duplicate admission" });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /already admitted/);
});
test("API18 admitting someone into the occupied room returns 409", async () => {
  const r = await rec("POST", "/api/admissions", { patient_id: 2, doctor_id: me.doctorId, room_id: roomId, reason: "Room clash test" });
  assert.equal(r.status, 409);
});
test("API19 discharge calls the stored procedure, frees the room and generates a bill", async () => {
  const r = await rec("POST", `/api/admissions/${admissionId}/discharge`, {});
  assert.equal(r.status, 200);
  billId = r.body.bill_id;
  assert.ok(billId);
  const rooms = await rec("GET", "/api/rooms");
  assert.equal(rooms.body.rows.find((x) => x.room_id === roomId).availability, "Available");
});
test("API20 overpayment is rejected by the database trigger", async () => {
  const bill = (await rec("GET", `/api/bills?q=${billId}`)).body.rows.find((b) => b.bill_id === billId);
  const r = await rec("POST", `/api/bills/${billId}/payments`, { amount: Number(bill.total_amount) + 1, payment_method: "UPI" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /exceeds outstanding/);
});
test("API21 partial then full payment moves bill Unpaid -> Partially Paid -> Paid", async () => {
  const bill = (await rec("GET", `/api/bills?q=${billId}`)).body.rows.find((b) => b.bill_id === billId);
  const half = Math.round(Number(bill.total_amount) / 2);
  const p1 = await rec("POST", `/api/bills/${billId}/payments`, { amount: half, payment_method: "Card" });
  assert.equal(p1.body.status, "Partially Paid");
  const p2 = await rec("POST", `/api/bills/${billId}/payments`, { amount: Number(bill.total_amount) - half, payment_method: "Cash" });
  assert.equal(p2.body.status, "Paid");
});

// ---------------------------------------------------------------- clinical
test("API22 prescription with a duplicate medicine rolls back completely (409)", async () => {
  const before = (await doc("GET", `/api/prescriptions?patient_id=${patientId}`)).body.rows.length;
  const m = { medicine_name: "Aspirin", dosage: "75 mg", frequency: "0-0-1", duration: "30 days" };
  const r = await doc("POST", "/api/prescriptions", { patient_id: patientId, medications: [m, m] });
  assert.equal(r.status, 409);
  const after = (await doc("GET", `/api/prescriptions?patient_id=${patientId}`)).body.rows.length;
  assert.equal(after, before, "no orphan prescription header after rollback");
});
test("API23 valid multi-medicine prescription is saved (201)", async () => {
  const r = await doc("POST", "/api/prescriptions", { patient_id: patientId, medications: [
    { medicine_name: "Aspirin", dosage: "75 mg", frequency: "0-0-1", duration: "30 days" },
    { medicine_name: "Atorvastatin", dosage: "20 mg", frequency: "0-0-1", duration: "30 days" }] });
  assert.equal(r.status, 201);
});
test("API24 entering a lab result completes the test and flags abnormal values", async () => {
  const t = await doc("POST", "/api/tests", { patient_id: patientId, test_name: "Fasting Blood Sugar" });
  assert.equal(t.status, 201);
  const r = await doc("POST", `/api/tests/${t.body.test_id}/results`,
    { results: [{ result_value: "182", units: "mg/dL", reference_range: "70-110" }] });
  assert.equal(r.status, 201);
  const list = await doc("GET", `/api/tests?patient_id=${patientId}`);
  const row = list.body.rows.find((x) => x.test_id === t.body.test_id);
  assert.equal(row.status, "Completed");
  assert.equal(row.has_abnormal, true);
});

// ---------------------------------------------------------------- vector search
test("API25 semantic triage routes a cardiac complaint to Cardiology with zero keyword overlap", async () => {
  const r = await rec("POST", "/api/triage", { text: "my chest feels heavy and the pain goes into my left arm" });
  assert.equal(r.status, 200);
  assert.equal(r.body.recommendations[0].department_name, "Cardiology");
  assert.ok(r.body.semantic.length > 0);
});
test("API26 semantic triage routes a paediatric seizure to Pediatrics/Neurology", async () => {
  const r = await rec("POST", "/api/triage", { text: "my little boy shook all over when his temperature went very high" });
  assert.ok(["Pediatrics", "Neurology"].includes(r.body.recommendations[0].department_name));
});
test("API27 new admission was embedded automatically and has similar cases", async () => {
  await new Promise((res) => setTimeout(res, 1500));
  const r = await rec("GET", `/api/admissions/${admissionId}/similar`);
  assert.equal(r.status, 200);
  assert.ok(r.body.rows.length > 0);
});

// ---------------------------------------------------------------- audit + account lifecycle
test("API28 audit log records who made the change", async () => {
  const r = await admin("GET", "/api/admin/audit?table=payment");
  assert.ok(r.body.rows.some((a) => a.changed_by === "reception"));
});
test("API29 disabling a user invalidates their existing session immediately", async () => {
  const uname = `temp_${Date.now()}`;
  const created = await admin("POST", "/api/admin/users", { username: uname, full_name: "Temp User", role: "receptionist", password: "TempPass@1" });
  assert.equal(created.status, 201);
  const temp = client((await login(uname, "TempPass@1")).cookie);
  assert.equal((await temp("GET", "/api/patients")).status, 200);
  await admin("PATCH", `/api/admin/users/${created.body.user_id}`, { is_active: false });
  assert.equal((await temp("GET", "/api/patients")).status, 401);
});
