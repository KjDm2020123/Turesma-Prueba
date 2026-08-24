"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminGuard } from "../../../lib/use-admin-guard";
import { getAuthHeaders } from "../../../lib/session";
import { useAutoRefresh } from "../../../lib/use-auto-refresh";
import { WhatsAppButton } from "../../../components/whatsapp-button";
import { useConfirm } from "../../../components/confirm-dialog";
import {
  FileText, RefreshCw, Check, X, Eye, Loader2,
  MapPin, Users, Calendar, DollarSign, Clock, Car,
  MessageSquare, TrendingUp, CheckCircle2, XCircle,
  Printer, Send
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Cotizacion = {
  id: number;
  usuario_id: number;
  cliente_nombre: string;
  cliente_email: string;
  cliente_telefono?: string | null;
  origen: string;
  destino: string;
  fecha_servicio: string;
  fecha_fin?: string | null;
  num_personas: number;
  tipo_vehiculo?: string | null;
  notas?: string | null;
  estado: string;
  precio_estimado?: number | null;
  precio_final?: number | null;
  precio_propuesto?: number | null;
  turno?: string | null;
  valor_ofrecido?: number | null;
  duracion_valor?: number | null;
  duracion_unidad?: string | null;
  hora_salida?: string | null;
  vehiculo_id?: number | null;
  vehiculo_placa?: string | null;
  vehiculo_modelo?: string | null;
  respuesta_admin?: string | null;
  reserva_id?: number | null;
  creado_en: string;
};

type Resumen = {
  pendientes: number;
  aprobadas: number;
  rechazadas: number;
  total: number;
  ingresos_generados: number;
};

const ESTADO_BADGE: Record<string, string> = {
  pendiente:   "bg-amber-100 text-amber-700 border-amber-200",
  negociacion: "bg-purple-100 text-purple-700 border-purple-200",
  aprobada:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  rechazada:   "bg-red-100 text-red-500 border-red-200",
};

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  negociacion: "Negociando",
  aprobada:  "Aprobada",
  rechazada: "Rechazada",
};

type NegoItem = { actor: string; precio: number | null; mensaje: string | null; creado_en: string };

