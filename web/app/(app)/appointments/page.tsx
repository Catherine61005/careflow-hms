"use client";
import Link from "next/link";
import { useState } from "react";
import { useFetch, api, fdt, Badge, useSession, Modal, PatientPicker, useNotice } from "@/components/client";

export default function Appointments() {
  const s = useSession();
  const [doctor, setDoctor] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [booking, setBooking] = useState(false);
  const { run, node } = useNotice();
  const doctors = useFetch(s.role === "doctor" ? null : "/api/doctors");
  const { data, reload } = useFetch(`/api/appointments?${new URLSearchParams({ doctor_id: doctor, date, status })}`);

  const setStat = (id: number, st: string) =>
    run(() => api(`/api/appointments/${id}`, { method: "PATCH", body: { status: st } }), `Marked ${st}`).then(reload);

  return (
    <>
      <div className="spread">
        <div><h1>{s.role === "doctor" ? "My appointments" : "Appointments"}</h1>
          <p className="sub" style={{ margin: 0 }}>Double booking is blocked by an exclusion constraint on (doctor, 30-minute slot).</p></div>
        {s.role !== "doctor" && <button className="btn" onClick={() => setBooking(true)}>+ Book appointment</button>}
      </div>
      {node}
      <div className="card">
        <div className="filters">
          {s.role !== "doctor" && <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            <option value="">All doctors</option>
            {doctors.data?.rows.map((d: any) => <option key={d.doctor_id} value={d.doctor_id}>{d.name} ({d.department_name})</option>)}
          </select>}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option><option>Scheduled</option><option>Completed</option><option>Cancelled</option><option>No-Show</option></select>
          {(doctor || date || status) && <button className="btn ghost sm" onClick={() => { setDoctor(""); setDate(""); setStatus(""); }}>Clear</button>}
        </div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>When</th><th>Patient</th><th>Doctor</th><th>Complaint</th><th>Status</th><th></th></tr></thead>
          <tbody>{data?.rows.map((a: any) => (
            <tr key={a.appointment_id}>
              <td>{fdt(a.appointment_date)}</td>
              <td><Link href={`/patients/${a.patient_id}`}>{a.patient_name}</Link><br /><span className="small muted">{a.phone_number}</span></td>
              <td>{a.doctor_name}<br /><span className="small muted">{a.department_name}</span></td>
              <td className="small">{a.symptoms}</td>
              <td><Badge s={a.status} /></td>
              <td>{a.status === "Scheduled" && <div className="row">
                {s.role === "doctor"
                  ? <><button className="btn sm" onClick={() => setStat(a.appointment_id, "Completed")}>Complete</button>
                      <button className="btn ghost sm" onClick={() => setStat(a.appointment_id, "No-Show")}>No-show</button></>
                  : <button className="btn danger sm" onClick={() => setStat(a.appointment_id, "Cancelled")}>Cancel</button>}
              </div>}</td>
            </tr>))}</tbody></table></div>
      </div>
      {booking && <BookForm doctors={doctors.data?.rows ?? []} onClose={() => setBooking(false)} onSaved={() => { setBooking(false); reload(); }} />}
    </>
  );
}

function BookForm({ doctors, onClose, onSaved }: { doctors: any[]; onClose: () => void; onSaved: () => void }) {
  const [patient, setPatient] = useState<number | null>(null);
  const [doctor, setDoctor] = useState("");
  const [when, setWhen] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const { run, node } = useNotice();
  async function save() {
    if (await run(() => api("/api/appointments", { body: { patient_id: patient, doctor_id: Number(doctor), appointment_date: when, symptoms } }), "Booked"))
      onSaved();
  }
  return (
    <Modal title="Book appointment" onClose={onClose}>
      {node}
      <div className="stack">
        <div><label>Patient</label><PatientPicker value={patient} onChange={(id) => setPatient(id)} /></div>
        <div className="fields">
          <div><label>Doctor</label><select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            <option value="">Select...</option>
            {doctors.map((d) => <option key={d.doctor_id} value={d.doctor_id}>{d.name} - {d.department_name} ({d.upcoming_7d} this week)</option>)}
          </select></div>
          <div><label>Date & time</label><input type="datetime-local" step={1800} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        </div>
        <div><label>Presenting complaint</label><textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} /></div>
        <button className="btn" disabled={!patient || !doctor || !when} onClick={save}>Book</button>
      </div>
    </Modal>
  );
}
