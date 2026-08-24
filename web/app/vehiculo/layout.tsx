"use client";

import { ConductorShell } from "./_components/conductor-shell";

export default function ConductorLayout({ children }: { children: React.ReactNode }) {
  return <ConductorShell>{children}</ConductorShell>;
}