const INPUT_CLS = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition-all focus:border-[#E31E24] focus:bg-white placeholder:font-normal";

function AdminCotizacionesContent() {
  const { checkingSession } = useAdminGuard();
  const confirmar = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pendingFocusId = useRef<number | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("pendiente");
  const [selected, setSelected] = useState<Cotizacion | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "aprobar" | "rechazar" | "contraoferta">("view");
  const [precioFinal, setPrecioFinal] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [nego, setNego] = useState<NegoItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const [cotRes, resRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/cotizaciones?estado=${filtro}`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/admin/cotizaciones/resumen`, { headers: getAuthHeaders() }),
      ]);
      if (cotRes.ok) setCotizaciones(await cotRes.json());
      if (resRes.ok) setResumen(await resRes.json());
    } catch { /* silencio */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (!checkingSession) load(); }, [checkingSession, filtro]);

  useAutoRefresh(() => load(true), { enabled: !checkingSession, immediate: false });

  // ── PROFORMA ────────────────────────────────────────────────────────────────
  const [proformaBusyId, setProformaBusyId] = useState<number | null>(null);

  const fetchProforma = async (cotId: number) => {
    const res = await fetch(`${API_URL}/api/admin/cotizaciones/${cotId}/proforma`, { headers: getAuthHeaders() });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "No se pudo generar la proforma");
    return j.data;
  };

  const fmtUSD = (n: number) => Number(n || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtFechaProf = (f: any) => {
    if (!f) return "";
    const d = new Date(f);
    return Number.isNaN(d.getTime()) ? String(f) : `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
  };

  // Abre la proforma imprimible replicando el formato físico de la empresa.
  const verProforma = async (c: Cotizacion) => {
    setProformaBusyId(c.id); setErr("");
    try {
      const d = await fetchProforma(c.id);
      const e = d.empresa;
      const logoUrl = `${window.location.origin}/logo.png`;
      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Proforma ${d.numero} — Turesma</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a}
          body{padding:40px;max-width:760px;margin:0 auto;font-size:12px}
          .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:26px}
          .head .txt{flex:1;text-align:center}
          .head .txt p{margin:2px 0}
          .lema{font-weight:800;font-size:13px}
          .cursiva{font-style:italic;font-size:11.5px}
          .rucline{font-weight:800;font-size:12.5px;margin-top:5px}
          .mail{color:#2563eb;text-decoration:underline}
          .head img{height:88px;width:auto}
          .clirow{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}
          .cliname{font-weight:800;text-transform:uppercase;max-width:420px}
          .prof{font-weight:800;white-space:nowrap}
          .dato{margin:3px 0}
          table{width:100%;border-collapse:collapse;margin-top:14px}
          th{border:1px solid #1a1a1a;padding:8px;font-size:10.5px}
          td{border:1px solid #1a1a1a;padding:10px;vertical-align:top;font-size:11.5px}
          .desc-cell{height:250px}
          .num{text-align:right}
          .ctr{text-align:center}
          .total-lbl{font-weight:800;text-align:center}
          .total-val{font-weight:800;text-align:right}
          .noborder{border:none}
          .foot{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-top:34px}
          .foot p{margin:3px 0;font-size:11.5px}
          .banco b{font-weight:800}
          .firma{text-align:center;min-width:220px}
          .firma .linea{border-top:1px solid #1a1a1a;padding-top:6px;font-weight:800}
          .firma .cargo{font-weight:700}
          @media print{.noprint{display:none}body{padding:20px}}
        </style></head><body>
        <div class="head">
          <div class="txt">
            <p class="lema">${e.lema}</p>
            <p class="cursiva">${e.sub1}</p>
            <p class="cursiva">${e.sub2}</p>
            <p class="rucline">${e.nombre}&nbsp;&nbsp;RUC: ${e.ruc}</p>
            <p><b>Razón Social:</b> ${e.razon}</p>
            <p><b>Dirección:</b> ${e.direccion}</p>
            <p><b>Teléfono:</b> ${e.telefonos}</p>
            <p><b>Email:</b> <span class="mail">${e.email}</span></p>
          </div>
          <img src="${logoUrl}" alt="Turesma" onerror="this.style.display='none'"/>
        </div>

        <div class="clirow">
          <p class="cliname">${d.cliente.nombre || ""}</p>
          <p class="prof">PROFORMA. ${d.numero}</p>
        </div>
        <p class="dato"><b>${d.cliente.cedula && String(d.cliente.cedula).length === 13 ? "RUC" : "CÉDULA"}:</b>&nbsp;&nbsp;${d.cliente.cedula || "—"}</p>
        <p class="dato"><b>FECHA:</b>&nbsp;&nbsp;${fmtFechaProf(d.fecha)}</p>

        <table>
          <thead><tr><th style="width:80px">CANTIDAD</th><th>DESCRIPCION</th><th style="width:95px">P. UNITARIO</th><th style="width:95px">P. TOTAL</th></tr></thead>
          <tbody>
            <tr>
              <td class="ctr desc-cell">1</td>
              <td class="desc-cell">
                Servicio de Transporte<br/><br/>
                <b>Ruta:</b> ${d.servicio.origen} → ${d.servicio.destino}<br/>
                <b>Salida:</b> ${fmtFechaProf(d.servicio.fecha_servicio)}${d.servicio.hora_salida ? " · " + d.servicio.hora_salida : ""} · ${d.servicio.num_personas} pasajero(s)<br/><br/>
                ${d.servicio.notas ? d.servicio.notas : "Servicio de transporte para traslado de personal."}
              </td>
              <td class="num desc-cell">${fmtUSD(d.precio)}</td>
              <td class="num desc-cell">${fmtUSD(d.precio)}</td>
            </tr>
            <tr>
              <td class="noborder" colspan="2"></td>
              <td class="total-lbl">TOTAL USD</td>
              <td class="total-val">${fmtUSD(d.precio)}</td>
            </tr>
          </tbody>
        </table>

        <div class="foot">
          <div class="banco">
            <p><b>${e.banco.nombre}</b></p>
            <p><b>Cuenta:</b> ${e.banco.tipo}</p>
            <p><b>Numero:</b> ${e.banco.numero}</p>
            <p><b>Nombre:</b> ${e.banco.titular}</p>
            <p><b>RUC:</b> ${e.banco.ruc}</p>
          </div>
          <div class="firma">
            <p class="linea">${e.gerente}</p>
            <p class="cargo">${e.cargoGerente}</p>
          </div>
        </div>

        <div class="noprint" style="text-align:center;margin-top:30px">
          <button onclick="window.print()" style="background:#E31E24;color:#fff;border:none;padding:12px 30px;border-radius:10px;font-weight:800;cursor:pointer;text-transform:uppercase;letter-spacing:1px">Descargar / Imprimir PDF</button>
        </div>
        </body></html>`;

      const win = window.open("", "_blank");
      if (!win) throw new Error("El navegador bloqueó la ventana emergente");
      win.document.write(html);
      win.document.close();
      load(true);
    } catch (e: any) { setErr(e.message || "No se pudo generar la proforma"); }
    finally { setProformaBusyId(null); }
  };

  // Envía la proforma al correo del cliente (previa confirmación del admin).
  const enviarProforma = async (c: Cotizacion) => {
    if (!(await confirmar({
      title: "Enviar proforma",
      message: `¿Enviar la proforma al correo del cliente (${c.cliente_email})?`,
      confirmText: "Enviar",
    }))) return;
    setProformaBusyId(c.id); setErr(""); setMsg("");
    try {
      const res = await fetch(`${API_URL}/api/admin/cotizaciones/${c.id}/proforma/enviar`, {
        method: "POST", headers: getAuthHeaders(),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "No se pudo enviar la proforma");
      setMsg(j.message || "Proforma enviada al cliente");
      load(true);
    } catch (e: any) { setErr(e.message || "No se pudo enviar la proforma"); }
    finally { setProformaBusyId(null); }
  };

  // La proforma se puede generar cuando la cotización ya tiene un precio.
  const tieneProforma = (c: Cotizacion) =>
    c.estado !== "rechazada" && (Number(c.precio_final) > 0 || Number(c.precio_estimado) > 0);

  const openModal = async (cot: Cotizacion, mode: "view" | "aprobar" | "rechazar" | "contraoferta") => {
    setSelected(cot);
    setModalMode(mode);
    setPrecioFinal(cot.precio_final ? String(cot.precio_final) : cot.precio_propuesto ? String(cot.precio_propuesto) : cot.valor_ofrecido ? String(cot.valor_ofrecido) : "");
    setRespuesta("");
    setNego([]);
    setMsg(""); setErr("");
    try {
      const r = await fetch(`${API_URL}/api/admin/cotizaciones/${cot.id}/negociacion`, { headers: getAuthHeaders() });
      if (r.ok) setNego(await r.json());
    } catch { /* silencio */ }
  };

  // Si llegamos desde una notificación (?id=123), forzamos el filtro a "todas"
  // para asegurar que la cotización aparezca sin importar su estado.
  useEffect(() => {
    const idParam = searchParams.get("id");
    if (!idParam) return;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) return;
    pendingFocusId.current = id;
    setFiltro("todas");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Una vez cargada la lista, si hay una cotización pendiente de enfocar, la abrimos.
  useEffect(() => {
    if (!pendingFocusId.current || cotizaciones.length === 0) return;
    const target = cotizaciones.find((c) => c.id === pendingFocusId.current);
    if (target) {
      openModal(target, "view");
      pendingFocusId.current = null;
      router.replace("/admin/cotizaciones");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotizaciones]);

  const handleContraoferta = async () => {
    if (!selected || !precioFinal) { setErr("Ingresa el precio que propones"); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_URL}/api/admin/cotizaciones/${selected.id}/contraoferta`, {
        method: "PATCH", headers: getAuthHeaders(),
        body: JSON.stringify({ precio_propuesto: Number(precioFinal), mensaje: respuesta }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg("Contraoferta enviada al cliente. Espera su respuesta.");
      setSelected(null);
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleAprobar = async () => {
    if (!selected || !precioFinal) { setErr("Ingresa el precio final"); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_URL}/api/admin/cotizaciones/${selected.id}/aprobar`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ precio_final: Number(precioFinal), respuesta_admin: respuesta }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`✅ Cotización aprobada. Reserva #${data.reserva_id} creada.`);
      setSelected(null);
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleRechazar = async () => {
    if (!selected) return;
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API_URL}/api/admin/cotizaciones/${selected.id}/rechazar`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ respuesta_admin: respuesta || "No disponible por el momento" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg("Cotización rechazada.");
      setSelected(null);
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  if (checkingSession) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="animate-spin text-[#E31E24]" size={36} />
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* HEADER */}
      {/* KPI CARDS */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Pendientes", val: resumen.pendientes, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: Clock },
            { label: "Aprobadas", val: resumen.aprobadas,  color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle2 },
            { label: "Rechazadas", val: resumen.rechazadas, color: "text-red-500", bg: "bg-red-50", border: "border-red-200", icon: XCircle },
            { label: "Ingresos generados", val: `$${Number(resumen.ingresos_generados).toFixed(0)}`, color: "text-slate-900", bg: "bg-white", border: "border-slate-200", icon: TrendingUp },
          ].map(k => (
            <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl p-4 sm:p-5 shadow-sm flex items-start justify-between`}>
              <div>
                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400">{k.label}</p>
                <p className={`text-2xl sm:text-3xl font-black italic tracking-tighter mt-1 ${k.color}`}>{k.val}</p>
              </div>
              <k.icon size={20} className={k.color} />
            </div>
          ))}
        </div>
      )}

      {/* MENSAJES */}
      {msg && <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 text-sm font-bold rounded-r-xl">{msg}</div>}
      {err && <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-bold rounded-r-xl">{err}</div>}

      {/* FILTRO TABS */}
      <div className="flex gap-2 flex-wrap">
        {["pendiente", "negociacion", "aprobada", "rechazada", "todas"].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtro === f ? "bg-[#E31E24] text-white shadow-sm" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"}`}>
            {f === "todas" ? "Todas" : ESTADO_LABEL[f]}
          </button>
        ))}
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden border-b-8 border-b-[#E31E24]">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin text-[#E31E24]" size={36} />
          </div>
        ) : cotizaciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <FileText size={48} className="text-slate-200" />
            <p className="text-sm font-black uppercase text-slate-300 italic">Sin cotizaciones {filtro === "todas" ? "" : ESTADO_LABEL[filtro]?.toLowerCase()}s</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-50">
              {cotizaciones.map(c => (
                <div key={c.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-slate-900 text-sm">{c.cliente_nombre}</p>
                      <p className="text-[10px] text-slate-400">{c.cliente_email}</p>
                    </div>
                    <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border whitespace-nowrap ${ESTADO_BADGE[c.estado]}`}>
                      {ESTADO_LABEL[c.estado]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 rounded-xl p-2.5">
                      <p className="text-[9px] text-slate-400 font-black uppercase">Origen</p>
                      <p className="font-bold text-slate-700 truncate">{c.origen}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2.5">
                      <p className="text-[9px] text-slate-400 font-black uppercase">Destino</p>
                      <p className="font-bold text-slate-700 truncate">{c.destino}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openModal(c, "view")} className="flex-1 py-2 text-[10px] font-black uppercase bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all flex items-center justify-center gap-1">
                      <Eye size={12} /> Ver
                    </button>
                    {tieneProforma(c) && (
                      <>
                        <button onClick={() => verProforma(c)} disabled={proformaBusyId === c.id} className="flex-1 py-2 text-[10px] font-black uppercase bg-[#0b0f1a] hover:bg-black text-white rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-60">
                          {proformaBusyId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />} Proforma
                        </button>
                        <button onClick={() => enviarProforma(c)} disabled={proformaBusyId === c.id} className="py-2 px-3 text-[10px] font-black uppercase bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-60" title="Enviar proforma al correo del cliente">
                          <Send size={12} />
                        </button>
                      </>
                    )}
                    {["pendiente", "negociacion"].includes(c.estado) && (
                      <>
                        <button onClick={() => openModal(c, "aprobar")} className="flex-1 py-2 text-[10px] font-black uppercase bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-all flex items-center justify-center gap-1">
                          <Check size={12} /> Aprobar
                        </button>
                        <button onClick={() => openModal(c, "contraoferta")} className="flex-1 py-2 text-[10px] font-black uppercase bg-purple-500 hover:bg-purple-600 text-white rounded-xl transition-all flex items-center justify-center gap-1">
                          <DollarSign size={12} /> Contraoferta
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[900px] w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    {["#", "Cliente", "Ruta", "Fecha", "Personas", "Tipo Vehículo", "Estado", "Acciones"].map(h => (
                      <th key={h} className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cotizaciones.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-5 py-4 text-xs font-black text-slate-400">#{c.id}</td>
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-900 text-sm">{c.cliente_nombre}</p>
                        <p className="text-[10px] text-slate-400">{c.cliente_email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <MapPin size={12} className="text-[#E31E24] flex-shrink-0" />
                          <span className="truncate max-w-[140px]">{c.origen}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                          <MapPin size={10} className="flex-shrink-0" />
                          <span className="truncate max-w-[140px]">{c.destino}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs font-bold text-slate-600 whitespace-nowrap">
                        {new Date(c.fecha_servicio).toLocaleDateString("es-EC")}
                        {c.fecha_fin && c.fecha_fin !== c.fecha_servicio && (
                          <span className="block text-[10px] text-[#E31E24] font-black">→ {new Date(c.fecha_fin).toLocaleDateString("es-EC")}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm font-black text-slate-700">{c.num_personas}</td>
                      <td className="px-5 py-4 text-xs text-slate-600 capitalize">{c.tipo_vehiculo || "—"}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[9px] font-black uppercase border ${ESTADO_BADGE[c.estado]}`}>
                          {ESTADO_LABEL[c.estado]}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1.5">
                          <button onClick={() => openModal(c, "view")} className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500" title="Ver detalles">
                            <Eye size={15} />
                          </button>
                          {tieneProforma(c) && (
                            <>
                              <button onClick={() => verProforma(c)} disabled={proformaBusyId === c.id} className="p-2 hover:bg-slate-200 bg-slate-100 rounded-xl transition-all text-slate-700 disabled:opacity-60" title="Ver / imprimir proforma">
                                {proformaBusyId === c.id ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                              </button>
                              <button onClick={() => enviarProforma(c)} disabled={proformaBusyId === c.id} className="p-2 hover:bg-blue-50 rounded-xl transition-all text-blue-600 disabled:opacity-60" title="Enviar proforma al correo del cliente">
                                <Send size={15} />
                              </button>
                            </>
                          )}
                          {["pendiente", "negociacion"].includes(c.estado) && (
                            <>
                              <button onClick={() => openModal(c, "aprobar")} className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-all" title="Aprobar">
                                <Check size={15} />
                              </button>
                              <button onClick={() => openModal(c, "contraoferta")} className="p-2 hover:bg-purple-50 text-purple-600 rounded-xl transition-all" title="Contraofertar precio">
                                <DollarSign size={15} />
                              </button>
                              <button onClick={() => openModal(c, "rechazar")} className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition-all" title="Rechazar">
                                <X size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* MODAL */}
      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0f1a]/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-[2rem] bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 my-4">
            {/* Modal Header */}
            <div className={`p-5 sm:p-6 flex items-center justify-between text-white ${modalMode === "aprobar" ? "bg-emerald-600" : modalMode === "rechazar" ? "bg-red-600" : modalMode === "contraoferta" ? "bg-purple-600" : "bg-[#0b0f1a]"}`}>
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  {modalMode === "aprobar" ? <Check size={20} /> : modalMode === "rechazar" ? <X size={20} /> : modalMode === "contraoferta" ? <DollarSign size={20} /> : <Eye size={20} />}
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black italic tracking-tighter uppercase">
                    {modalMode === "aprobar" ? "Aprobar Cotización" : modalMode === "rechazar" ? "Rechazar Cotización" : modalMode === "contraoferta" ? "Contraofertar Precio" : "Detalle de Cotización"}
                  </h2>
                  <p className="text-[10px] text-white/70 font-bold">Cotización #{selected.id}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={18} /></button>
            </div>

            <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Cliente info */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</p>
                <p className="font-black text-slate-900">{selected.cliente_nombre}</p>
                <p className="text-xs text-slate-500">{selected.cliente_email}</p>
                {selected.cliente_telefono && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500">{selected.cliente_telefono}</p>
                    <WhatsAppButton telefono={selected.cliente_telefono} title={`WhatsApp de ${selected.cliente_nombre}`} mensaje={`Hola ${selected.cliente_nombre}, le contactamos de Turesma sobre su cotización #${selected.id}.`} />
                  </div>
                )}
              </div>

              {/* Ruta */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1"><MapPin size={9} />Origen</p>
                  <p className="text-sm font-bold text-slate-700">{selected.origen}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1"><MapPin size={9} />Destino</p>
                  <p className="text-sm font-bold text-slate-700">{selected.destino}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1"><Calendar size={9} />Fecha</p>
                  <p className="text-sm font-bold text-slate-700">
                    {new Date(selected.fecha_servicio).toLocaleDateString("es-EC")}
                    {selected.fecha_fin && selected.fecha_fin !== selected.fecha_servicio && ` → ${new Date(selected.fecha_fin).toLocaleDateString("es-EC")}`}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1"><Users size={9} />Personas</p>
                  <p className="text-sm font-bold text-slate-700">{selected.num_personas}</p>
                </div>
              </div>

              {/* Vehículo elegido / duración / valor ofrecido */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3">
                  <Car size={16} className="text-[#E31E24] flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Vehículo</p>
                    <p className="text-sm font-bold text-slate-700 truncate">
                      {selected.vehiculo_placa ? `${selected.vehiculo_placa}${selected.vehiculo_modelo ? " · " + selected.vehiculo_modelo : ""}` : (selected.tipo_vehiculo || "Sin preferencia")}
                    </p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3">
                  <Clock size={16} className="text-blue-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Hora de salida</p>
                    <p className="text-sm font-bold text-slate-700">{selected.hora_salida || "—"}</p>
                  </div>
                </div>
              </div>

              {selected.valor_ofrecido != null && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                  <DollarSign size={18} className="text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-600">Valor ofrecido por el cliente</p>
                    <p className="text-lg font-black text-amber-700">${Number(selected.valor_ofrecido).toFixed(2)}</p>
                  </div>
                </div>
              )}

              {selected.notas && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1 flex items-center gap-1"><MessageSquare size={9} />Mensaje del cliente</p>
                  <p className="text-sm text-amber-800 whitespace-pre-line">{selected.notas}</p>
                </div>
              )}

              {selected.respuesta_admin && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 mb-1">Respuesta del admin</p>
                  <p className="text-sm text-blue-800">{selected.respuesta_admin}</p>
                </div>
              )}

              {/* HISTORIAL DE NEGOCIACIÓN */}
              {nego.length > 0 && (
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Negociación</p>
                  <div className="space-y-2">
                    {nego.map((h, i) => (
                      <div key={i} className={`flex ${h.actor === "admin" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${h.actor === "admin" ? "bg-[#E31E24] text-white" : "bg-white border border-slate-200 text-slate-700"}`}>
                          <p className="text-[8px] font-black uppercase tracking-widest opacity-70">{h.actor === "admin" ? "Turesma" : "Cliente"}</p>
                          {h.precio != null && <p className="text-sm font-black">${Number(h.precio).toFixed(2)}</p>}
                          {h.mensaje && <p className="text-[11px] opacity-90">{h.mensaje}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {selected.estado === "negociacion" && selected.turno === "cliente" && (
                    <p className="text-[10px] font-bold text-purple-500 mt-3 text-center">⏳ Esperando respuesta del cliente</p>
                  )}
                </div>
              )}

              {/* FORM CONTRAOFERTA */}
              {modalMode === "contraoferta" && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Precio que propones ($) *</label>
                    <div className="flex items-center gap-2 rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 focus-within:border-purple-500 transition-all">
                      <DollarSign size={16} className="text-purple-600" />
                      <input type="number" step="0.01" min="0" value={precioFinal} onChange={e => setPrecioFinal(e.target.value)} placeholder="Ej: 280.00" className="w-full bg-transparent font-bold text-slate-700 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Mensaje para el cliente</label>
                    <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)} rows={2} placeholder="Ej: Por esa ruta y duración, el precio justo sería..." className={INPUT_CLS + " resize-none"} />
                  </div>
                  {err && <p className="text-red-600 text-xs font-bold">{err}</p>}
                  <button onClick={handleContraoferta} disabled={saving} className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />} Enviar contraoferta
                  </button>
                </div>
              )}

              {/* Acciones */}
              {modalMode === "aprobar" && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Precio Final ($) *</label>
                    <div className="flex items-center gap-2 rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 focus-within:border-emerald-500 transition-all">
                      <DollarSign size={16} className="text-emerald-600" />
                      <input
                        type="number" step="0.01" min="0"
                        value={precioFinal}
                        onChange={e => setPrecioFinal(e.target.value)}
                        placeholder="Ej: 150.00"
                        className="w-full bg-transparent font-bold text-slate-700 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Mensaje para el cliente (opcional)</label>
                    <textarea
                      value={respuesta}
                      onChange={e => setRespuesta(e.target.value)}
                      rows={2}
                      placeholder="Ej: Su cotización fue aprobada. El vehículo estará listo..."
                      className={INPUT_CLS + " resize-none"}
                    />
                  </div>
                  {err && <p className="text-red-600 text-xs font-bold">{err}</p>}
                  <button onClick={handleAprobar} disabled={saving}
                    className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    Confirmar Aprobación
                  </button>
                </div>
              )}

              {modalMode === "rechazar" && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Motivo del rechazo</label>
                    <textarea
                      value={respuesta}
                      onChange={e => setRespuesta(e.target.value)}
                      rows={3}
                      placeholder="Ej: No tenemos disponibilidad para esa fecha..."
                      className={INPUT_CLS + " resize-none"}
                    />
                  </div>
                  {err && <p className="text-red-600 text-xs font-bold">{err}</p>}
                  <button onClick={handleRechazar} disabled={saving}
                    className="w-full py-3.5 bg-[#E31E24] hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                    Confirmar Rechazo
                  </button>
                </div>
              )}

              {modalMode === "view" && ["pendiente", "negociacion"].includes(selected.estado) && (
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <button onClick={() => setModalMode("aprobar")} className="py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] uppercase rounded-2xl transition-all flex items-center justify-center gap-1">
                    <Check size={14} /> Aprobar
                  </button>
                  <button onClick={() => setModalMode("contraoferta")} className="py-3 bg-purple-500 hover:bg-purple-600 text-white font-black text-[10px] uppercase rounded-2xl transition-all flex items-center justify-center gap-1">
                    <DollarSign size={14} /> Contraoferta
                  </button>
                  <button onClick={() => setModalMode("rechazar")} className="py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-black text-[10px] uppercase rounded-2xl transition-all flex items-center justify-center gap-1">
                    <X size={14} /> Rechazar
                  </button>
                </div>
              )}

              {selected.reserva_id && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-emerald-600" />
                  <div>
                    <p className="text-xs font-black text-emerald-700">Reserva generada</p>
                    <p className="text-[10px] text-emerald-600">Reserva #{selected.reserva_id} creada en el sistema</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// useSearchParams() debe ir dentro de un <Suspense> para que el build de
// producción de Next.js no falle (bailout de renderizado en cliente).
export default function AdminCotizacionesPage() {
  return (
    <Suspense fallback={null}>
      <AdminCotizacionesContent />
    </Suspense>
  );
}
