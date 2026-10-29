"use client";
import { useCallback, useEffect, useState, createContext, useContext } from "react";
import type { Session } from "@/lib/auth";

// ---------------------------------------------------------------- API helper
export async function api<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** GET with loading/error state and a reload() handle. */
export function useFetch<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try { setData(await api<T>(url)); setError(null); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}

// ---------------------------------------------------------------- session context
const SessionCtx = createContext<Session | null>(null);
export const SessionProvider = ({ value, children }: { value: Session; children: React.ReactNode }) =>
  <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
export const useSession = () => useContext(SessionCtx)!;

// ---------------------------------------------------------------- formatting
export const inr = (n: any) =>
  n === null || n === undefined ? "-" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
export const fdate = (d: any) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";
export const fdt = (d: any) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

const BADGE: Record<string, string> = {
  Scheduled: "b-info", Completed: "b-ok", Cancelled: "", "No-Show": "b-warn",
  Paid: "b-ok", "Partially Paid": "b-warn", Unpaid: "b-danger",
  Available: "b-ok", Occupied: "b-warn", Maintenance: "",
  Ordered: "b-info", "In Progress": "b-warn", Admitted: "b-warn", Discharged: "b-ok",
};
export const Badge = ({ s }: { s: string }) => <span className={`badge ${BADGE[s] ?? ""}`}>{s}</span>;

// ---------------------------------------------------------------- feedback + modal
export function useNotice() {
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, okText: string) => {
    try { await fn(); setMsg({ kind: "ok", text: okText }); return true; }
    catch (e: any) { setMsg({ kind: "err", text: e.message }); return false; }
  };
  const node = msg ? <div className={`alert ${msg.kind}`} onClick={() => setMsg(null)}>{msg.text}</div> : null;
  return { run, node, setMsg };
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread"><h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost sm" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

/** Patient picker with server-side fuzzy search. */
export function PatientPicker({ value, onChange }: { value: number | null; onChange: (id: number | null, label?: string) => void }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<any[]>([]);
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (q.trim().length < 2) { setOpts([]); return; }
    const t = setTimeout(() => api(`/api/patients?q=${encodeURIComponent(q)}`).then((d) => setOpts(d.rows.slice(0, 8))), 250);
    return () => clearTimeout(t);
  }, [q]);
  if (value) return (
    <div className="row"><span className="badge b-brand">#{value} {label}</span>
      <button type="button" className="btn ghost sm" onClick={() => { onChange(null); setQ(""); }}>change</button></div>
  );
  return (
    <div style={{ position: "relative" }}>
      <input placeholder="Search name, phone or ID" value={q} onChange={(e) => setQ(e.target.value)} />
      {opts.length > 0 && (
        <div className="card" style={{ position: "absolute", zIndex: 5, left: 0, right: 0, padding: 4, maxHeight: 240, overflow: "auto" }}>
          {opts.map((p) => (
            <div key={p.patient_id} style={{ padding: "6px 8px", cursor: "pointer" }}
                 onClick={() => { setLabel(p.full_name); onChange(p.patient_id, p.full_name); setOpts([]); }}>
              #{p.patient_id} <b>{p.full_name}</b> <span className="muted small">{p.gender}, {p.age}y · {p.phone_number}</span>
            </div>))}
        </div>)}
    </div>
  );
}
