"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowUpRight, Bus, CheckCircle2,
  RefreshCw, Users, UserCheck, Wrench,
  ClipboardCheck, CalendarClock, ChevronRight,
  Sparkles, TrendingUp, DollarSign,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { getAuthHeaders, handleUnauthorized } from "../../../lib/session";
import { useAdminGuard } from "../../../lib/use-admin-guard";
import { useAutoRefresh } from "../../../lib/use-auto-refresh";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type DashboardData = {
  resumen: {
    totalUsuarios: number; totalClientes: number; totalConductores: number;
    totalVehiculos: number; vehiculosActivos: number; vehiculosSinAsignar: number;
    reservasPendientes: number; reservasPendientePago: number; reservasConfirmadas: number;
    reservasEnCurso: number; reservasFinalizadas: number;
    ocupacionVehicular: number; cargaOperativa: number;
    mantenimientoPendiente: number; mantenimientoVencido: number;
    mantenimientoCompletado: number; costomantenimientoMes: number;
    cumplimientoVencido: number; cumplimientoCritico: number; cumplimientoVigente: number;
    conductoresActivos: number; conductoresInactivos: number;
    ratingPromedioConductores: number; licenciasVencidas: number;
    rutasActivas: number; tasaCancelacionRutas: number;
  };
  tendenciaSemanal: Array<{ etiqueta: string; total: number }>;
  proximosVencimientos: Array<{
    tipo: "mantenimiento" | "cumplimiento"; titulo: string; fecha: string | null;
    diasRestantes: number | null; vencido: boolean; link: string;
  }>;
  alertas: Array<{ tipo: string; prioridad: string; titulo: string; descripcion: string; link: string }>;
};

type Analitica = {
  demandaMes: Array<{ etiqueta: string; total: number }>;
  demandaDia: Array<{ etiqueta: string; total: number }>;
  mesPico: { mes: string; total: number } | null;
  diaPico: { dia: string; total: number } | null;
  proyeccion: { ingresosMes: number; proyeccionMes: number; promedioHistorico: number };
  conversion: { total: number; aprobadas: number; tasa: number };
  recomendaciones: string[];
};

type PerformanceData = {
  vehiculos: Array<{ id: number; placa: string; modelo: string; viajes: number; mantenimientos: number; indice: number }>;
  conductores: Array<{ id: number; nombre: string; rating: number; viajes: number; indice: number }>;
  rutas: Array<{ origen: string; destino: string; viajes: number; pasajeros_promedio: number; ingreso_promedio: number }>;
};

type AssignmentOption = {
  vehiculo_id: number;
  placa: string;
  modelo: string;
  capacidad: number;
  conductor_nombre?: string;
  puntaje: number;
  carga_30_dias: number;
  mantenimiento_ok: number;
  desglose: {
    capacidad: number;
    calificacion: number;
    mantenimiento: number;
    cargaOperativa: number;
  };
  razones: string[];
};

type AssignmentRecommendation = {
  decisionId: number;
  fecha: string;
  pasajeros: number;
  vehiculo: AssignmentOption;
  alternativas: AssignmentOption[];
  filtrosAplicados: string[];
  criterios: string[];
};

const CARD = "bg-white rounded-2xl p-5 shadow-sm border border-gray-100";

const PRIORIDAD_STYLE: Record<string, string> = {
  alta: "border-l-[#E31E24] bg-red-50/50",
  media: "border-l-amber-400 bg-amber-50/40",
  baja: "border-l-slate-300 bg-slate-50/60",
};

const PRIORIDAD_DOT: Record<string, string> = {
  alta: "bg-[#E31E24]",
  media: "bg-amber-400",
  baja: "bg-slate-300",
};

