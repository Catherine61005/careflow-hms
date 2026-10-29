"use client";
import Link from "next/link";
import { useState } from "react";
import { useFetch, api, inr, useSession, useNotice } from "@/components/client";

export default function Rooms() {
  const s = useSession();
  const [filter, setFilter] = useState("");
  const { data, reload } = useFetch(`/api/rooms?availability=${filter}`);
  const { run, node } = useNotice();
  const toggle = (r: any) => run(() => api(`/api/rooms/${r.room_id}`, { method: "PATCH",
    body: { availability: r.availability === "Maintenance" ? "Available" : "Maintenance" } }), "Room updated").then(reload);

  const types = ["General", "Semi-Private", "Private", "ICU"];
  return (
    <>
      <h1>Rooms</h1>
      <p className="sub">Live ward board from view <span className="mono">v_current_occupancy</span>. Availability is set by triggers on room allocation.</p>
      {node}
      <div className="filters">
        {["", "Available", "Occupied", "Maintenance"].map((f) => (
          <button key={f} className={`btn sm ${filter === f ? "" : "ghost"}`} onClick={() => setFilter(f)}>{f || "All"}</button>))}
      </div>
      {types.map((t) => {
        const list = data?.rows.filter((r: any) => r.room_type === t) ?? [];
        if (!list.length) return null;
        return (
          <div key={t} style={{ marginBottom: 20 }}>
            <h3>{t} · {inr(list[0].charge_per_day)}/day</h3>
            <div className="rooms">
              {list.map((r: any) => (
                <div key={r.room_id} className={`room ${r.availability}`}>
                  <div className="spread" style={{ marginBottom: 4 }}><span className="n">{r.room_number}</span><span className="small">{r.availability}</span></div>
                  {r.patient_id
                    ? <><Link href={`/patients/${r.patient_id}`}>{r.patient_name}</Link><div className="muted">{r.doctor_name}</div><div className="muted">day {r.days_in_room + 1}</div></>
                    : <div className="muted">{r.availability === "Maintenance" ? "Out of service" : "Ready"}</div>}
                  {s.role === "admin" && r.availability !== "Occupied" &&
                    <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => toggle(r)}>
                      {r.availability === "Maintenance" ? "Return to service" : "Maintenance"}</button>}
                </div>))}
            </div>
          </div>);
      })}
    </>
  );
}
