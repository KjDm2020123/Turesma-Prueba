"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "../../../lib/use-admin-guard";
import { getAuthHeaders } from "../../../lib/session";
import { useAutoRefresh } from "../../../lib/use-auto-refresh";
import {
  Wrench, Search, Loader2,
  CheckCircle2, AlertTriangle, Clock, Car,
  DollarSign, UserCircle, Gauge, Calendar, FileDown, X,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Mantenimiento = {
  id: number;
  vehiculo_id: number;
  tipo: string;
  descripcion: string | null;
  fecha_programada: string;
  fecha_realizada: string | null;
  costo: number | null;
  estado: string;
  tecnico: string | null;
  observaciones: string | null;
  kilometraje: number | null;
  vehiculo_placa?: string;
  vehiculo_modelo?: string;
};

type Proximo = {
  vehiculo_id: number; placa: string; modelo: string;
  kilometraje: number | null;
  fecha_proximo_mantenimiento: string | null;
  proximo_km_mantenimiento: number | null;
  dias_restantes: number | null;
  km_restantes: number | null;
  prioridad: "vencido" | "urgente" | "proximo" | "programado";
};

type Vehiculo = {
  id: number; placa: string; modelo: string; marca?: string;
  tipo?: string; estado?: string; conductor_nombre?: string | null;
  viajes_realizados?: number;
};

const PRIORIDAD_STYLE: Record<string, string> = {
  vencido: "text-red-600",
  urgente: "text-amber-600",
  proximo: "text-blue-600",
  programado: "text-slate-500",
};

const ESTADO_OPTIONS = ["programado", "en_progreso", "completado", "cancelado"];
const ESTADO_BADGE: Record<string, string> = {
  programado: "bg-blue-100 text-blue-700 border-blue-200",
  en_progreso: "bg-amber-100 text-amber-700 border-amber-200",
  completado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelado: "bg-red-100 text-red-500 border-red-200",
};

export default function AdminHistorialMantenimientoPage() {
  const { checkingSession } = useAdminGuard();
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroVehiculo, setFiltroVehiculo] = useState("todos");
  const [proximos, setProximos] = useState<Proximo[]>([]);
  const [pendientes, setPendientes] = useState(0);
  // Acción sobre un próximo mantenimiento (marcar hecho / reprogramar)
  const [mantAccion, setMantAccion] = useState<{ vehiculoId: number; placa: string; modo: "completar" | "reprogramar" } | null>(null);
  const [mantFecha, setMantFecha] = useState("");
  const [mantKm, setMantKm] = useState("");
  const [mantSaving, setMantSaving] = useState(false);
  const [mantErr, setMantErr] = useState("");

  const load = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const [mRes, vRes, pRes, rRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/mantenimiento`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/admin/vehiculos`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/admin/mantenimiento/proximo`, { headers: getAuthHeaders() }).catch(() => ({ ok: false })),
        fetch(`${API_URL}/api/admin/mantenimiento/resumen`, { headers: getAuthHeaders() }).catch(() => ({ ok: false })),
      ]);
      if (mRes.ok) {
        const data = await mRes.json();
        setMantenimientos(Array.isArray(data) ? data : data.mantenimientos || data.data || []);
      }
      if (vRes.ok) setVehiculos(await vRes.json());
      if (pRes.ok) {
        const p = await (pRes as Response).json();
        setProximos(Array.isArray(p) ? p : p.proximos || p.data || []);
      }
      if (rRes.ok) {
        const r = await (rRes as Response).json();
        setPendientes(r.data?.pendientes || 0);
      }
    } catch { /* silencio */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (!checkingSession) load(); }, [checkingSession]);

  useAutoRefresh(() => load(true), { enabled: !checkingSession, immediate: false });

  const filtered = mantenimientos.filter((m) => {
    const matchSearch = !search ||
      m.tipo.toLowerCase().includes(search.toLowerCase()) ||
      (m.descripcion || "").toLowerCase().includes(search.toLowerCase()) ||
      (m.vehiculo_placa || "").toLowerCase().includes(search.toLowerCase()) ||
      (m.tecnico || "").toLowerCase().includes(search.toLowerCase());
    const matchEstado = filtroEstado === "todos" || m.estado === filtroEstado;
    const matchVehiculo = filtroVehiculo === "todos" || String(m.vehiculo_id) === filtroVehiculo;
    return matchSearch && matchEstado && matchVehiculo;
  });

  const costoTotal = mantenimientos
    .filter(m => m.estado === "completado")
    .reduce((acc, m) => acc + (Number(m.costo) || 0), 0);

  // Genera un reporte formal imprimible (PDF vía diálogo del navegador).
  // Respeta el filtro de vehículo activo: un vehículo específico o todos.
  const generarReporte = () => {
    const esGeneral = filtroVehiculo === "todos";
    const vehiculosReporte = esGeneral ? vehiculos : vehiculos.filter(v => String(v.id) === filtroVehiculo);
    const mantsReporte = (esGeneral ? mantenimientos : mantenimientos.filter(m => String(m.vehiculo_id) === filtroVehiculo))
      .slice()
      .sort((a, b) => new Date(b.fecha_realizada || b.fecha_programada).getTime() - new Date(a.fecha_realizada || a.fecha_programada).getTime());

    const vehSel = esGeneral ? null : vehiculosReporte[0];
    const titulo = esGeneral
      ? "Reporte general de mantenimiento de flota"
      : `Reporte de mantenimiento — ${vehSel?.placa || ""} ${vehSel?.modelo || ""}`;

    const hoy = new Date();
    const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();
    const inversionMes = mantsReporte
      .filter(m => {
        const f = new Date(m.fecha_realizada || m.fecha_programada);
        return m.estado === "completado" && f.getMonth() === mesActual && f.getFullYear() === anioActual;
      })
      .reduce((acc, m) => acc + (Number(m.costo) || 0), 0);
    const inversionTotal = mantsReporte
      .filter(m => m.estado === "completado")
      .reduce((acc, m) => acc + (Number(m.costo) || 0), 0);

    const proximosReporte = esGeneral ? proximos : proximos.filter(p => String(p.vehiculo_id) === filtroVehiculo);
    const criticos = proximosReporte.filter(p => p.prioridad === "vencido").length;
    const alertasProx = proximosReporte.filter(p => p.prioridad === "urgente" || p.prioridad === "proximo").length;
    const enTaller = vehiculosReporte.filter(v => v.estado === "mantenimiento").length;

    const badge = (texto: string, color: string, bg: string) =>
      `<span style="background:${bg};color:${color};padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;white-space:nowrap">${texto}</span>`;

    const filasInventario = vehiculosReporte.map(v => {
      const p = proximos.find(x => x.vehiculo_id === v.id);
      const estadoBadge = v.estado === "mantenimiento"
        ? badge("En taller", "#b45309", "#fef3c7")
        : v.estado === "en_servicio"
          ? badge("En servicio", "#1d4ed8", "#dbeafe")
          : badge(v.estado || "disponible", "#047857", "#d1fae5");
      const critBadge = p?.prioridad === "vencido" ? badge("Vencido", "#b91c1c", "#fee2e2") : badge("Ninguna", "#475569", "#f1f5f9");
      const proxBadge = p?.prioridad === "urgente" || p?.prioridad === "proximo"
        ? badge("1 alerta", "#b45309", "#fef3c7")
        : badge("Ninguna", "#475569", "#f1f5f9");
      return `<tr>
        <td><b>${v.placa}</b></td>
        <td>${v.modelo || v.tipo || "—"}</td>
        <td>${v.conductor_nombre || "Sin conductor"}</td>
        <td>${p?.kilometraje ? Number(p.kilometraje).toLocaleString() + " km" : "—"}</td>
        <td>${estadoBadge}</td>
        <td>${critBadge}</td>
        <td>${proxBadge}</td>
      </tr>`;
    }).join("");

    const filasHistorial = mantsReporte.map(m => {
      const veh = vehiculos.find(v => v.id === m.vehiculo_id);
      const tipoBadge = badge(m.tipo.replace("_", " "), "#1d4ed8", "#dbeafe");
      return `<tr>
        <td>${new Date(m.fecha_realizada || m.fecha_programada).toLocaleDateString("es-EC")}</td>
        <td><b>${m.vehiculo_placa || veh?.placa || "—"}</b></td>
        <td>${m.vehiculo_modelo || veh?.modelo || "—"}</td>
        <td>${tipoBadge}</td>
        <td>${m.tecnico || "—"}</td>
        <td>${m.descripcion || "—"}</td>
        <td style="color:#047857;font-weight:700">${m.costo ? "$" + Number(m.costo).toFixed(2) : "—"}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
        body{padding:36px;color:#1a1a1a}
        .head{text-align:center;border-bottom:3px solid #0b0f1a;padding-bottom:16px;margin-bottom:24px}
        .head h1{font-size:21px;text-transform:uppercase;letter-spacing:1px}
        .head p{font-size:12px;color:#666;margin-top:5px}
        .brand{font-size:11px;font-weight:700;letter-spacing:3px;color:#E31E24;text-transform:uppercase;margin-bottom:8px}
        .kpis{display:flex;gap:12px;margin-bottom:26px}
        .kpi{flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center}
        .kpi .t{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:6px}
        .kpi .v{font-size:20px;font-weight:800}
        .kpi .s{font-size:9px;color:#94a3b8;margin-top:4px}
        h2{font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:22px 0 10px}
        table{width:100%;border-collapse:collapse;margin-bottom:8px}
        th{background:#0b0f1a;color:#fff;text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:1px}
        td{padding:8px 10px;font-size:11px;border-bottom:1px solid #eee}
        .ft{margin-top:36px;text-align:center;font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:2px;line-height:1.8}
        @media print{.noprint{display:none}}
      </style></head><body>
      <div class="head">
        <p class="brand">Turesma S.A. — Gestión de flota vehicular</p>
        <h1>${titulo}</h1>
        <p>Generado el ${hoy.toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" })} a las ${hoy.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>

      <div class="kpis">
        <div class="kpi"><p class="t">Flota vehicular</p><p class="v">${vehiculosReporte.length} unidad${vehiculosReporte.length !== 1 ? "es" : ""}</p><p class="s">${vehiculosReporte.length - enTaller} activas / ${enTaller} en taller</p></div>
        <div class="kpi"><p class="t">Inversión del mes</p><p class="v" style="color:#047857">$${inversionMes.toFixed(2)}</p><p class="s">Mes actual</p></div>
        <div class="kpi"><p class="t">Inversión total</p><p class="v" style="color:#0369a1">$${inversionTotal.toFixed(2)}</p><p class="s">Mantenimientos completados</p></div>
        <div class="kpi"><p class="t">Alertas próximas</p><p class="v" style="color:#b45309">${alertasProx}</p><p class="s">Mantenimiento sugerido</p></div>
        <div class="kpi"><p class="t">Críticos vencidos</p><p class="v" style="color:#b91c1c">${criticos}</p><p class="s">Atención inmediata</p></div>
      </div>

      <h2>Inventario y estado de unidades</h2>
      <table>
        <thead><tr><th>Placa</th><th>Modelo</th><th>Conductor</th><th>Kilometraje</th><th>Estado</th><th>Alertas críticas</th><th>Alertas próximas</th></tr></thead>
        <tbody>${filasInventario || `<tr><td colspan="7" style="text-align:center;color:#94a3b8">Sin vehículos</td></tr>`}</tbody>
      </table>

      <h2>Historial de mantenimientos</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Placa</th><th>Vehículo</th><th>Tipo</th><th>Registrado por</th><th>Descripción del trabajo</th><th>Inversión</th></tr></thead>
        <tbody>${filasHistorial || `<tr><td colspan="7" style="text-align:center;color:#94a3b8">Sin mantenimientos registrados</td></tr>`}</tbody>
      </table>

      <div class="ft">
        Reporte generado automáticamente por el sistema de gestión Turesma<br/>
        © ${anioActual} Turesma S.A. — Todos los derechos reservados
      </div>
      <div class="noprint" style="text-align:center;margin-top:28px">
        <button onclick="window.print()" style="background:#E31E24;color:#fff;border:none;padding:12px 30px;border-radius:10px;font-weight:800;cursor:pointer;text-transform:uppercase;letter-spacing:1px">Descargar / Imprimir PDF</button>
      </div>
      </body></html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const abrirAccion = (p: Proximo, modo: "completar" | "reprogramar") => {
    setMantAccion({ vehiculoId: p.vehiculo_id, placa: p.placa, modo });
    setMantFecha(""); setMantKm(""); setMantErr("");
  };

  const ejecutarAccion = async () => {
    if (!mantAccion) return;
    if (mantAccion.modo === "reprogramar" && !mantFecha && !mantKm) {
      setMantErr("Indica la nueva fecha o el próximo kilometraje"); return;
    }
    setMantSaving(true); setMantErr("");
    try {
      const res = await fetch(`${API_URL}/api/admin/mantenimiento/${mantAccion.vehiculoId}/${mantAccion.modo}`, {
        method: "PATCH", headers: getAuthHeaders(),
        body: JSON.stringify({ proxima_fecha: mantFecha || null, proximo_km: mantKm ? Number(mantKm) : null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "No se pudo procesar");
      setMantAccion(null);
      load(true);
    } catch (e: any) { setMantErr(e.message || "Error"); }
    finally { setMantSaving(false); }
  };

  if (checkingSession) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="animate-spin text-[#E31E24]" size={36} />
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex justify-end">
        <button
          onClick={generarReporte}
          disabled={loading}
          className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-amber-500/30 disabled:opacity-60 flex-shrink-0"
        >
          <FileDown size={16} />
          {filtroVehiculo === "todos" ? "Reporte general" : "Reporte del vehículo"}
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Total registros", val: mantenimientos.length, icon: Wrench, color: "text-slate-900", bg: "bg-white" },
          { label: "Pendientes (30d/1500km)", val: pendientes, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Completados", val: mantenimientos.filter(m => m.estado === "completado").length, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Gasto total", val: `$${costoTotal.toFixed(2)}`, icon: DollarSign, color: "text-amber-600", bg: "bg-amber-50" },
        ].map((k) => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-4 sm:p-5 border border-gray-100 shadow-sm flex items-start justify-between`}>
            <div>
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400">{k.label}</p>
              <p className={`text-xl sm:text-2xl font-black italic tracking-tighter mt-1 ${k.color}`}>{k.val}</p>
            </div>
            <k.icon size={20} className={k.color} />
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 sm:p-4 flex items-center gap-3">
        <DollarSign size={16} className="text-blue-500 flex-shrink-0" />
        <p className="text-[11px] sm:text-xs font-bold text-blue-700">Este gasto se refleja en el Dashboard, en el gráfico <span className="italic">"Gasto de Mantenimiento por Vehículo"</span>.</p>
      </div>

      {/* ALERTAS DE PRÓXIMO MANTENIMIENTO (programado por el conductor: fecha y/o km) */}
      {proximos.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-amber-600" />
            <p className="text-sm font-black text-amber-700 uppercase">Próximos mantenimientos por vehículo</p>
          </div>
          <div className="space-y-2">
            {proximos.slice(0, 8).map((p) => (
              <div key={p.vehiculo_id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-100 gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Car size={14} className="text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-700">{p.placa} <span className="font-normal text-slate-400">{p.modelo}</span></p>
                    <p className="text-[10px] text-slate-400">{(p.kilometraje || 0).toLocaleString()} km actuales</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className={`text-xs font-black text-right ${PRIORIDAD_STYLE[p.prioridad]}`}>
                    <p className="uppercase tracking-widest text-[9px]">{p.prioridad}</p>
                    {p.fecha_proximo_mantenimiento && (
                      <p className="flex items-center gap-1 justify-end"><Calendar size={11} />{new Date(p.fecha_proximo_mantenimiento).toLocaleDateString("es-ES")}</p>
                    )}
                    {p.proximo_km_mantenimiento && (
                      <p className="flex items-center gap-1 justify-end"><Gauge size={11} />{p.proximo_km_mantenimiento.toLocaleString()} km</p>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => abrirAccion(p, "completar")} title="Marcar como hecho (quita el aviso)"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
                      <CheckCircle2 size={12} /> Hecho
                    </button>
                    <button onClick={() => abrirAccion(p, "reprogramar")} title="Reprogramar la fecha del próximo"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-700 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
                      <Clock size={12} /> Reprogramar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FILTROS */}
      <div className="flex flex-wrap gap-3 items-center bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-bold outline-none focus:border-amber-400 transition-all" />
        </div>
        <select value={filtroVehiculo} onChange={e => setFiltroVehiculo(e.target.value)} className="px-3 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold outline-none focus:border-amber-400 transition-all">
          <option value="todos">Todos los vehículos</option>
          {vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.modelo}</option>)}
        </select>
        <div className="flex gap-2 flex-wrap">
          {["todos", ...ESTADO_OPTIONS].map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === e ? "bg-amber-500 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {e === "todos" ? "Todos" : e.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* TABLA (SOLO LECTURA) */}
      <div className="bg-white rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden border-b-8 border-b-amber-500">
        {loading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-amber-500" size={36} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Wrench size={48} className="text-slate-200" />
            <p className="text-sm font-black uppercase text-slate-300 italic">Sin mantenimientos registrados</p>
            <p className="text-xs text-slate-400 -mt-2">Los conductores registran el mantenimiento de su vehículo asignado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100">
                  {["Vehículo", "Tipo", "Fecha", "Km", "Costo", "Registrado por", "Estado"].map(h => (
                    <th key={h} className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((m) => {
                  const veh = vehiculos.find(v => v.id === m.vehiculo_id);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Car size={16} className="text-slate-400" />
                          <div>
                            <p className="text-xs font-black text-slate-900">{m.vehiculo_placa || veh?.placa || "-"}</p>
                            <p className="text-[10px] text-slate-400">{m.vehiculo_modelo || veh?.modelo || ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs font-bold text-slate-600 capitalize">{m.tipo.replace("_", " ")}</td>
                      <td className="px-5 py-4 text-xs font-bold text-slate-600">{new Date(m.fecha_realizada || m.fecha_programada).toLocaleDateString("es-ES")}</td>
                      <td className="px-5 py-4 text-xs font-bold text-slate-600">{m.kilometraje ? `${Number(m.kilometraje).toLocaleString()} km` : "-"}</td>
                      <td className="px-5 py-4 text-xs font-black text-slate-700">{m.costo ? `$${Number(m.costo).toFixed(2)}` : "-"}</td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5"><UserCircle size={13} className="text-slate-300" />{m.tecnico || "-"}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase border ${ESTADO_BADGE[m.estado] || ESTADO_BADGE.programado}`}>
                          {m.estado.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: marcar hecho / reprogramar próximo mantenimiento */}
      {mantAccion && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-7 border-b-8 border-amber-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black uppercase italic tracking-tight">
                {mantAccion.modo === "completar" ? "Marcar como hecho" : "Reprogramar"}
              </h3>
              <button onClick={() => setMantAccion(null)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Vehículo <b>{mantAccion.placa}</b>.{" "}
              {mantAccion.modo === "completar"
                ? "Se registrará como realizado y se quitará el aviso. Si quieres, programa el próximo abajo (opcional)."
                : "Indica la nueva fecha y/o kilometraje del próximo mantenimiento."}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">
                  Próxima fecha{mantAccion.modo === "completar" ? " (opcional)" : ""}
                </label>
                <input type="date" value={mantFecha} min={new Date().toISOString().slice(0, 10)} onChange={e => setMantFecha(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-amber-400" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Próximo km (opcional)</label>
                <input type="number" min="0" value={mantKm} onChange={e => setMantKm(e.target.value)} placeholder="Ej: 50000"
                  className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-amber-400" />
              </div>
            </div>
            {mantErr && <p className="text-red-600 text-sm font-bold mt-3">{mantErr}</p>}
            <div className="flex gap-3 pt-5">
              <button onClick={() => setMantAccion(null)} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-500 font-black text-xs uppercase">Cancelar</button>
              <button onClick={ejecutarAccion} disabled={mantSaving} className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-black text-xs uppercase hover:bg-amber-600 disabled:opacity-60 flex items-center justify-center gap-2">
                {mantSaving ? <Loader2 size={14} className="animate-spin" /> : (mantAccion.modo === "completar" ? <CheckCircle2 size={14} /> : <Clock size={14} />)}
                {mantAccion.modo === "completar" ? "Confirmar" : "Reprogramar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