export const IntelligenceDashboard = () => {
  const { checkingSession } = useAdminGuard();
  const [data, setData] = useState<DashboardData | null>(null);
  const [analitica, setAnalitica] = useState<Analitica | null>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [recommendation, setRecommendation] = useState<AssignmentRecommendation | null>(null);
  const [assignmentDate, setAssignmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [passengers, setPassengers] = useState(10);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [savingDecision, setSavingDecision] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const loadData = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${API_URL}/api/admin/inteligencia/dashboard`, { headers: getAuthHeaders() });
      if (handleUnauthorized(res.status)) return;
      if (!res.ok) throw new Error("No se pudo cargar el centro de inteligencia");
      setData(await res.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar el centro de inteligencia");
    } finally {
      setLoading(false);
    }
    // Analítica inteligente (best-effort: no bloquea ni rompe el dashboard).
    try {
      const aRes = await fetch(`${API_URL}/api/admin/inteligencia/analitica`, { headers: getAuthHeaders() });
      if (aRes.ok) setAnalitica(await aRes.json());
    } catch { /* silencio */ }
    try {
      const pRes = await fetch(`${API_URL}/api/admin/inteligencia/desempeno`, { headers: getAuthHeaders() });
      if (pRes.ok) {
        const payload = await pRes.json();
        setPerformance(payload.data);
      }
    } catch { /* el dashboard principal no depende de este bloque */ }
  };

  const requestRecommendation = async () => {
    setLoadingRecommendation(true);
    setRecommendationError("");
    try {
      const query = new URLSearchParams({
        fecha: assignmentDate,
        pasajeros: String(Math.max(1, passengers)),
      });
      const response = await fetch(`${API_URL}/api/admin/inteligencia/asignacion-recomendada?${query}`, {
        headers: getAuthHeaders(),
      });
      if (handleUnauthorized(response.status)) return;
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo generar la recomendación");
      setRecommendation(payload.data);
      setSelectedVehicleId(payload.data.vehiculo.vehiculo_id);
      setDecisionReason("");
      setDecisionMessage("");
      setDecisionError("");
    } catch (error) {
      setRecommendationError(error instanceof Error ? error.message : "No se pudo generar la recomendación");
    } finally {
      setLoadingRecommendation(false);
    }
  };

  const registerAssignmentDecision = async () => {
    if (!recommendation || selectedVehicleId === null) return;
    const isAlternative = selectedVehicleId !== recommendation.vehiculo.vehiculo_id;
    setSavingDecision(true);
    setDecisionError("");
    setDecisionMessage("");
    try {
      const response = await fetch(
        `${API_URL}/api/admin/inteligencia/asignacion-recomendada/${recommendation.decisionId}/decision`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            vehiculo_id: selectedVehicleId,
            resultado: isAlternative ? "alternativa" : "aceptada",
            motivo: decisionReason,
          }),
        }
      );
      if (handleUnauthorized(response.status)) return;
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo registrar la decisión");
      setDecisionMessage(isAlternative
        ? "Alternativa y motivo registrados para la evaluación."
        : "Aceptación de la recomendación registrada.");
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "No se pudo registrar la decisión");
    } finally {
      setSavingDecision(false);
    }
  };

  useEffect(() => { if (!checkingSession) loadData(); }, [checkingSession]);

  useAutoRefresh(() => loadData(true), { enabled: !checkingSession, immediate: false });

  if (checkingSession || loading) return (
    <div className="flex h-64 items-center justify-center gap-3">
      <RefreshCw className="animate-spin text-[#E31E24]" size={32} />
      <span className="font-bold text-slate-500 text-sm">Cargando inteligencia…</span>
    </div>
  );

  if (err || !data) return (
    <div className="flex flex-col h-64 items-center justify-center gap-3 text-center">
      <AlertTriangle size={36} className="text-amber-400" />
      <p className="font-black text-slate-600 text-sm">No se pudieron cargar los datos</p>
      <p className="text-xs text-slate-400">{err}</p>
      <button onClick={() => loadData()} className="mt-2 px-4 py-2 bg-[#E31E24] text-white text-xs font-black rounded-xl">
        Reintentar
      </button>
    </div>
  );

  const r = data.resumen;
  const alertas = data.alertas ?? [];
  const tendencia = data.tendenciaSemanal ?? [];
  const proximos = data.proximosVencimientos ?? [];

  const tendenciaChart = tendencia.map((t) => ({ dia: t.etiqueta, Viajes: t.total }));

  return (
    <section className="space-y-6 animate-in fade-in duration-700">
      {/* ═══════ ANÁLISIS INTELIGENTE (predicción · recomendaciones · proyección) ═══════ */}
      {analitica && (
        <div className="space-y-4">
          {/* Recomendaciones automáticas del sistema */}
          <div className="bg-[#0b0f1a] rounded-2xl p-5 text-white shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-yellow-400 fill-yellow-400" />
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Recomendaciones del sistema</p>
            </div>
            <div className="space-y-2">
              {analitica.recomendaciones.map((rec, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-white/5 rounded-xl px-3.5 py-2.5 border border-white/5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                  <p className="text-sm text-gray-200 leading-snug">{rec}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Predicción de demanda */}
            <div className={CARD}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Predicción de demanda</p>
                <TrendingUp size={16} className="text-[#E31E24]" />
              </div>
              {analitica.mesPico && (
                <p className="text-xs text-slate-500 mb-3">
                  Mes de mayor demanda: <b className="text-slate-800">{analitica.mesPico.mes}</b>
                  {analitica.diaPico ? <> · día pico: <b className="text-slate-800">{analitica.diaPico.dia}</b></> : null}
                </p>
              )}
              {analitica.demandaMes.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={analitica.demandaMes.map(d => ({ mes: d.etiqueta, Viajes: d.total }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fontWeight: 700 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={26} />
                    <Tooltip />
                    <Bar dataKey="Viajes" fill="#E31E24" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-slate-300 italic py-10 text-center">Aún no hay suficientes viajes para predecir la demanda.</p>
              )}
            </div>

            {/* Proyección de ingresos + tasa de conversión */}
            <div className={CARD}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Proyección y conversión</p>
                <DollarSign size={16} className="text-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Ingresos del mes</p>
                  <p className="text-2xl font-black italic tracking-tighter text-emerald-700 mt-1">${analitica.proyeccion.ingresosMes.toLocaleString()}</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-400">Proyección fin de mes</p>
                  <p className="text-2xl font-black italic tracking-tighter text-blue-700 mt-1">${analitica.proyeccion.proyeccionMes.toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Promedio mensual</p>
                  <p className="text-xl font-black italic tracking-tighter text-slate-700 mt-1">${analitica.proyeccion.promedioHistorico.toLocaleString()}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-400">Conversión cotizaciones</p>
                  <p className="text-xl font-black italic tracking-tighter text-amber-700 mt-1">{analitica.conversion.tasa}%</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{analitica.conversion.aprobadas}/{analitica.conversion.total} aprobadas</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPIs base */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Usuarios totales", val: r.totalUsuarios, icon: Users, color: "text-blue-500", bg: "bg-blue-50" },
          { label: "Clientes", val: r.totalClientes, icon: UserCheck, color: "text-green-600", bg: "bg-green-50" },
          { label: "Vehículos", val: r.totalVehiculos, icon: Bus, color: "text-[#E31E24]", bg: "bg-red-50" },
          { label: "Conductores", val: r.totalConductores, icon: UserCheck, color: "text-amber-500", bg: "bg-amber-50" },
        ].map((item) => (
          <div key={item.label} className={CARD}>
            <div className={`inline-flex p-2.5 rounded-xl ${item.bg} ${item.color} mb-3`}><item.icon size={18} strokeWidth={2.5} /></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{item.label}</p>
            <p className="text-3xl font-black italic tracking-tighter text-slate-900 mt-1">{item.val}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className={CARD}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Asignación inteligente</p>
              <p className="text-xs text-slate-400 mt-1">Recomendación explicable para la operación</p>
            </div>
            <Sparkles size={18} className="text-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Fecha
              <input type="date" value={assignmentDate} onChange={(event) => setAssignmentDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" />
            </label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Pasajeros
              <input type="number" min={1} value={passengers} onChange={(event) => setPassengers(Number(event.target.value) || 1)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" />
            </label>
          </div>
          <button onClick={requestRecommendation} disabled={loadingRecommendation}
            className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">
            {loadingRecommendation ? "Analizando disponibilidad..." : "Generar recomendación"}
          </button>
          {recommendationError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600">{recommendationError}</p>}
          {recommendation && (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-emerald-900">{recommendation.vehiculo.placa} · {recommendation.vehiculo.modelo}</p>
                <span className="rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-black text-white">{recommendation.vehiculo.puntaje}/100</span>
              </div>
              <p className="mt-1 text-xs text-emerald-800">
                Conductor: {recommendation.vehiculo.conductor_nombre || "Sin conductor asignado"} · Capacidad: {recommendation.vehiculo.capacidad}
              </p>
              <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                Desglose del puntaje
              </p>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-emerald-800">
                <span>Capacidad: {recommendation.vehiculo.desglose.capacidad}/30</span>
                <span>Conductor: {recommendation.vehiculo.desglose.calificacion}/25</span>
                <span>Mantenimiento: {recommendation.vehiculo.desglose.mantenimiento}/25</span>
                <span>Carga: {recommendation.vehiculo.desglose.cargaOperativa}/20</span>
              </div>
              <ul className="mt-2 space-y-1 text-[10px] leading-relaxed text-emerald-800">
                {recommendation.vehiculo.razones.map((reason) => <li key={reason}>• {reason}</li>)}
              </ul>
              <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-500">
                Filtros obligatorios aplicados
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
                {recommendation.filtrosAplicados.join(" · ")}.
              </p>
              {recommendation.alternativas.length > 0 && (
                <fieldset className="mt-4 space-y-2">
                  <legend className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-600">
                    Decisión del operador
                  </legend>
                  {[recommendation.vehiculo, ...recommendation.alternativas].map((option, index) => (
                    <label key={option.vehiculo_id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
                      <input
                        type="radio"
                        name="assignment-option"
                        value={option.vehiculo_id}
                        checked={selectedVehicleId === option.vehiculo_id}
                        onChange={() => {
                          setSelectedVehicleId(option.vehiculo_id);
                          setDecisionError("");
                          setDecisionMessage("");
                        }}
                        disabled={Boolean(decisionMessage)}
                        className="accent-[#E31E24]"
                      />
                      <span className="flex-1 font-bold text-slate-700">
                        {index === 0 ? "Recomendado: " : "Alternativa: "}
                        {option.placa} · {option.modelo}
                        <span className="mt-0.5 block text-[9px] font-medium text-slate-500">
                          Cap. {option.desglose.capacidad}/30 · Conductor {option.desglose.calificacion}/25
                          · Mant. {option.desglose.mantenimiento}/25 · Carga {option.desglose.cargaOperativa}/20
                        </span>
                      </span>
                      <span className="font-black text-slate-500">{option.puntaje}/100</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {selectedVehicleId !== null && selectedVehicleId !== recommendation.vehiculo.vehiculo_id && (
                <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Motivo para elegir otra opción
                  <textarea
                    value={decisionReason}
                    onChange={(event) => setDecisionReason(event.target.value)}
                    maxLength={500}
                    rows={2}
                    disabled={Boolean(decisionMessage)}
                    placeholder="Indica la razón operativa de la elección"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium normal-case tracking-normal text-slate-700"
                  />
                </label>
              )}
              <button
                type="button"
                onClick={registerAssignmentDecision}
                disabled={savingDecision || Boolean(decisionMessage)
                  || (selectedVehicleId !== recommendation.vehiculo.vehiculo_id && !decisionReason.trim())}
                className="mt-3 w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
              >
                {savingDecision ? "Guardando decisión..." : selectedVehicleId === recommendation.vehiculo.vehiculo_id
                  ? "Aceptar recomendación"
                  : "Registrar alternativa"}
              </button>
              {decisionMessage && <p role="status" className="mt-2 rounded-lg bg-white p-2 text-xs font-bold text-emerald-800">{decisionMessage}</p>}
              {decisionError && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">{decisionError}</p>}
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                El registro guarda la decisión del operador para evaluar la recomendación; no realiza la asignación del servicio.
              </p>
              {recommendation.alternativas.length === 0 && (
                <p className="mt-2 text-[10px] text-slate-500">No se encontraron alternativas adicionales para esta fecha.</p>
              )}
              {recommendation.alternativas.length > 0 && (
                <p className="mt-2 text-[10px] text-slate-500">
                  La recomendación ordena por: {recommendation.criterios.join(", ")}.
                </p>
              )}
            </div>
          )}
        </div>

        <div className={CARD}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-[#E31E24]" />
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Índices de desempeño</p>
          </div>
          {!performance ? <p className="py-8 text-center text-xs text-slate-400">Cargando índices...</p> : (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Vehículos</p>
              {performance.vehiculos.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                  <Bus size={14} className="text-slate-400" />
                  <span className="flex-1 text-xs font-black text-slate-700">{item.placa} <span className="font-normal text-slate-400">{item.modelo}</span></span>
                  <span className="text-xs font-black text-[#E31E24]">{item.indice}/100</span>
                </div>
              ))}
              {performance.vehiculos.length === 0 && <p className="text-xs text-slate-400">Sin vehículos evaluables.</p>}
            </div>
          )}
        </div>
      </div>

      {/* COLA DE ACCIONES + PRÓXIMOS VENCIMIENTOS */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Acciones prioritarias (alertas, con link directo a donde se resuelven) */}
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-[#E31E24]" />
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Acciones prioritarias</p>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {alertas.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center">
                <CheckCircle2 size={22} className="text-emerald-500 mx-auto mb-1" />
                <p className="text-xs font-black text-emerald-700 uppercase">Sin pendientes críticos</p>
              </div>
            ) : alertas.map((a, i) => (
              <Link key={i} href={a.link} className={`group flex items-center gap-3 rounded-xl border-l-4 ${PRIORIDAD_STYLE[a.prioridad] || PRIORIDAD_STYLE.baja} px-3 py-3 hover:shadow-sm transition-all`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORIDAD_DOT[a.prioridad] || PRIORIDAD_DOT.baja}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-black text-xs text-slate-800 uppercase italic">{a.titulo}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{a.descripcion}</p>
                </div>
                <ArrowUpRight size={16} className="text-slate-300 group-hover:text-[#E31E24] transition-colors flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>

        {/* Timeline unificado: mantenimiento + cumplimiento en un solo lugar */}
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock size={16} className="text-[#E31E24]" />
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Próximos vencimientos</p>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {proximos.length === 0 ? (
              <p className="text-xs text-slate-300 font-bold text-center py-6">Nada programado por ahora</p>
            ) : proximos.map((p, i) => (
              <Link key={i} href={p.link} className="group flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 hover:border-slate-300 transition-all">
                <div className={`p-1.5 rounded-lg flex-shrink-0 ${p.tipo === "mantenimiento" ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"}`}>
                  {p.tipo === "mantenimiento" ? <Wrench size={13} /> : <ClipboardCheck size={13} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-700 truncate">{p.titulo}</p>
                  <p className={`text-[10px] font-black uppercase ${p.vencido ? "text-red-500" : "text-slate-400"}`}>
                    {p.vencido
                      ? `Vencido${p.diasRestantes !== null ? ` hace ${Math.abs(p.diasRestantes)} día(s)` : ""}`
                      : p.diasRestantes !== null ? `En ${p.diasRestantes} día(s)` : "Por kilometraje"}
                  </p>
                </div>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* TENDENCIA SEMANAL */}
      <div className={CARD}>
        <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-4">Reservas de la semana</p>
        {tendenciaChart.length === 0 ? (
          <p className="text-xs text-slate-300 font-bold py-8 text-center">Sin datos recientes</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={tendenciaChart} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: "#f8fafc" }} />
              <Bar dataKey="Viajes" fill="#E31E24" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

    </section>
  );
};
