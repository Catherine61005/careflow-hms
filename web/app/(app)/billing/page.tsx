"use client";
import Link from "next/link";
import { useState } from "react";
import { useFetch, api, inr, fdate, Badge, Modal, useNotice } from "@/components/client";
import RoleGate from "@/components/RoleGate";

export default function Billing() {
  const [status, setStatus] = useState("Unpaid");
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState<any>(null);
  const { data, reload } = useFetch(`/api/bills?${new URLSearchParams({ status, q })}`);

  return (
    <RoleGate roles={["admin", "receptionist"]}>
      <h1>Billing</h1>
      <p className="sub">Bills are generated on discharge by a stored procedure. Payment status is maintained by triggers; overpayment is rejected by the database.</p>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {data?.summary.map((s: any) => (
          <div className="kpi" key={s.status}><div className="l">{s.status} ({s.bills})</div>
            <div className="v">{inr(s.status === "Paid" ? s.billed : s.outstanding)}</div>
            <div className="small muted">{s.status === "Paid" ? "collected" : "outstanding"}</div></div>))}
      </div>
      <div className="card">
        <div className="filters">
          {["Unpaid", "Partially Paid", "Paid", ""].map((s) => (
            <button key={s} className={`btn sm ${status === s ? "" : "ghost"}`} onClick={() => setStatus(s)}>{s || "All"}</button>))}
          <input placeholder="Patient name or bill #" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Bill</th><th>Date</th><th>Patient</th><th>Type</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Outstanding</th><th className="num">Age</th><th>Status</th><th></th></tr></thead>
          <tbody>{data?.rows.map((b: any) => (
            <tr key={b.bill_id}>
              <td>#{b.bill_id}</td><td>{fdate(b.bill_date)}</td>
              <td><Link href={`/patients/${b.patient_id}`}>{b.patient_name}</Link></td>
              <td className="small">{b.admission_id ? `Inpatient #${b.admission_id}` : "Outpatient"}</td>
              <td className="num">{inr(b.total_amount)}</td><td className="num">{inr(b.amount_paid)}</td>
              <td className="num"><b>{inr(b.outstanding)}</b></td><td className="num">{b.age_days}d</td>
              <td><Badge s={b.status} /></td>
              <td>{["Unpaid", "Partially Paid"].includes(b.status) && <button className="btn sm" onClick={() => setPaying(b)}>Record payment</button>}</td>
            </tr>))}</tbody></table></div>
      </div>
      {paying && <PayForm bill={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); reload(); }} />}
    </RoleGate>
  );
}

function PayForm({ bill, onClose, onSaved }: { bill: any; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(bill.outstanding));
  const [method, setMethod] = useState("UPI");
  const history = useFetch(`/api/bills/${bill.bill_id}/payments`);
  const { run, node } = useNotice();
  return (
    <Modal title={`Payment for bill #${bill.bill_id}`} onClose={onClose}>
      {node}
      <p className="muted">{bill.patient_name} · total {inr(bill.total_amount)} · outstanding <b>{inr(bill.outstanding)}</b></p>
      {history.data?.rows.length > 0 && <table style={{ marginBottom: 12 }}><thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th></tr></thead>
        <tbody>{history.data.rows.map((p: any) => <tr key={p.payment_id}><td>{fdate(p.payment_date)}</td><td>{p.payment_method}</td><td className="num">{inr(p.amount)}</td></tr>)}</tbody></table>}
      <div className="fields">
        <div><label>Amount (₹)</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label>Method</label><select value={method} onChange={(e) => setMethod(e.target.value)}>
          {["UPI", "Card", "Cash", "NetBanking", "Insurance"].map((m) => <option key={m}>{m}</option>)}</select></div>
      </div>
      <button className="btn" onClick={async () => {
        if (await run(() => api(`/api/bills/${bill.bill_id}/payments`, { body: { amount: Number(amount), payment_method: method } }), "Payment recorded")) onSaved();
      }}>Record payment</button>
    </Modal>
  );
}
