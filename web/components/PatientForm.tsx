"use client";
import { useState } from "react";
import { api, Modal, useNotice } from "./client";

export default function PatientForm({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    first_name: initial?.first_name ?? "", last_name: initial?.last_name ?? "", gender: initial?.gender ?? "Female",
    date_of_birth: initial?.date_of_birth?.slice(0, 10) ?? "", phone_number: initial?.phone_number ?? "", email: initial?.email ?? "",
  });
  const { run, node } = useNotice();
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function save() {
    const ok = await run(() => initial
      ? api(`/api/patients/${initial.patient_id}`, { method: "PATCH", body: f })
      : api("/api/patients", { body: f }), "Saved");
    if (ok) onSaved();
  }
  return (
    <Modal title={initial ? "Edit patient" : "Register patient"} onClose={onClose}>
      {node}
      <div className="fields">
        <div><label>First name</label><input value={f.first_name} onChange={set("first_name")} /></div>
        <div><label>Last name</label><input value={f.last_name} onChange={set("last_name")} /></div>
        <div><label>Gender</label><select value={f.gender} onChange={set("gender")}><option>Female</option><option>Male</option><option>Other</option></select></div>
        <div><label>Date of birth</label><input type="date" value={f.date_of_birth} onChange={set("date_of_birth")} /></div>
        <div><label>Phone</label><input value={f.phone_number} onChange={set("phone_number")} placeholder="9876543210" /></div>
        <div><label>E-mail (optional)</label><input value={f.email} onChange={set("email")} /></div>
      </div>
      <button className="btn" onClick={save}>Save</button>
      <p className="small muted">Validated twice: in the API (zod) and in PostgreSQL (CHECK constraints, phone domain, DOB trigger).</p>
    </Modal>
  );
}
