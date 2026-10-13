"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Lightbulb, SlidersHorizontal, TrendingUp } from "lucide-react";
import { getAuthHeaders, handleUnauthorized } from "../../../lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Scenario = { aumento_tarifa_pct: string; aumento_demanda_pct: string; costo_combustible_pct: string; dias: string };
type Situation = { id: string; title: string; description: string; reason: string; priority: string; objective: string; defaults: Scenario };
type Context = {
  indicadores: { reservas_90d: number; ingresos_90d: number; ticket_promedio: number; pasajeros_promedio: number; flota_operativa: number; flota_fuera_servicio: number; tasa_cancelacion_30d: number };
  rutas: Array<{ origen: string; destino: string; reservas: number; pasajeros_promedio: number; ingreso_promedio: number }>;
  situaciones: Situation[];
  confianza: string;
};
type Result = {
  base: { reservas: number; ingresos: number; pasajeros: number; flota_operativa: number };
  escenario: { reservas_proyectadas: number; ingresos_proyectados: number; costos_operativos_estimados: number; margen_estimado_pct: number; diferencia_ingresos: number; nivel_riesgo: string; recomendacion: string };
  alternativas: Array<{ nombre: string; descripcion: string; parametros: Record<string, number>; reservas_proyectadas: number; ingresos_proyectados: number; costos_operativos_estimados: number; margen_estimado_pct: number; diferencia_ingresos: number; nivel_riesgo: string }>;
  confianza_datos: string;
  sensibilidad: Array<{ factor: string; impacto_pct: number }>;
  supuestos: string[];
};

