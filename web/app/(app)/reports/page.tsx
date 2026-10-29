"use client";
import { useFetch, api, inr, useNotice } from "@/components/client";
import RoleGate from "@/components/RoleGate";

export default function Reports() {
  const { data, reload } = useFetch("/api/reports/revenue");
  const { run, node } = useNotice();
  const max = Math.max(1, ...(data?.byDept ?? []).map((d: any) => d.revenue));
  return (
    <RoleGate roles={["admin"]}>
      <div className="spread">
        <div><h1>Reports</h1><p className="sub" style={{ margin: 0 }}>Aggregations, window functions and a materialized view.</p></div>
        <button className="btn ghost" onClick={() => run(() => api("/api/reports/revenue", { body: {} }), "Materialized view refreshed").then(reload)}>
          Refresh materialized view</button>
      </div>
      {node}
      <div className="grid g2" style={{ marginTop: 12 }}>
        <div className="card">
          <h2>Inpatient revenue by department</h2>
          <div className="bars">{data?.byDept.map((d: any) => (
            <div className="bar" key={d.department_name}><span>{d.department_name}</span>
              <div className="track"><div className="fill" style={{ width: `${(100 * d.revenue) / max}%` }} /></div>
              <span className="muted">{inr(d.revenue)}</span></div>))}</div>
        </div>
        <div className="card">
          <h2>Receivables ageing</h2>
          <table><thead><tr><th>Bucket</th><th className="num">Bills</th><th className="num">Outstanding</th></tr></thead>
            <tbody>{data?.ageing.map((a: any) => <tr key={a.bucket}><td>{a.bucket}</td><td className="num">{a.bills}</td><td className="num">{inr(a.outstanding)}</td></tr>)}</tbody></table>
        </div>
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <h2>Monthly collections <span className="muted small">SUM() OVER (ORDER BY month), LAG()</span></h2>
          <table><thead><tr><th>Month</th><th className="num">Collected</th><th className="num">Change vs previous</th><th className="num">Running total</th></tr></thead>
            <tbody>{data?.monthly.map((m: any) => (
              <tr key={m.label}><td>{m.label}</td><td className="num">{inr(m.revenue)}</td>
                <td className="num" style={{ color: m.change == null ? undefined : m.change >= 0 ? "var(--ok)" : "var(--danger)" }}>
                  {m.change == null ? "-" : (m.change >= 0 ? "+" : "") + inr(m.change)}</td>
                <td className="num">{inr(m.running_total)}</td></tr>))}</tbody></table>
        </div>
      </div>
    </RoleGate>
  );
}
