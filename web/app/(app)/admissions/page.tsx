"use client";
import Link from "next/link";
import { useState } from "react";
import { useFetch, api, fdate, inr, Badge, useSession, Modal, PatientPicker, useNotice } from "@/components/client";

export default function Admissions() {
  const s = useSession();
  const [active, setActive] = useState("true");
  const [q, setQ] = useState("");
  const [admitting, setAdmitting] = useState(false);
  const [transfer, setTransfer] = useState<any>(null);
  const [similar, setSimilar] = useState<any>(null);
  const { run, node } = useNotice();
  const { data, reload } = useFetch(`/api/admissions?${new URLSearchParams({ active, q })}`);
  const canManage = s.role !== "doctor";

  async function discharge(a: any) {
    if (!confirm(`Discharge ${a.patient_name} today and generate the bill?`)) return;
    await run(async () => {
      const r = await api(`/api/admissions/${a.admission_id}/discharge`, { body: {} });
      return r;
    }, `Discharged - bill generated (procedure sp_discharge_patient).`);
    reload();
  }

  return (
    <>
      <div className="spread">
        <div><h1>Admissions</h1><p className="sub" style={{ margin: 0 }}>Admit, transfer and discharge run as database transactions.</p></div>
        {canManage && <button className="btn" onClick={() => setAdmitting(true)}>+ Admit patient</button>}
      </div>
      {node}
      <div className="card">
        <div className="filters">
          <select value={active} onChange={(e) => setActive(e.target.value)}>
            <option value="true">Currently admitted</option><option value="false">Discharged</option><option value="">All</option></select>
          <input placeholder="Search reason (full-text)" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        </div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>#</th><th>Patient</th><th>Reason</th><th>Doctor</th><th>Room</th><th>Admitted</th><th className="num">Days</th><th className="num">Amount</th><th></th></tr></thead>
          <tbody>{data?.rows.map((a: any) => (
            <tr key={a.admission_id}>
              <td>{a.admission_id}</td>
              <td><Link href={`/patients/${a.patient_id}`}>{a.patient_name}</Link></td>
              <td style={{ maxWidth: 280 }}>{a.reason}</td>
              <td>{a.doctor_name}<br /><span className="small muted">{a.department_name}</span></td>
              <td>{a.room_number}<br /><span className="small muted">{a.room_type}</span></td>
              <td>{fdate(a.admission_date)}{a.discharge_date && <><br /><span className="small muted">out {fdate(a.discharge_date)}</span></>}</td>
              <td className="num">{a.days}</td>
              <td className="num">{inr(a.amount)}<br />{a.bill_status ? <Badge s={a.bill_status} /> : <span className="small muted">running</span>}</td>
              <td><div className="row">
                <button className="btn ghost sm" onClick={() => setSimilar(a)}>Similar cases</button>
                {canManage && !a.discharge_date && <>
                  <button className="btn ghost sm" onClick={() => setTransfer(a)}>Transfer</button>
                  <button className="btn sm" onClick={() => discharge(a)}>Discharge</button></>}
              </div></td>
            </tr>))}</tbody></table></div>
      </div>
      {admitting && <AdmitForm onClose={() => setAdmitting(false)} onSaved={() => { setAdmitting(false); reload(); }} />}
      {transfer && <TransferForm adm={transfer} onClose={() => setTransfer(null)} onSaved={() => { setTransfer(null); reload(); }} />}
      {similar && <SimilarCases adm={similar} onClose={() => setSimilar(null)} />}
    </>
  );
}

function AdmitForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [patient, setPatient] = useState<number | null>(null);
  const [doctor, setDoctor] = useState("");
  const [room, setRoom] = useState("");
  const [reason, setReason] = useState("");
  const doctors = useFetch("/api/doctors");
  const rooms = useFetch("/api/rooms?availability=Available");
  const { run, node } = useNotice();
  async function save() {
    if (await run(() => api("/api/admissions", { body: { patient_id: patient, doctor_id: Number(doctor), room_id: Number(room), reason } }), "Admitted"))
      onSaved();
  }
  return (
    <Modal title="Admit patient" onClose={onClose}>
      {node}
      <div className="stack">
        <div><label>Patient</label><PatientPicker value={patient} onChange={(id) => setPatient(id)} /></div>
        <div><label>Reason for admission</label><textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="fields">
          <div><label>Admitting doctor</label><select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            <option value="">Select...</option>
            {doctors.data?.rows.map((d: any) => <option key={d.doctor_id} value={d.doctor_id}>{d.name} - {d.department_name}</option>)}</select></div>
          <div><label>Room (available only)</label><select value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">Select...</option>
            {rooms.data?.rows.map((r: any) => <option key={r.room_id} value={r.room_id}>{r.room_number} - {r.room_type} ({inr(r.charge_per_day)}/day)</option>)}</select></div>
        </div>
        <button className="btn" disabled={!patient || !doctor || !room || reason.trim().length < 5} onClick={save}>Admit</button>
        <p className="small muted">fn_admit_patient locks the room row (SELECT ... FOR UPDATE), inserts the admission and allocation atomically; the
          reason is then embedded into the vector store for future triage.</p>
      </div>
    </Modal>
  );
}

function TransferForm({ adm, onClose, onSaved }: { adm: any; onClose: () => void; onSaved: () => void }) {
  const [room, setRoom] = useState("");
  const rooms = useFetch("/api/rooms?availability=Available");
  const { run, node } = useNotice();
  return (
    <Modal title={`Transfer ${adm.patient_name}`} onClose={onClose}>
      {node}
      <p className="muted">Currently in {adm.room_number} ({adm.room_type})</p>
      <select value={room} onChange={(e) => setRoom(e.target.value)}>
        <option value="">Select new room...</option>
        {rooms.data?.rows.map((r: any) => <option key={r.room_id} value={r.room_id}>{r.room_number} - {r.room_type} ({inr(r.charge_per_day)}/day)</option>)}
      </select>
      <div style={{ marginTop: 12 }}><button className="btn" disabled={!room} onClick={async () => {
        if (await run(() => api(`/api/admissions/${adm.admission_id}/transfer`, { body: { room_id: Number(room) } }), "Transferred")) onSaved();
      }}>Transfer</button></div>
    </Modal>
  );
}

function SimilarCases({ adm, onClose }: { adm: any; onClose: () => void }) {
  const { data, error } = useFetch(`/api/admissions/${adm.admission_id}/similar`);
  return (
    <Modal title="Similar past cases" onClose={onClose}>
      <p className="muted">Nearest neighbours of: <b>{adm.reason}</b></p>
      {error && <div className="alert err">{error}</div>}
      {data?.stats && <div className="row" style={{ marginBottom: 10 }}>
        <span className="badge b-brand">Typical stay {data.stats.avg_stay} days</span>
        <span className="badge b-brand">Typical bill {inr(data.stats.avg_bill)}</span></div>}
      <table><thead><tr><th>Reason</th><th>Dept</th><th className="num">Stay</th><th className="num">Sim.</th></tr></thead>
        <tbody>{data?.rows.map((r: any) => (
          <tr key={r.admission_id}><td>{r.reason}</td><td className="small">{r.department_name}</td><td className="num">{r.stay_days}d</td>
            <td className="num sim">{r.similarity.toFixed(2)}</td></tr>))}</tbody></table>
    </Modal>
  );
}
