"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Nav({ items, name, role }: { items: { href: string; label: string }[]; name: string; role: string }) {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <aside className="side">
      <div className="logo">Care<span>Flow</span> HMS</div>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={path.startsWith(i.href) ? "active" : ""}>{i.label}</Link>
      ))}
      <div className="who">
        <b>{name}</b>
        <span className="role">{role}</span>
        <div><button className="btn ghost sm" onClick={logout}>Sign out</button></div>
      </div>
    </aside>
  );
}
