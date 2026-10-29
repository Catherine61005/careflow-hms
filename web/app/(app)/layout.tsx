import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { NAV } from "@/lib/nav";
import { SessionProvider } from "@/components/client";
import Nav from "@/components/Nav";

export const dynamic = "force-dynamic";



export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const items = NAV.filter((n) => n.roles.includes(session.role)).map(({ href, label }) => ({ href, label }));
  return (
    <SessionProvider value={session}>
      <div className="shell">
        <Nav items={items} name={session.name} role={session.role} />
        <main className="main">{children}</main>
      </div>
    </SessionProvider>
  );
}
