"use client";
import Link from "next/link";
import { useState } from "react";
import { useFetch, api, fdate, Badge, useSession, Modal, PatientPicker, useNotice } from "@/components/client";
import RoleGate from "@/components/RoleGate";

const TEST_CATALOG: Record<string, [string, string, string][]> = {
  "Complete Blood Count": [["Haemoglobin", "g/dL", "12-16"], ["WBC Count", "x10^3/uL", "4-11"], ["Platelets", "x10^3/uL", "150-450"]],
  "Fasting Blood Sugar": [["Glucose (Fasting)", "mg/dL", "70-110"]],
  "Lipid Profile": [["Total Cholesterol", "mg/dL", "125-200"], ["LDL", "mg/dL", "50-130"]],
  "Renal Function Test": [["Serum Creatinine", "mg/dL", "0.6-1.2"], ["Blood Urea", "mg/dL", "15-40"]],
  "Liver Function Test": [["Total Bilirubin", "mg/dL", "0.2-1.2"], ["SGPT (ALT)", "U/L", "7-56"]],
  "Troponin I": [["Troponin I", "ng/mL", "0-0.04"]],
  "Dengue NS1 Antigen": [["NS1 Antigen", "", "Negative"]],
  "HbA1c": [["HbA1c", "%", "4-5.6"]],
};

export default function Clinical() {
  const [tab, setTab] = useState<"labs" | "rx">("labs");
  return (
    <RoleGate roles={["admin", "doctor"]}>
      <h1>Prescriptions & Labs</h1>
      <p className="sub">Recording a result auto-completes the test (trigger); abnormal values are flagged by <span className="mono">fn_is_abnormal()</span>.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`btn sm ${tab === "labs" ? "" : "ghost"}`} onClick={() => setTab("labs")}>Lab tests</button>
        <button className={`btn sm ${tab === "rx" ? "" : "ghost"}`} onClick={() => setTab("rx")}>Prescriptions</button>
      </div>
      {tab === "labs" ? <Labs /> : <Prescriptions />}
    </RoleGate>
  );
}

