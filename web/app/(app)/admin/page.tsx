"use client";
import { useState } from "react";
import { useFetch, api, fdt, useSession, Modal, useNotice } from "@/components/client";
import RoleGate from "@/components/RoleGate";

export default function Admin() {
  const [tab, setTab] = useState<"users" | "audit">("users");
  return (
    <RoleGate roles={["admin"]}>
      <h1>Users & Audit</h1>
      <p className="sub">Role-based access control and the trigger-maintained audit trail.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`btn sm ${tab === "users" ? "" : "ghost"}`} onClick={() => setTab("users")}>Users</button>
        <button className={`btn sm ${tab === "audit" ? "" : "ghost"}`} onClick={() => setTab("audit")}>Audit log</button>
      </div>
      {tab === "users" ? <Users /> : <Audit />}
    </RoleGate>
  );
}

function Users() {
  const s = useSession();
  const { data, reload } = useFetch("/api/admin/users");
  const [adding, setAdding] = useState(false);
  const { run, node } = useNotice();
  return (
    <div className="card">
      {node}
      <div className="spread"><h2 style={{ margin: 0 }}>Accounts</h2><button className="btn" onClick={() => setAdding(true)}>+ New user</button></div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Linked doctor</th><th>Status</th><th></th></tr></thead>
        <tbody>{data?.rows.map((u: any) => (
          <tr key={u.user_id}><td className="mono">{u.username}</td><td>{u.full_name}</td>
            <td><span className="badge b-brand">{u.role}</span></td><td className="small">{u.doctor_name ?? "-"}</td>
            <td>{u.is_active ? <span className="badge b-ok">Active</span> : <span className="badge">Disabled</span>}</td>
            <td>{u.user_id !== s.uid && <button className="btn ghost sm" onClick={() =>
              run(() => api(`/api/admin/users/${u.user_id}`, { method: "PATCH", body: { is_active: !u.is_active } }),
                  u.is_active ? "User disabled (their session stops working immediately)" : "User enabled").then(reload)}>
              {u.is_active ? "Disable" : "Enable"}</button>}</td></tr>))}
        </tbody></table></div>
      {adding && <NewUser onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function NewUser({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ username: "", full_name: "", role: "receptionist", password: "", doctor_id: "" });
  const doctors = useFetch("/api/doctors");
  const { run, node } = useNotice();
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="New user" onClose={onClose}>
      {node}
      <div className="fields">
        <div><label>Username</label><input value={f.username} onChange={set("username")} /></div>
        <div><label>Full name</label><input value={f.full_name} onChange={set("full_name")} /></div>
        <div><label>Role</label><select value={f.role} onChange={set("role")}>
          <option value="receptionist">Receptionist</option><option value="doctor">Doctor</option><option value="admin">Admin</option></select></div>
        <div><label>Password (min 8)</label><input type="password" value={f.password} onChange={set("password")} /></div>
        {f.role === "doctor" && <div><label>Doctor record</label><select value={f.doctor_id} onChange={set("doctor_id")}>
          <option value="">Select...</option>
          {doctors.data?.rows.map((d: any) => <option key={d.doctor_id} value={d.doctor_id}>{d.name}</option>)}</select></div>}
      </div>
      <button className="btn" onClick={async () => {
        if (await run(() => api("/api/admin/users", { body: { ...f, doctor_id: f.doctor_id ? Number(f.doctor_id) : null } }), "Created")) onSaved();
      }}>Create</button>
    </Modal>
  );
}

function Audit() {
  const [table, setTable] = useState("");
  const { data } = useFetch(`/api/admin/audit?table=${table}`);
  return (
    <div className="card">
      <div className="filters">
        <select value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">All tables</option>
          {["patient", "appointment", "admission", "bill", "payment"].map((t) => <option key={t}>{t}</option>)}</select>
        <span className="muted small">Seed-data inserts are hidden. Make a change in the app to see it here.</span>
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>When</th><th>Who</th><th>Table</th><th>Op</th><th>Row</th><th>Changed fields (old → new)</th></tr></thead>
        <tbody>{data?.rows.map((a: any) => (
          <tr key={a.audit_id}><td className="small">{fdt(a.changed_at)}</td><td className="mono">{a.changed_by}</td><td>{a.table_name}</td>
            <td><span className={`badge ${a.operation === "DELETE" ? "b-danger" : a.operation === "INSERT" ? "b-ok" : "b-info"}`}>{a.operation}</span></td>
            <td>#{a.row_pk}</td>
            <td className="mono small">{a.changes && Object.entries(a.changes).map(([k, [o, n]]: any) => (
              <div key={k}>{k}: {a.operation === "INSERT" ? "" : `${JSON.stringify(o)} → `}{JSON.stringify(n)}</div>))}</td></tr>))}
        </tbody></table></div>
    </div>
  );
}
