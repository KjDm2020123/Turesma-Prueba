"use client";

import { ClienteShell } from "./_components/cliente-shell";

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return <ClienteShell>{children}</ClienteShell>;
}
