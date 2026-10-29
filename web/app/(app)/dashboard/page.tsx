"use client";
import Link from "next/link";
import { useFetch, inr, fdt, fdate, useSession } from "@/components/client";

export default function Dashboard() {
  const s = useSession();
  const { data, error } = useFetch("/api/dashboard");
  if (error) return <div className="alert err">{error}</div>;
  if (!data) return <p className="muted">Loading dashboard...</p>;
  const k = data.kpi;
  const maxDept = Math.max(1, ...data.deptLoad.map((d: any) => d.admissions));
  const maxRev = Math.max(1, ...data.revenue.map((r: any) => r.revenue));

  return (
    <>
      <h1>Good day, {s.name.split(" ").slice(0, 2).join(" ")}</h1>
      <p className="sub">Hospital snapshot for {fdate(new Date())}</p>

      <div className="kpis">
        <div className="kpi"><div className="l">Registered patients</div><div className="v">{k.patients}</div></div>
        <div className="kpi"><div className="l">Currently admitted</div><div className="v">{k.admitted}</div></div>
        <div className="kpi"><div className="l">Bed occupancy</div><div className="v">{k.occupancy_pct ?? 0}%</div></div>
        <div className="kpi"><div className="l">{s.role === "doctor" ? "My appointments today" : "Appointments today"}</div><div className="v">{k.appointments_today}</div></div>
        {s.role !== "doctor" && <>
          <div className="kpi"><div className="l">Outstanding dues</div><div className="v">{inr(k.outstanding)}</div></div>
          <div className="kpi"><div className="l">Revenue this month</div><div className="v">{inr(k.revenue_month)}</div></div>
        </>}
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Admissions by department <span className="muted small">(last 90 days)</span></h2>
          <div className="bars">
            {data.deptLoad.map((d: any) => (
              <div className="bar" key={d.department_name}>
                <span>{d.department_name}</span>
                <div className="track"><div className="fill" style={{ width: `${(100 * d.admissions) / maxDept}%` }} /></div>
                <span className="muted">{d.admissions} · {d.avg_stay}d</span>
              </div>))}
          </div>
        </div>

        {s.role !== "doctor" ? (
          <div className="card">
            <h2>Monthly collections <span className="muted small">(materialized view)</span></h2>
            <div className="cols">
              {data.revenue.map((r: any) => (
                <div className="c" key={r.label} title={inr(r.revenue)}>
                  <span>{Math.round(r.revenue / 1000)}k</span>
                  <div className="f" style={{ height: `${(100 * r.revenue) / maxRev}%` }} />
                  <span>{r.label}</span>
                </div>))}
            </div>
          </div>
        ) : (
          <div className="card">
            <h2>Ward status</h2>
            <table><thead><tr><th>Room type</th><th className="num">Occupied</th><th className="num">Free</th><th className="num">Maintenance</th></tr></thead>
              <tbody>{data.roomTypes.map((r: any) => (
                <tr key={r.room_type}><td>{r.room_type}</td><td className="num">{r.occupied}</td><td className="num">{r.available}</td><td className="num">{r.maintenance}</td></tr>))}
              </tbody></table>
          </div>
        )}

        <div className="card">
          <div className="spread" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Upcoming appointments</h2><Link href="/appointments">All</Link></div>
          <table><tbody>
            {data.upcoming.length === 0 && <tr><td className="muted">Nothing scheduled.</td></tr>}
            {data.upcoming.map((a: any) => (
              <tr key={a.appointment_id}>
                <td>{fdt(a.appointment_date)}</td>
                <td><Link href={`/patients/${a.patient_id}`}>{a.patient_name}</Link></td>
                <td className="muted">{a.doctor_name}<br /><span className="small">{a.department_name}</span></td>
              </tr>))}
          </tbody></table>
        </div>

        <div className="card">
          <div className="spread" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Recent abnormal lab results</h2>
            {s.role !== "receptionist" && <Link href="/clinical">Labs</Link>}</div>
          <table><tbody>
            {data.abnormal.map((t: any, i: number) => (
              <tr key={i}>
                <td>{fdate(t.test_date)}</td>
                <td><Link href={`/patients/${t.patient_id}`}>{t.patient_name}</Link><br /><span className="small muted">{t.test_name}</span></td>
                <td><span className="badge b-danger">{t.result_value} {t.units}</span><br /><span className="small muted">ref {t.reference_range}</span></td>
              </tr>))}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
