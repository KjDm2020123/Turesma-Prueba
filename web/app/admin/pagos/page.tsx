"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "../../../lib/use-admin-guard";
import { getAuthHeaders } from "../../../lib/session";
import { useAutoRefresh } from "../../../lib/use-auto-refresh";
import {
  CreditCard, Loader2, CheckCircle2, XCircle,
  MapPin, ArrowRight, X, Link2, Send, ImageIcon,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Pago = {
  id: number; reserva_id: number; monto: number; metodo: string;
  comprobante_url: string | null; estado: string; notas_admin: string | null;
  creado_en: string; revisado_en: string | null;
  reserva_total: number; origen: string | null; destino: string | null; reserva_estado: string;
  reserva_monto_pagado: number; reserva_estado_pago: string;
  cliente_nombre: string; cliente_email: string;
};

type ReservaParaLink = {
  id: number; usuario_nombre: string; origen: string | null; destino: string | null;
  total: number; estado: string; estado_pago: string;
};

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700 border-amber-200",
  aprobado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rechazado: "bg-red-100 text-red-500 border-red-200",
};

const METODO_LABEL: Record<string, string> = {
  transferencia: "Transferencia",
  link_pago: "Link de pago",
};

const INPUT = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none transition-all focus:border-[#E31E24] focus:bg-white";

export default function AdminPagosPage() {
  const { checkingSession } = useAdminGuard();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("pendiente");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [rechazarId, setRechazarId] = useState<number | null>(null);
  const [notaRechazo, setNotaRechazo] = useState("");
  const [actingId, setActingId] = useState<number | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);

  const [linkReservaId, setLinkReservaId] = useState("");
  const [linkPago, setLinkPago] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [reservasParaLink, setReservasParaLink] = useState<ReservaParaLink[]>([]);

  const load = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/pagos?estado=${filtro}`, { headers: getAuthHeaders() });
      if (res.ok) setPagos(await res.json());
    } catch { /* silencio */ }
    finally { setLoading(false); }
  };

  const loadReservasParaLink = async (silencioso = false) => {
    try {
      const res = await fetch(`${API}/api/admin/reservas`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data: ReservaParaLink[] = await res.json();
      // Solo tiene sentido mandar link de pago a reservas que aun no estan
      // canceladas y que todavia no completan el minimo de pago requerido.
      setReservasParaLink(
        data
          .filter(r => r.estado !== "cancelada" && r.estado_pago !== "confirmado")
          .sort((a, b) => b.id - a.id)
      );
    } catch { /* silencio */ }
  };

  useEffect(() => { if (!checkingSession) { load(); loadReservasParaLink(); } }, [checkingSession, filtro]);

  useAutoRefresh(() => { load(true); loadReservasParaLink(true); }, { enabled: !checkingSession, immediate: false });

  const aprobar = async (id: number) => {
    setActingId(id); setErr(""); setMsg("");
    try {
      const res = await fetch(`${API}/api/admin/pagos/${id}/aprobar`, { method: "PATCH", headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo aprobar");
      setMsg("Pago aprobado correctamente");
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setActingId(null); }
  };

  const rechazar = async () => {
    if (!rechazarId) return;
    setActingId(rechazarId); setErr(""); setMsg("");
    try {
      const res = await fetch(`${API}/api/admin/pagos/${rechazarId}/rechazar`, {
        method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ notas: notaRechazo || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo rechazar");
      setMsg("Pago rechazado");
      setRechazarId(null); setNotaRechazo("");
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setActingId(null); }
  };

  const enviarLink = async () => {
    if (!linkReservaId || !linkPago) { setErr("Selecciona una reserva e indica el link"); return; }
    setSavingLink(true); setErr(""); setMsg("");
    try {
      const res = await fetch(`${API}/api/admin/reservas/${linkReservaId}/link-pago`, {
        method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ link_pago: linkPago }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar el link");
      setMsg(`Link de pago enviado para la reserva #${linkReservaId}`);
      setLinkReservaId(""); setLinkPago("");
      loadReservasParaLink();
    } catch (e: any) { setErr(e.message); }
    finally { setSavingLink(false); }
  };

  const pendientes = pagos.filter(p => p.estado === "pendiente").length;

  if (checkingSession) return (
    <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#E31E24]" size={36} /></div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {msg && <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 text-sm font-bold rounded-r-xl">{msg}</div>}
      {err && <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-bold rounded-r-xl">{err}</div>}

      {/* ENVIAR LINK DE PAGO */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 mb-3"><Link2 size={14} /> Enviar link de pago a una reserva</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={linkReservaId} onChange={e => setLinkReservaId(e.target.value)} className={INPUT + " sm:w-72"}>
            <option value="">
              {reservasParaLink.length === 0 ? "Sin reservas pendientes de pago" : "Selecciona una reserva..."}
            </option>
            {reservasParaLink.map(r => (
              <option key={r.id} value={r.id}>
                #{r.id} · {r.usuario_nombre} · {r.origen || "—"} → {r.destino || "—"} · ${Number(r.total).toFixed(0)}
              </option>
            ))}
          </select>
          <input value={linkPago} onChange={e => setLinkPago(e.target.value)} placeholder="https://..." className={INPUT + " flex-1"} />
          <button onClick={enviarLink} disabled={savingLink}
            className="flex items-center justify-center gap-2 bg-[#E31E24] hover:bg-black text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-60 flex-shrink-0">
            {savingLink ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex gap-2 flex-wrap bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 shadow-sm">
        {["pendiente", "aprobado", "rechazado", "todos"].map(e => (
          <button key={e} onClick={() => setFiltro(e)} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtro === e ? "bg-emerald-500 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
            {e}{e === "pendiente" && pendientes > 0 ? ` (${pendientes})` : ""}
          </button>
        ))}
      </div>

      {/* LISTA */}
      {loading ? (
        <div className="flex items-center justify-center h-56"><Loader2 className="animate-spin text-emerald-500" size={36} /></div>
      ) : pagos.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
          <CreditCard size={42} className="text-slate-200 mx-auto mb-3" />
          <p className="font-black text-slate-300 uppercase italic text-sm">Sin comprobantes {filtro !== "todos" ? `en estado "${filtro}"` : ""}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {pagos.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-800">{p.cliente_nombre}</p>
                  <p className="text-[10px] text-slate-400 truncate">{p.cliente_email}</p>
                </div>
                <span className={`flex-shrink-0 text-[9px] font-black uppercase px-2.5 py-1 rounded-full border ${ESTADO_BADGE[p.estado] || ESTADO_BADGE.pendiente}`}>{p.estado}</span>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <MapPin size={11} className="text-[#E31E24] flex-shrink-0" />
                <span className="truncate">{p.origen || "—"}</span>
                <ArrowRight size={10} className="text-slate-300 flex-shrink-0" />
                <span className="truncate">{p.destino || "—"}</span>
                <span className="text-slate-300 ml-1">#{p.reserva_id}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 rounded-lg p-2"><p className="text-[8px] font-black uppercase text-slate-400">Monto</p><p className="text-xs font-black text-slate-800">${Number(p.monto).toFixed(2)}</p></div>
                <div className="bg-slate-50 rounded-lg p-2"><p className="text-[8px] font-black uppercase text-slate-400">Método</p><p className="text-[10px] font-bold text-slate-600">{METODO_LABEL[p.metodo] || p.metodo}</p></div>
                <div className="bg-slate-50 rounded-lg p-2"><p className="text-[8px] font-black uppercase text-slate-400">Reserva paga</p><p className="text-[10px] font-bold text-slate-600">${Number(p.reserva_monto_pagado).toFixed(0)}/${Number(p.reserva_total).toFixed(0)}</p></div>
              </div>

              {p.comprobante_url ? (
                <button onClick={() => setZoomImg(p.comprobante_url)} className="block w-full">
                  <img src={p.comprobante_url} alt="comprobante" className="w-full h-32 object-cover rounded-xl border border-slate-200 hover:opacity-80 transition-all" />
                </button>
              ) : (
                <div className="w-full h-32 flex items-center justify-center bg-slate-50 rounded-xl border border-slate-200"><ImageIcon size={24} className="text-slate-300" /></div>
              )}

              {p.estado === "rechazado" && p.notas_admin && (
                <p className="text-[10px] text-red-500 bg-red-50 rounded-lg p-2">Motivo: {p.notas_admin}</p>
              )}

              {p.estado === "pendiente" && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => aprobar(p.id)} disabled={actingId === p.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-60">
                    {actingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Aprobar
                  </button>
                  <button onClick={() => { setRechazarId(p.id); setNotaRechazo(""); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest transition-all">
                    <XCircle size={13} /> Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL RECHAZAR */}
      {rechazarId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0f1a]/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="bg-red-500 p-5 text-white flex items-center justify-between">
              <h2 className="text-base font-black italic tracking-tighter uppercase">Rechazar pago</h2>
              <button onClick={() => setRechazarId(null)} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Motivo (se lo enviamos al cliente)</label>
                <textarea value={notaRechazo} onChange={e => setNotaRechazo(e.target.value)} rows={3} className={INPUT + " resize-none"} placeholder="Ej: El comprobante no coincide con el monto reportado" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setRechazarId(null)} className="flex-1 py-3 rounded-2xl border-2 border-slate-100 text-slate-500 font-black text-xs uppercase tracking-widest">Cancelar</button>
                <button onClick={rechazar} disabled={actingId === rechazarId} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-black text-xs uppercase tracking-widest hover:bg-red-600 transition-all disabled:opacity-60">
                  {actingId === rechazarId ? "Rechazando..." : "Confirmar rechazo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ZOOM DE IMAGEN */}
      {zoomImg && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4" onClick={() => setZoomImg(null)}>
          <button onClick={() => setZoomImg(null)} className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full"><X size={28} /></button>
          <img src={zoomImg} alt="comprobante" className="max-w-full max-h-full rounded-2xl" />
        </div>
      )}
    </div>
  );
}
