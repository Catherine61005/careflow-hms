"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useFetch, inr, fdate, fdt, Badge, useSession } from "@/components/client";
import PatientForm from "@/components/PatientForm";

const TABS = ["Appointments", "Admissions", "Prescriptions", "Lab tests", "Bills"] as const;

export default function PatientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const s = useSession();
  const { data, error, reload } = useFetch(`/api/patients/${id}`);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Appointments");
  const [editing, setEditing] = useState(false);
  if (error) return <div className="alert err">{error}</div>;
  if (!data) return <p className="muted">Loading...</p>;
  const p = data.patient;
  const tabs = TABS.filter((t) => t !== "Bills" || s.role !== "doctor");

  return (
    <>
      <Link href="/patients" className="small">&larr; Patients</Link>
      <div className="spread" style={{ marginTop: 8 }}>
        <div>
          <h1>{p.full_name} <span className="muted">#{p.patient_id}</span></h1>
          <p className="sub" style={{ margin: 0 }}>{p.gender} · {p.age} years (born {fdate(p.date_of_birth)}) · {p.phone_number}{p.email ? ` · ${p.email}` : ""}</p>
        </div>
        <div className="row">
          {p.is_admitted ? <span className="badge b-warn">Currently admitted</span> : <span className="badge">Outpatient</span>}
          {s.role !== "doctor" && Number(p.outstanding_due) > 0 && <span className="badge b-danger">Due {inr(p.outstanding_due)}</span>}
          {s.role !== "doctor" && <button className="btn ghost sm" onClick={() => setEditing(true)}>Edit</button>}
        </div>
      </div>

      <div className="row" style={{ margin: "18px 0 12px" }}>
        {tabs.map((t) => (
          <button key={t} className={`btn sm ${tab === t ? "" : "ghost"}`} onClick={() => setTab(t)}>
            {t} ({({ Appointments: data.appointments, Admissions: data.admissions, Prescriptions: data.prescriptions,
                     "Lab tests": data.tests, Bills: data.bills } as any)[t].length})
          </button>))}
      </div>

      <div className="card tbl-wrap">
        {tab === "Appointments" && <table>
          <thead><tr><th>When</th><th>Doctor</th><th>Department</th><th>Complaint</th><th>Status</th></tr></thead>
          <tbody>{data.appointments.map((a: any) => (
            <tr key={a.appointment_id}><td>{fdt(a.appointment_date)}</td><td>{a.doctor_name}</td><td>{a.department_name}</td>
              <td className="muted">{a.symptoms}</td><td><Badge s={a.status} /></td></tr>))}</tbody></table>}

        {tab === "Admissions" && <table>
          <thead><tr><th>Admitted</th><th>Discharged</th><th>Reason</th><th>Doctor</th><th>Room(s)</th></tr></thead>
          <tbody>{data.admissions.map((a: any) => (
            <tr key={a.admission_id}><td>{fdate(a.admission_date)}</td><td>{a.discharge_date ? fdate(a.discharge_date) : <Badge s="Admitted" />}</td>
              <td>{a.reason}</td><td>{a.doctor_name}</td><td className="small">{a.rooms}</td></tr>))}</tbody></table>}

        {tab === "Prescriptions" && <table>
          <thead><tr><th>Date</th><th>Doctor</th><th>Medicines</th></tr></thead>
          <tbody>{data.prescriptions.map((pr: any) => (
            <tr key={pr.prescription_id}><td>{fdate(pr.prescription_date)}</td><td>{pr.doctor_name}</td>
              <td>{pr.medications.filter((m: any) => m.medicine_name).map((m: any) => (
                <div key={m.medicine_name}><b>{m.medicine_name}</b> {m.dosage} · {m.frequency} · {m.duration}</div>))}</td></tr>))}</tbody></table>}

        {tab === "Lab tests" && <table>
          <thead><tr><th>Date</th><th>Test</th><th>Ordered by</th><th>Status</th><th>Results</th></tr></thead>
          <tbody>{data.tests.map((t: any) => (
            <tr key={t.test_id}><td>{fdate(t.test_date)}</td><td>{t.test_name}</td><td>{t.doctor_name}</td><td><Badge s={t.status} /></td>
              <td>{(t.results ?? []).map((r: any, i: number) => (
                <div key={i}><span className={`badge ${r.is_abnormal ? "b-danger" : "b-ok"}`}>{r.result_value} {r.units}</span>
                  <span className="small muted"> ref {r.reference_range}</span></div>))}</td></tr>))}</tbody></table>}

        {tab === "Bills" && <table>
          <thead><tr><th>Bill</th><th>Date</th><th>Type</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Outstanding</th><th>Status</th></tr></thead>
          <tbody>{data.bills.map((b: any) => (
            <tr key={b.bill_id}><td>#{b.bill_id}</td><td>{fdate(b.bill_date)}</td><td>{b.admission_id ? `Inpatient #${b.admission_id}` : "Outpatient"}</td>
              <td className="num">{inr(b.total_amount)}</td><td className="num">{inr(b.amount_paid)}</td><td className="num">{inr(b.outstanding)}</td>
              <td><Badge s={b.status} /></td></tr>))}</tbody></table>}
      </div>
      {editing && <PatientForm initial={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </>
  );
}
