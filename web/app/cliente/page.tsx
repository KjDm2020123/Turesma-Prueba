"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText, History, ArrowRight, Clock, CheckCircle2,
  Loader2, User, Navigation, MapPin,
} from "lucide-react";
import { getAuthHeaders, handleUnauthorized } from "../../lib/session";
import { useClienteGuard } from "../../lib/use-cliente-guard";
import { LiveTripMap } from "../../components/live-trip-map";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function ClienteInicioPage() {
  const { user, checkingSession } = useClienteGuard();
  const [cotPendientes, setCotPendientes] = useState(0);
  const [cotAprobadas, setCotAprobadas] = useState(0);
  const [viajes, setViajes] = useState(0);
  const [viajeActivo, setViajeActivo] = useState<{ id: number; estado: string; origen?: string | null; destino?: string | null } | null>(null);

  useEffect(() => {
    if (checkingSession || !user?.id) return;
    (async () => {
      try {
        const [cRes, rRes] = await Promise.all([
          fetch(`${API}/api/cotizaciones/mias`, { headers: getAuthHeaders() }),
          fetch(`${API}/api/usuarios/mis-reservas`, { headers: getAuthHeaders() }),
        ]);
        if (handleUnauthorized(cRes.status) || handleUnauthorized(rRes.status)) return;
        if (cRes.ok) {
          const cots = await cRes.json();
          setCotPendientes(cots.filter((c: any) => c.estado === "pendiente").length);
          setCotAprobadas(cots.filter((c: any) => c.estado === "aprobada").length);
        }
        if (rRes.ok) {
          const rs = await rRes.json();
          const arr = Array.isArray(rs) ? rs : [];
          setViajes(arr.length);
          // Viaje activo: prioriza en_curso, luego confirmada (próximo viaje)
          const activo = arr.find((r: any) => r.estado === "en_curso") || arr.find((r: any) => r.estado === "confirmada");
          setViajeActivo(activo ? { id: activo.id, estado: activo.estado, origen: activo.origen, destino: activo.destino } : null);
        }
      } catch { /* silencio */ }
    })();
  }, [checkingSession, user?.id]);

  if (checkingSession) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#E31E24]" size={36} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "En revisión", val: cotPendientes, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
          { label: "Aprobadas", val: cotAprobadas, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
          { label: "Mis viajes", val: viajes, color: "text-slate-900", bg: "bg-white border-slate-200" },
        ].map(k => (
          <div key={k.label} className={`${k.bg} border rounded-2xl p-4 text-center shadow-sm`}>
            <p className={`text-2xl font-black italic ${k.color}`}>{k.val}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* VIAJE ACTIVO — SEGUIMIENTO EN VIVO */}
      {viajeActivo && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black italic tracking-tighter uppercase text-slate-900 flex items-center gap-2">
              <Navigation size={18} className="text-blue-600" />
              {viajeActivo.estado === "en_curso" ? "Tu viaje en curso" : "Tu próximo viaje"}
            </h2>
            <Link href="/cliente/historial" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#E31E24]">Ver historial</Link>
          </div>
          {(viajeActivo.origen || viajeActivo.destino) && (
            <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
              <MapPin size={13} className="text-[#E31E24]" />
              <span className="truncate">{viajeActivo.origen || "—"}</span>
              <ArrowRight size={12} className="text-slate-300" />
              <span className="truncate">{viajeActivo.destino || "—"}</span>
            </p>
          )}
          <LiveTripMap reservaId={viajeActivo.id} />
        </div>
      )}

      {/* ACCIONES RÁPIDAS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/cliente/cotizar" className="group bg-[#E31E24] text-white rounded-2xl p-5 shadow-lg shadow-red-200 hover:bg-red-700 transition-all flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="bg-white/20 p-2.5 rounded-xl"><FileText size={20} /></div><span className="font-black text-sm uppercase tracking-widest">Cotizar viaje</span></div>
          <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
        </Link>
        <Link href="/cliente/historial" className="group bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-[#E31E24] transition-all flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="bg-slate-100 p-2.5 rounded-xl"><History size={20} className="text-slate-600" /></div><span className="font-black text-sm uppercase tracking-widest text-slate-700">Mi historial</span></div>
          <ArrowRight size={18} className="text-slate-300 group-hover:text-[#E31E24] transition-colors" />
        </Link>
        <Link href="/cliente/perfil" className="group bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-[#E31E24] transition-all flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="bg-slate-100 p-2.5 rounded-xl"><User size={20} className="text-slate-600" /></div><span className="font-black text-sm uppercase tracking-widest text-slate-700">Mi perfil</span></div>
          <ArrowRight size={18} className="text-slate-300 group-hover:text-[#E31E24] transition-colors" />
        </Link>
      </div>

      {/* CÓMO FUNCIONA */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4">¿Cómo funciona?</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { n: "1", icon: <FileText size={18} className="text-[#E31E24]" />, t: "Cotiza", d: "Elige vehículo, fecha, duración y propón un valor." },
            { n: "2", icon: <Clock size={18} className="text-amber-500" />, t: "Acuerdo", d: "El administrador revisa y define el precio final." },
            { n: "3", icon: <CheckCircle2 size={18} className="text-emerald-500" />, t: "Viaja", d: "Se crea tu reserva con vehículo y conductor asignados." },
          ].map(s => (
            <div key={s.n} className="bg-slate-50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">{s.icon}<span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Paso {s.n}</span></div>
              <p className="font-black text-slate-800 uppercase italic">{s.t}</p>
              <p className="text-xs text-slate-500 mt-1">{s.d}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