const DEFAULT: Scenario = { aumento_tarifa_pct: "0", aumento_demanda_pct: "10", costo_combustible_pct: "0", dias: "30" };
const money = (value: number) => `S/ ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ScenarioSimulator() {
  const [context, setContext] = useState<Context | null>(null);
  const [scenario, setScenario] = useState<Scenario>(DEFAULT);
  const [selectedSituation, setSelectedSituation] = useState<Situation | null>(null);
  const [objective, setObjective] = useState("demanda");
  const [manual, setManual] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadContext = async () => {
      try {
        const response = await fetch(`${API_URL}/api/admin/inteligencia/contexto-escenarios`, { headers: getAuthHeaders() });
        if (handleUnauthorized(response.status)) return;
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "No se pudo analizar la empresa");
        setContext(payload.data);
        if (payload.data.situaciones?.[0]) {
          setSelectedSituation(payload.data.situaciones[0]);
          setScenario(payload.data.situaciones[0].defaults);
          setObjective(payload.data.situaciones[0].objective);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el contexto");
      } finally {
        setLoading(false);
      }
    };
    loadContext();
  }, []);

  const chooseSituation = (situation: Situation) => {
    setSelectedSituation(situation);
    setScenario(situation.defaults);
    setObjective(situation.objective);
    setResult(null);
    setManual(false);
  };

  const update = (key: keyof Scenario, value: string) => setScenario((current) => ({ ...current, [key]: value }));
  const simulate = async () => {
    setSimulating(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/admin/inteligencia/simular`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(scenario),
      });
      if (handleUnauthorized(response.status)) return;
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo simular el escenario");
      setResult(payload.data);
    } catch (simulationError) {
      setError(simulationError instanceof Error ? simulationError.message : "No se pudo simular el escenario");
    } finally {
      setSimulating(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">Analizando la situación actual de la empresa...</div>;
  if (error && !context) return <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{error}</div>;
  const indicators = context?.indicadores;
  const riskStyle = result?.escenario.nivel_riesgo === "bajo" ? "bg-emerald-50 text-emerald-700" : result?.escenario.nivel_riesgo === "medio" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";

  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#E31E24]">Inteligencia operativa</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">Asistente de decisiones</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">El sistema analiza tus datos y propone qué situaciones conviene evaluar antes de cambiar la operación.</p>
      </header>

      {indicators && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Reservas analizadas" value={String(indicators.reservas_90d)} sub="Últimos 90 días" />
        <Metric label="Ingresos analizados" value={money(indicators.ingresos_90d)} sub={`Ticket promedio ${money(indicators.ticket_promedio)}`} />
        <Metric label="Flota operativa" value={String(indicators.flota_operativa)} sub={`${indicators.flota_fuera_servicio} fuera de servicio`} />
        <Metric label="Cancelación reciente" value={`${indicators.tasa_cancelacion_30d}%`} sub={`Confianza de datos: ${context?.confianza}`} />
      </div>}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><Lightbulb size={18} className="text-[#E31E24]" /><h2 className="font-black text-slate-800">Situaciones detectadas</h2></div>
            <p className="mb-4 text-xs text-slate-500">Elige una situación basada en los datos actuales de Turesma.</p>
            <div className="space-y-2">
              {(context?.situaciones || []).map((situation) => <button type="button" key={situation.id} onClick={() => chooseSituation(situation)} className={`w-full rounded-xl border p-3 text-left transition ${selectedSituation?.id === situation.id ? "border-[#E31E24] bg-red-50" : "border-slate-200 hover:border-[#E31E24]"}`}><div className="flex items-start gap-2"><span className={`mt-1 h-2 w-2 rounded-full ${situation.priority === "alta" ? "bg-red-500" : "bg-amber-400"}`} /><div><p className="text-sm font-black text-slate-700">{situation.title}</p><p className="mt-1 text-xs text-slate-500">{situation.description}</p></div></div></button>)}
            </div>
            <button type="button" onClick={() => { setManual(true); setSelectedSituation(null); setScenario(DEFAULT); setResult(null); }} className="mt-3 w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-500 hover:border-[#E31E24]">Configurar manualmente</button>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><SlidersHorizontal size={18} className="text-[#E31E24]" /><h2 className="font-black text-slate-800">Definir evaluación</h2></div>
            {!manual && selectedSituation && <div className="mb-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><b>Por qué se sugiere:</b> {selectedSituation.reason}</div>}
            <label className="block text-xs font-bold text-slate-600">Objetivo de la decisión<select value={objective} onChange={(event) => setObjective(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-800"><option value="demanda">Aumentar o proteger la demanda</option><option value="capacidad">Aprovechar mejor la capacidad</option><option value="costos">Proteger el margen ante mayores costos</option><option value="operacion">Evaluar continuidad operativa</option></select></label>
            <details className="mt-4 rounded-xl border border-slate-200 p-3">
              <summary className="cursor-pointer text-xs font-black text-slate-600">Editar supuestos técnicos</summary>
              <div className="mt-3 space-y-3">{([["aumento_tarifa_pct", "Variación de tarifa (%)"], ["aumento_demanda_pct", "Variación esperada de demanda (%)"], ["costo_combustible_pct", "Variación del combustible (%)"], ["dias", "Periodo de análisis (días)"]] as const).map(([key, label]) => <label key={key} className="block text-xs font-bold text-slate-600">{label}<input type="number" min={key === "dias" ? 1 : -100} max={key === "dias" ? 365 : undefined} value={scenario[key]} onChange={(event) => update(key, event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-[#E31E24]" /></label>)}</div>
            </details>
            {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
            <button type="button" disabled={simulating} onClick={simulate} className="mt-5 w-full rounded-xl bg-[#E31E24] px-4 py-3 text-sm font-black text-white disabled:opacity-60">{simulating ? "Calculando alternativas..." : "Comparar alternativas"}</button>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          {!result ? <div className="flex min-h-[460px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><Info className="mx-auto text-slate-300" size={42} /><p className="mt-3 font-black text-slate-600">Selecciona una situación para comenzar</p><p className="mt-1 text-sm text-slate-400">Verás el impacto esperado, el riesgo y una recomendación accionable.</p></div></div> : <>
            <div className={`rounded-2xl border p-5 ${result.confianza_datos === "baja" ? "border-amber-200 bg-amber-50" : "border-emerald-100 bg-emerald-50"}`}><div className="flex min-w-0 items-start gap-3"><AlertTriangle size={20} className={`shrink-0 ${result.confianza_datos === "baja" ? "text-amber-600" : "text-emerald-600"}`} /><div className="min-w-0"><p className="text-xs font-black uppercase tracking-widest text-slate-500">Calidad de la proyección: {result.confianza_datos}</p><p className="mt-2 break-words text-sm font-bold text-slate-700">{result.confianza_datos === "baja" ? "Hay pocos registros históricos. Usa estos resultados para diseñar una prueba piloto, no para aplicar un cambio general." : "La muestra disponible permite comparar alternativas con una confianza razonable."}</p></div></div></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Ingresos proyectados" value={money(result.escenario.ingresos_proyectados)} sub={`${result.escenario.diferencia_ingresos >= 0 ? "+" : ""}${money(result.escenario.diferencia_ingresos)} vs. base`} />
              <Metric label="Reservas proyectadas" value={String(result.escenario.reservas_proyectadas)} sub={`${result.base.reservas} en la base`} />
              <Metric label="Margen esperado" value={`${result.escenario.margen_estimado_pct}%`} sub={`Costos: ${money(result.escenario.costos_operativos_estimados)}`} />
              <div className={`rounded-2xl p-4 ${riskStyle}`}><p className="text-[10px] font-black uppercase tracking-widest opacity-70">Riesgo estimado</p><p className="mt-2 text-2xl font-black uppercase">{result.escenario.nivel_riesgo}</p><p className="mt-1 text-xs">Confianza: {result.confianza_datos}</p></div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-600" /><h2 className="font-black text-slate-800">Decisión sugerida</h2></div><p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{result.escenario.recomendacion}</p></div>
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="mb-4 font-black text-slate-800">Comparación de alternativas</h2><div className="max-w-full overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400"><th className="pb-3">Alternativa</th><th className="pb-3">Reservas</th><th className="pb-3">Ingresos</th><th className="pb-3">Costos</th><th className="pb-3">Margen</th><th className="pb-3">Riesgo</th></tr></thead><tbody>{result.alternativas.map((alternative, index) => <tr key={alternative.nombre} className={`border-b border-slate-100 ${index === 1 ? "bg-red-50/50" : ""}`}><td className="py-4 pr-3"><p className="font-black text-slate-700">{alternative.nombre}{index === 1 && <span className="ml-2 rounded-full bg-red-100 px-2 py-1 text-[9px] text-red-700">Evaluada</span>}</p><p className="mt-1 max-w-[180px] text-[10px] text-slate-400">{alternative.descripcion}</p></td><td className="py-4 font-bold text-slate-700">{alternative.reservas_proyectadas}</td><td className="py-4 font-bold text-slate-700">{money(alternative.ingresos_proyectados)}</td><td className="py-4 text-slate-600">{money(alternative.costos_operativos_estimados)}</td><td className="py-4 font-black text-slate-700">{alternative.margen_estimado_pct}%</td><td className="py-4"><span className={`rounded-full px-2 py-1 font-black uppercase ${alternative.nivel_riesgo === "bajo" ? "bg-emerald-100 text-emerald-700" : alternative.nivel_riesgo === "medio" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{alternative.nivel_riesgo}</span></td></tr>)}</tbody></table></div></div>
            <div className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="mb-4 font-black text-slate-800">Factores con mayor impacto</h2>{result.sensibilidad.map((item) => <div key={item.factor} className="mb-3 flex items-center gap-3 text-sm"><TrendingUp size={15} className="text-[#E31E24]" /><span className="font-bold text-slate-600">{item.factor}</span><span className="ml-auto font-black text-slate-800">{item.impacto_pct > 0 ? "+" : ""}{item.impacto_pct}%</span></div>)}</div><div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="mb-4 font-black text-slate-800">Supuestos y límites</h2>{result.supuestos.map((assumption) => <p key={assumption} className="mb-2 flex gap-2 text-xs leading-5 text-slate-500"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />{assumption}</p>)}</div></div>
          </>}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-slate-800">{value}</p><p className="mt-1 text-xs text-slate-500">{sub}</p></div>;
}
