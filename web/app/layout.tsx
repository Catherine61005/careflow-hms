import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CareFlow HMS",
  description: "Hospital operations management with semantic triage",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
