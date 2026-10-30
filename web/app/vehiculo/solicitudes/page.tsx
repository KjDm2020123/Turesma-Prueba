"use client";

import { useConductorPanel } from "../_components/use-conductor-panel";
import Link from "next/link";
import {
  Bell, Loader2, MapPin, Users, DollarSign,
  CheckCircle, CalendarDays, ShieldCheck, ShieldAlert,
} from "lucide-react";

const ESTADO_COLOR: Record<string, string> = {
  pendiente:   "bg-amber-100 text-amber-700 border-amber-200",
  confirmada:  "bg-blue-100 text-blue-700 border-blue-200",
  en_curso:    "bg-purple-100 text-purple-700 border-purple-200",
  finalizada:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelada:   "bg-red-100 text-red-700 border-red-200",
};

const ESTADO_LABEL: Record<string, string> = {
  pendiente:  "Pendiente",
  confirmada: "Confirmada",
  en_curso:   "En curso",
  finalizada: "Finalizada",
  cancelada:  "Cancelada",
};

export default function SolicitudesPage() {
  const {
    panel, loadingPanel, msg, err,
    formatFecha, checkingSession,
  } = useConductorPanel();

  if (checkingSession) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-[#E31E24]" size={32} />
      </div>
    );
  }

  const solicitudes = panel.pendientes;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* CONTADOR */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4">
        <div className="bg-amber-100 p-3 rounded-xl">
          <Bell size={22} className="text-amber-600" />
        </div>
        <div>
          <p className="text-3xl font-black text-amber-700">{solicitudes.length}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">
            {solicitudes.length === 1 ? "solicitud pendiente" : "solicitudes pendientes"}
          </p>
        </div>
      </div>

      {msg && (
        <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 text-sm font-bold rounded-r-xl">
          {msg}
        </div>
      )}
      {err && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-bold rounded-r-xl">
          {err}
        </div>
      )}

      {/* LISTA DE SOLICITUDES */}
      {loadingPanel ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="animate-spin text-[#E31E24]" size={32} />
        </div>
      ) : solicitudes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 gap-3 bg-white rounded-2xl border border-slate-200">
          <CheckCircle size={44} className="text-emerald-200" />
          <p className="text-sm font-black uppercase text-slate-300 italic">Sin solicitudes pendientes</p>
          <p className="text-xs text-slate-400">Cuando llegue una reserva aparecerá aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          {solicitudes.map((r) => {
            return (
              <div
                key={r.id}
                className={`bg-white rounded-2xl border-2 shadow-sm p-5 transition-all ${r.isNew ? "border-amber-300 shadow-amber-100" : "border-slate-100"}`}
              >
                {r.isNew && (
                  <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full mb-3">
                    <Bell size={9} />
                    Nueva solicitud
                  </div>
                )}

                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="font-black text-slate-800 text-base flex items-center gap-1.5">
                      {r.usuario_nombre ?? "Cliente"}
                      {r.usuario_verificacion === "verificado" ? (
                        <span title="Cliente verificado" className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full"><ShieldCheck size={10} /> Verificado</span>
                      ) : (
                        <span title="Cliente sin verificar" className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"><ShieldAlert size={10} /> Sin verificar</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{r.usuario_email}</p>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${ESTADO_COLOR[r.estado] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                    {ESTADO_LABEL[r.estado] ?? r.estado}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MapPin size={12} className="text-slate-400" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Origen</span>
                    </div>
                    <p className="text-xs font-bold text-slate-700">{r.origen ?? "Por definir"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MapPin size={12} className="text-[#E31E24]" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Destino</span>
                    </div>
                    <p className="text-xs font-bold text-slate-700">{r.destino ?? "Por definir"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={12} />
                    {formatFecha(r.fecha_reserva)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users size={12} />
                    {r.num_personas} personas
                  </span>
                  <span className="flex items-center gap-1.5">
                    <DollarSign size={12} />
                    ${Number(r.total).toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Link
                    href="/vehiculo/activas"
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#E31E24] hover:bg-[#c0181e] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm shadow-red-500/20"
                  >
                    <CheckCircle size={14} />
                    Acceder
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
