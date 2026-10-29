"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/client";

const DEMO = [
  ["admin", "Admin@123", "Admin"],
  ["reception", "Reception@123", "Receptionist"],
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await api("/api/auth/login", { body: { username, password } }); router.replace("/dashboard"); router.refresh(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="logo">Care<span>Flow</span> HMS</div>
        <p className="sub">Sign in to continue</p>
        {err && <div className="alert err">{err}</div>}
        <div className="stack">
          <div><label>Username</label><input value={username} onChange={(e) => setU(e.target.value)} autoFocus /></div>
          <div><label>Password</label><input type="password" value={password} onChange={(e) => setP(e.target.value)} /></div>
          <button className="btn" style={{ width: "100%" }} disabled={busy || !username || !password}>
            {busy ? "Signing in..." : "Sign in"}</button>
        </div>
        <div className="demo">
          Demo accounts:{" "}
          {DEMO.map(([u, p, l]) => (
            <span key={u}><button type="button" onClick={() => { setU(u); setP(p); }}>{l}</button> · </span>))}
          <button type="button" onClick={() => { setU("dr.arjun1"); setP("Doctor@123"); }}>Doctor</button>
          <div style={{ marginTop: 6 }}>Every doctor account uses password <span className="mono">Doctor@123</span> (see Admin → Users for usernames).</div>
        </div>
      </form>
    </div>
  );
}
