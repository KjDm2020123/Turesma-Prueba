"use client";

import { ScenarioSimulator } from "../_components/scenario-simulator";
import { useAdminGuard } from "../../../lib/use-admin-guard";

export default function AdminSimulatorPage() {
  const { checkingSession } = useAdminGuard();
  if (checkingSession) return <div className="p-8 text-sm text-slate-500">Verificando sesión...</div>;
  return <ScenarioSimulator />;
}
