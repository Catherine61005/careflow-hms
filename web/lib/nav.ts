import type { Role } from "./auth";

// Which screens each role can open (the API enforces the same rules server-side)
export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "receptionist", "doctor"] },
  { href: "/triage", label: "Smart Triage", roles: ["admin", "receptionist", "doctor"] },
  { href: "/patients", label: "Patients", roles: ["admin", "receptionist", "doctor"] },
  { href: "/appointments", label: "Appointments", roles: ["admin", "receptionist", "doctor"] },
  { href: "/admissions", label: "Admissions", roles: ["admin", "receptionist", "doctor"] },
  { href: "/rooms", label: "Rooms", roles: ["admin", "receptionist", "doctor"] },
  { href: "/clinical", label: "Prescriptions & Labs", roles: ["admin", "doctor"] },
  { href: "/billing", label: "Billing", roles: ["admin", "receptionist"] },
  { href: "/reports", label: "Reports", roles: ["admin"] },
  { href: "/admin", label: "Users & Audit", roles: ["admin"] },
];
