"use client";
import { useState } from "react";
import { api, fdt, useSession, Modal, PatientPicker, useNotice } from "@/components/client";

const EXAMPLES = [
  "my chest feels heavy and the pain goes into my left arm",
  "child had a fit with very high temperature",
  "slipped in the bathroom, can't put weight on my hip",
  "coughing blood and losing weight for two months",
  "skin around the wound is red, hot and spreading",
];

export default function Triage() {
  const s = useSession();
  const [text, setText] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [book, setBook] = useState<any>(null);

  async function run(t = text) {
    setBusy(true); setErr(null); setText(t);
    try { setRes(await api("/api/triage", { body: { text: t } })); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <h1>Smart Triage</h1>
      <p className="sub">Describe the complaint in plain words. The system finds semantically similar past cases
        (vector search) and recommends a department and the least-loaded doctor with a free slot.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <label>Presenting complaint</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. sudden weakness on one side and slurred speech" />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" disabled={busy || text.trim().length < 3} onClick={() => run()}>{busy ? "Analysing..." : "Find department"}</button>
          <span className="muted small">Try:</span>
          {EXAMPLES.map((e) => <button key={e} className="btn ghost sm" onClick={() => run(e)}>{e.slice(0, 32)}...</button>)}
        </div>
      </div>
      {err && <div className="alert err">{err}</div>}

      {res && (
        <>
          <div className="grid g3" style={{ marginBottom: 16 }}>
            {res.recommendations.map((r: any, i: number) => (
              <div className="reco card" key={r.department_id}>
                <div className="spread" style={{ marginBottom: 0 }}><b>{i + 1}. {r.department_name}</b><span className="sim">{r.confidence}%</span></div>
                <div className="conf"><div style={{ width: `${r.confidence}%` }} /></div>
                <div className="small muted" style={{ marginBottom: 8 }}>{r.evidence} of the 20 nearest records point here</div>
                {r.doctors.slice(0, 3).map((d: any) => (
                  <div key={d.doctor_id} className="row small" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                    <span><b>{d.name}</b><br /><span className="muted">{d.load_7d} booked this week · next {d.next_slot ? fdt(d.next_slot) : "none"}</span></span>
                    {s.role !== "doctor" && d.next_slot &&
                      <button className="btn sm" onClick={() => setBook({ ...d, department_name: r.department_name })}>Book</button>}
                  </div>))}
              </div>))}
          </div>

          <div className="grid g2">
            <div className="card">
              <h2>Semantic matches <span className="muted small">pgvector · cosine · {res.meta.embedMs} ms embed</span></h2>
              <table><thead><tr><th>Past admission reason</th><th>Department</th><th className="num">Similarity</th></tr></thead>
                <tbody>{res.semantic.map((h: any) => (
                  <tr key={h.source_id}><td>{h.content}</td><td>{h.department_name}</td><td className="num sim">{h.similarity.toFixed(3)}</td></tr>))}
                </tbody></table>
            </div>
            <div className="card">
              <h2>Keyword matches <span className="muted small">PostgreSQL full-text search</span></h2>
              {res.keyword.length === 0
                ? <p className="muted">No admission shares these exact words. Keyword search cannot see that
                    "heavy chest" and "angina" mean the same thing - this gap is why the project uses a vector store.</p>
                : <table><thead><tr><th>Admission reason</th><th>Department</th><th className="num">ts_rank</th></tr></thead>
                    <tbody>{res.keyword.map((h: any, i: number) => (
                      <tr key={i}><td>{h.content}</td><td>{h.department_name}</td><td className="num">{h.rank.toFixed(3)}</td></tr>))}
                    </tbody></table>}
            </div>
          </div>
        </>
      )}
      {book && <BookModal doctor={book} symptoms={text} onClose={() => setBook(null)} />}
    </>
  );
}

function BookModal({ doctor, symptoms, onClose }: { doctor: any; symptoms: string; onClose: () => void }) {
  const [patient, setPatient] = useState<number | null>(null);
  const { run, node } = useNotice();
  const slot = new Date(doctor.next_slot);
  const local = new Date(slot.getTime() - slot.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return (
    <Modal title={`Book ${doctor.name}`} onClose={onClose}>
      {node}
      <p className="muted">{doctor.department_name} · {fdt(doctor.next_slot)}</p>
      <label>Patient</label>
      <PatientPicker value={patient} onChange={(id) => setPatient(id)} />
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" disabled={!patient} onClick={() => run(() => api("/api/appointments", {
          body: { patient_id: patient, doctor_id: doctor.doctor_id, appointment_date: local, symptoms } }), "Appointment booked.")}>
          Confirm booking</button>
      </div>
    </Modal>
  );
}
