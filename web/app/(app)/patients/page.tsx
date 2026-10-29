"use client";
import Link from "next/link";
import { useState } from "react";
import { useFetch, inr, fdate, useSession } from "@/components/client";
import PatientForm from "@/components/PatientForm";

export default function Patients() {
  const s = useSession();
  const [q, setQ] = useState("");
  const [gender, setGender] = useState("");
  const [admitted, setAdmitted] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const params = new URLSearchParams({ q, gender, admitted, page: String(page) });
  const { data, error, reload } = useFetch(`/api/patients?${params}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <>
      <div className="spread">
        <div><h1>Patients</h1><p className="sub" style={{ margin: 0 }}>Fuzzy search tolerates typos (trigram index).</p></div>
        {s.role !== "doctor" && <button className="btn" onClick={() => setAdding(true)}>+ Register patient</button>}
      </div>
      <div className="card">
        <div className="filters">
          <input placeholder="Name, phone or ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ minWidth: 260 }} />
          <select value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }}>
            <option value="">All genders</option><option>Male</option><option>Female</option><option>Other</option></select>
          <select value={admitted} onChange={(e) => { setAdmitted(e.target.value); setPage(1); }}>
            <option value="">All patients</option><option value="true">Currently admitted</option><option value="false">Not admitted</option></select>
        </div>
        {error && <div className="alert err">{error}</div>}
        <div className="tbl-wrap"><table>
          <thead><tr><th>ID</th><th>Name</th><th>Gender</th><th className="num">Age</th><th>Phone</th><th>Status</th><th>Last visit</th>
            {s.role !== "doctor" && <th className="num">Due</th>}</tr></thead>
          <tbody>
            {data?.rows.map((p: any) => (
              <tr key={p.patient_id}>
                <td>#{p.patient_id}</td>
                <td><Link href={`/patients/${p.patient_id}`}><b>{p.full_name}</b></Link></td>
                <td>{p.gender}</td><td className="num">{p.age}</td><td>{p.phone_number}</td>
                <td>{p.is_admitted ? <span className="badge b-warn">Admitted</span> : <span className="badge">Outpatient</span>}</td>
                <td>{fdate(p.last_visit)}</td>
                {s.role !== "doctor" && <td className="num">{Number(p.outstanding_due) > 0 ? <span className="badge b-danger">{inr(p.outstanding_due)}</span> : "-"}</td>}
              </tr>))}
          </tbody></table></div>
        <div className="spread" style={{ marginTop: 12, marginBottom: 0 }}>
          <span className="muted small">{data?.total ?? 0} patients</span>
          <div className="row">
            <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span className="small">Page {page} / {pages}</span>
            <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      </div>
      {adding && <PatientForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </>
  );
}