function Labs() {
  const s = useSession();
  const [status, setStatus] = useState("");
  const [abnormal, setAbnormal] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [entering, setEntering] = useState<any>(null);
  const { data, reload } = useFetch(`/api/tests?${new URLSearchParams({ status, abnormal: String(abnormal) })}`);
  return (
    <div className="card">
      <div className="spread">
        <div className="filters" style={{ margin: 0 }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option><option>Ordered</option><option>In Progress</option><option>Completed</option><option>Cancelled</option></select>
          <label className="row" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={abnormal} onChange={(e) => setAbnormal(e.target.checked)} /> Abnormal only</label>
        </div>
        {s.role === "doctor" && <button className="btn" onClick={() => setOrdering(true)}>+ Order test</button>}
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Date</th><th>Patient</th><th>Test</th><th>Doctor</th><th>Status</th><th>Results</th><th></th></tr></thead>
        <tbody>{data?.rows.map((t: any) => (
          <tr key={t.test_id}>
            <td>{fdate(t.test_date)}</td>
            <td><Link href={`/patients/${t.patient_id}`}>{t.patient_name}</Link></td>
            <td>{t.test_name}</td><td className="small">{t.doctor_name}</td><td><Badge s={t.status} /></td>
            <td>{(t.results ?? []).map((r: any, i: number) => (
              <div key={i} className="small"><span className={`badge ${r.is_abnormal ? "b-danger" : "b-ok"}`}>{r.result_value} {r.units}</span> <span className="muted">({r.reference_range})</span></div>))}</td>
            <td>{["Ordered", "In Progress"].includes(t.status) && <button className="btn sm" onClick={() => setEntering(t)}>Enter results</button>}</td>
          </tr>))}</tbody></table></div>
      {ordering && <OrderTest onClose={() => setOrdering(false)} onSaved={() => { setOrdering(false); reload(); }} />}
      {entering && <EnterResults test={entering} onClose={() => setEntering(null)} onSaved={() => { setEntering(null); reload(); }} />}
    </div>
  );
}

function OrderTest({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [patient, setPatient] = useState<number | null>(null);
  const [name, setName] = useState(Object.keys(TEST_CATALOG)[0]);
  const { run, node } = useNotice();
  return (
    <Modal title="Order lab test" onClose={onClose}>
      {node}
      <div className="stack">
        <div><label>Patient</label><PatientPicker value={patient} onChange={(id) => setPatient(id)} /></div>
        <div><label>Test</label><select value={name} onChange={(e) => setName(e.target.value)}>
          {Object.keys(TEST_CATALOG).map((t) => <option key={t}>{t}</option>)}</select></div>
        <button className="btn" disabled={!patient} onClick={async () => {
          if (await run(() => api("/api/tests", { body: { patient_id: patient, test_name: name } }), "Ordered")) onSaved();
        }}>Order</button>
      </div>
    </Modal>
  );
}

function EnterResults({ test, onClose, onSaved }: { test: any; onClose: () => void; onSaved: () => void }) {
  const params = TEST_CATALOG[test.test_name] ?? [["Result", "", ""]];
  const [vals, setVals] = useState<string[]>(params.map(() => ""));
  const { run, node } = useNotice();
  return (
    <Modal title={`${test.test_name} - ${test.patient_name}`} onClose={onClose}>
      {node}
      <table><thead><tr><th>Parameter</th><th>Value</th><th>Units</th><th>Reference</th></tr></thead>
        <tbody>{params.map(([p, u, r], i) => (
          <tr key={p}><td>{p}</td><td><input value={vals[i]} onChange={(e) => setVals(vals.map((v, j) => (j === i ? e.target.value : v)))} /></td>
            <td>{u}</td><td>{r}</td></tr>))}</tbody></table>
      <div style={{ marginTop: 12 }}><button className="btn" disabled={vals.some((v) => !v.trim())} onClick={async () => {
        const results = params.map(([, u, r], i) => ({ result_value: vals[i], units: u, reference_range: r }));
        if (await run(() => api(`/api/tests/${test.test_id}/results`, { body: { results } }), "Saved")) onSaved();
      }}>Save results</button></div>
    </Modal>
  );
}

function Prescriptions() {
  const s = useSession();
  const [writing, setWriting] = useState(false);
  const { data, reload } = useFetch("/api/prescriptions");
  return (
    <div className="card">
      <div className="spread"><h2 style={{ margin: 0 }}>{s.role === "doctor" ? "My prescriptions" : "All prescriptions"}</h2>
        {s.role === "doctor" && <button className="btn" onClick={() => setWriting(true)}>+ New prescription</button>}</div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Date</th><th>Patient</th><th>Doctor</th><th>Medicines</th></tr></thead>
        <tbody>{data?.rows.map((p: any) => (
          <tr key={p.prescription_id}><td>{fdate(p.prescription_date)}</td>
            <td><Link href={`/patients/${p.patient_id}`}>{p.patient_name}</Link></td><td className="small">{p.doctor_name}</td>
            <td>{p.medications.filter((m: any) => m.medicine_name).map((m: any) => (
              <div key={m.medicine_name} className="small"><b>{m.medicine_name}</b> {m.dosage} · {m.frequency} · {m.duration}</div>))}</td></tr>))}
        </tbody></table></div>
      {writing && <WriteRx onClose={() => setWriting(false)} onSaved={() => { setWriting(false); reload(); }} />}
    </div>
  );
}

function WriteRx({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const blank = { medicine_name: "", dosage: "", frequency: "1-0-1", duration: "5 days" };
  const [patient, setPatient] = useState<number | null>(null);
  const [meds, setMeds] = useState([{ ...blank }]);
  const { run, node } = useNotice();
  const upd = (i: number, k: string, v: string) => setMeds(meds.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  return (
    <Modal title="New prescription" onClose={onClose}>
      {node}
      <label>Patient</label><PatientPicker value={patient} onChange={(id) => setPatient(id)} />
      <table style={{ marginTop: 12 }}><thead><tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th></th></tr></thead>
        <tbody>{meds.map((m, i) => (
          <tr key={i}>
            <td><input value={m.medicine_name} onChange={(e) => upd(i, "medicine_name", e.target.value)} /></td>
            <td><input value={m.dosage} onChange={(e) => upd(i, "dosage", e.target.value)} placeholder="500 mg" /></td>
            <td><input value={m.frequency} onChange={(e) => upd(i, "frequency", e.target.value)} /></td>
            <td><input value={m.duration} onChange={(e) => upd(i, "duration", e.target.value)} /></td>
            <td>{meds.length > 1 && <button className="btn ghost sm" onClick={() => setMeds(meds.filter((_, j) => j !== i))}>x</button>}</td>
          </tr>))}</tbody></table>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn ghost" onClick={() => setMeds([...meds, { ...blank }])}>+ Medicine</button>
        <button className="btn" disabled={!patient} onClick={async () => {
          if (await run(() => api("/api/prescriptions", { body: { patient_id: patient, medications: meds } }), "Saved")) onSaved();
        }}>Save prescription</button>
      </div>
      <p className="small muted">Header and all medicine rows are inserted in one transaction; a duplicate medicine violates the composite key and rolls everything back.</p>
    </Modal>
  );
}
