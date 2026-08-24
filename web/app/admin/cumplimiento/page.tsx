"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "../../../lib/use-admin-guard";
import { getAuthHeaders } from "../../../lib/session";
import { useAutoRefresh } from "../../../lib/use-auto-refresh";
import {
  CalendarClock, Calendar, Car, Loader2, CheckCheck, Save, X,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type MatriculaItem = {
  vehiculo_id: number; placa: string; modelo: string | null; tipo: string | null;
  digito: number; mes: number; mes_nombre: string; target_year: number;
  fecha_limite: string; dias_para_mes: number; ultima_matricula: string | null;
  estado: string; en_alerta: boolean;
};
type MatResumen = { al_dia: number; proximos: number; en_mes: number; vencidos: number; total: number };
type CalRow = { digito: number; mes: number | null; mes_nombre: string | null };

const MAT_ESTADO: Record<string, { label: string; cls: string; dot: string }> = {
  vencido: { label: "Atrasada",  cls: "bg-red-50 text-red-700 border-red-200",         dot: "bg-red-600" },
  en_mes:  { label: "Este mes",  cls: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  proximo: { label: "Próxima",   cls: "bg-amber-50 text-amber-700 border-amber-200",    dot: "bg-amber-500" },
  al_dia:  { label: "Al día",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};

const MESES_NOMBRE = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function AdminCumplimientoPage() {
  const { checkingSession } = useAdminGuard();
  const [matriculas, setMatriculas] = useState<MatriculaItem[]>([]);
  const [matResumen, setMatResumen] = useState<MatResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [matActingId, setMatActingId] = useState<number | null>(null);
  const [calModalOpen, setCalModalOpen] = useState(false);
  const [calEdit, setCalEdit] = useState<CalRow[]>([]);
  const [savingCal, setSavingCal] = useState(false);

  const flash = (setter: (v: string) => void, value: string) => {
    setter(value);
    setTimeout(() => setter(""), 4000);
  };

  const load = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/matriculas`, { headers: getAuthHeaders() });
      if (res.ok) { const j = await res.json(); setMatriculas(j.data || []); setMatResumen(j.resumen || null); }
    } catch { /* silencio */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (!checkingSession) load(); }, [checkingSession]);
  useAutoRefresh(() => load(true), { enabled: !checkingSession, immediate: false });

  const marcarMatriculado = async (vehiculoId: number) => {
    setMatActingId(vehiculoId);
    try {
      const res = await fetch(`${API}/api/admin/matriculas/${vehiculoId}/matriculado`, {
        method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      flash(setMsg, "Matrícula registrada. El próximo aviso será el año que viene.");
      load(true);
    } catch { flash(setErr, "No se pudo registrar la matrícula"); }
    finally { setMatActingId(null); }
  };

  const abrirCalendario = async () => {
    setErr("");
    try {
      const res = await fetch(`${API}/api/admin/matriculas/calendario`, { headers: getAuthHeaders() });
      const j = await res.json();
      setCalEdit((j.data || []).map((c: CalRow) => ({ ...c, mes: c.mes || 1 })));
      setCalModalOpen(true);
    } catch { flash(setErr, "No se pudo cargar el calendario"); }
  };

  const guardarCalendario = async () => {
    setSavingCal(true); setErr("");
    try {
      const res = await fetch(`${API}/api/admin/matriculas/calendario`, {
        method: "PUT", headers: getAuthHeaders(),
        body: JSON.stringify({ items: calEdit.map(c => ({ digito: c.digito, mes: c.mes })) }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "No se pudo guardar"); }
      setCalModalOpen(false);
      flash(setMsg, "Calendario de matriculación actualizado");
      load(true);
    } catch (e: any) { flash(setErr, e.message); }
    finally { setSavingCal(false); }
  };

  if (checkingSession) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#E31E24]" size={36} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {msg && <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 text-sm font-bold rounded-r-xl">{msg}</div>}
      {err && <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-bold rounded-r-xl">{err}</div>}

      {/* AYUDA */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
        <div className="bg-[#E31E24]/10 p-2 rounded-xl shrink-0"><CalendarClock size={20} className="text-[#E31E24]" /></div>
        <p className="text-sm text-slate-600 font-medium leading-relaxed">
          El mes de matriculación de cada vehículo se calcula solo con el <b>último dígito de su placa</b>. El sistema avisa <b>30 días antes</b> del mes que le toca. Ajusta el calendario con el botón <b>Calendario</b> si cambia por año o cantón.
        </p>
      </div>

      {/* MATRICULACIÓN AUTOMÁTICA POR PLACA */}
      <div className="bg-white rounded-2xl md:rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden border-b-8 border-b-[#E31E24]">
        <div className="bg-[#0b0f1a] px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-[#E31E24] p-2.5 rounded-xl"><CalendarClock size={20} className="text-white" /></div>
            <div>
              <h2 className="text-base sm:text-lg font-black italic tracking-tighter uppercase text-white">Matriculación por placa</h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">El mes lo define el último dígito de la placa</p>
            </div>
          </div>
          <button onClick={abrirCalendario} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0">
            <Calendar size={14} /> <span className="hidden sm:inline">Calendario</span>
          </button>
        </div>

        {/* KPIs de matrícula */}
        {matResumen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 p-4 sm:p-5">
            {[
              { label: "Atrasadas", val: matResumen.vencidos, color: "text-red-600", bg: "bg-red-50 border-red-200" },
              { label: "Este mes", val: matResumen.en_mes, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
              { label: "Próximas (30d)", val: matResumen.proximos, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
              { label: "Al día", val: matResumen.al_dia, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
            ].map(k => (
              <div key={k.label} className={`${k.bg} border rounded-2xl p-3 sm:p-4 text-center`}>
                <p className={`text-2xl sm:text-3xl font-black italic tracking-tighter ${k.color}`}>{k.val}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabla de matrícula por vehículo */}
        {loading ? (
          <div className="flex items-center justify-center h-56"><Loader2 className="animate-spin text-[#E31E24]" size={32} /></div>
        ) : matriculas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 px-6 text-center">
            <Car size={44} className="text-slate-200" />
            <p className="text-sm font-black uppercase text-slate-400 italic">Sin vehículos con placa</p>
            <p className="text-xs text-slate-400 max-w-sm">Registra vehículos con placa para ver aquí su mes de matriculación automáticamente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="min-w-[720px] w-full text-left border-collapse">
              <thead><tr className="bg-slate-50/60 border-b border-slate-100">
                {["Vehículo", "Últ. dígito", "Mes que le toca", "Situación", "Última matrícula", "Acción"].map(h => (
                  <th key={h} className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {matriculas.map(m => {
                  const e = MAT_ESTADO[m.estado] || MAT_ESTADO.al_dia;
                  const situacion = m.estado === "vencido" ? "Debía matricularse ya" : m.estado === "en_mes" ? "Le toca este mes" : m.estado === "proximo" ? `Faltan ${m.dias_para_mes} días` : "Al día";
                  return (
                    <tr key={m.vehiculo_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.dot}`} />
                          <div>
                            <p className="font-black text-slate-800 text-sm">{m.placa}</p>
                            {m.modelo && <p className="text-[10px] text-slate-400">{m.modelo}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-black">{m.digito}</span></td>
                      <td className="px-5 py-3.5 text-sm font-bold text-slate-700 whitespace-nowrap">{m.mes_nombre}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[9px] font-black uppercase border ${e.cls}`}>{e.label}</span>
                        <span className="block text-[10px] text-slate-400 mt-1">{situacion}</span>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-bold text-slate-500 whitespace-nowrap">{m.ultima_matricula ? new Date(m.ultima_matricula).toLocaleDateString("es-EC") : <span className="text-slate-300 italic">Nunca</span>}</td>
                      <td className="px-5 py-3.5">
                        <button onClick={() => marcarMatriculado(m.vehiculo_id)} disabled={matActingId === m.vehiculo_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-60">
                          {matActingId === m.vehiculo_id ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />} Matriculado
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CALENDARIO DE MATRICULACIÓN */}
      {calModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-7 border-b-8 border-[#E31E24] my-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black uppercase italic tracking-tight">Calendario de matriculación</h3>
              <button onClick={() => setCalModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-5">Define en qué mes le toca matricularse a cada vehículo según el <b>último dígito</b> de su placa. Ajústalo cada año o según tu cantón.</p>
            <div className="grid grid-cols-2 gap-3 max-h-[45vh] overflow-y-auto pr-1">
              {calEdit.map((c, i) => (
                <div key={c.digito} className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#0b0f1a] text-white text-sm font-black shrink-0">{c.digito}</span>
                  <select
                    value={c.mes || 1}
                    onChange={e => { const v = Number(e.target.value); setCalEdit(prev => prev.map((x, xi) => xi === i ? { ...x, mes: v } : x)); }}
                    className="flex-1 rounded-xl border-2 border-slate-100 bg-slate-50 px-2 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#E31E24] cursor-pointer"
                  >
                    {MESES_NOMBRE.slice(1).map((nombre, idx) => (
                      <option key={idx + 1} value={idx + 1}>{nombre}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {err && <p className="text-red-600 text-sm font-bold mt-3">{err}</p>}
            <div className="flex gap-3 pt-5">
              <button onClick={() => setCalModalOpen(false)} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-500 font-black text-xs uppercase">Cancelar</button>
              <button onClick={guardarCalendario} disabled={savingCal} className="flex-1 py-3 rounded-xl bg-[#E31E24] text-white font-black text-xs uppercase hover:bg-black disabled:opacity-60 flex items-center justify-center gap-2">
                {savingCal ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
