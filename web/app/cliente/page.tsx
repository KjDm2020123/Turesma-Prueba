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
  const [catalogoViajes, setCatalogoViajes] = useState<any[]>([]);
  const [viajesMessage, setViajesMessage] = useState("");
  const [viajeCompra, setViajeCompra] = useState<any | null>(null);
  const [compraForm, setCompraForm] = useState({ pasajeros: "1", fecha: "", hora: "", ubicacion: "" });
  const [comprando, setComprando] = useState(false);

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
        const catalogoRes = await fetch(`${API}/api/usuarios/viajes`, { headers: getAuthHeaders() });
        if (catalogoRes.ok) {
          const catalogo = await catalogoRes.json();
          setCatalogoViajes(catalogo.data || []);
        }
      } catch { /* silencio */ }
    })();
  }, [checkingSession, user?.id]);

  const reservarViaje = async () => {
    if (!viajeCompra) return;
    const cantidad = Number(compraForm.pasajeros);
    if (!Number.isInteger(cantidad) || cantidad <= 0 || !compraForm.fecha || !compraForm.hora || !compraForm.ubicacion.trim()) return;
    setComprando(true);
    const response = await fetch(`${API}/api/usuarios/viajes/${viajeCompra.id}/reservar`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ num_personas: cantidad, fecha_viaje: compraForm.fecha, hora_viaje: compraForm.hora, ubicacion_recogida: compraForm.ubicacion }),
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : { error: (await response.text()).slice(0, 240) };
    setViajesMessage(response.ok ? `${data.message} Total: $${Number(data.data?.total || 0).toFixed(2)}.` : (data.error || "No se pudo reservar el viaje"));
    setComprando(false);
    if (response.ok) { setViajeCompra(null); setTimeout(() => window.location.assign("/cliente/historial"), 1200); }
  };

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

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#E31E24]">Compra directa</p><h2 className="mt-1 text-2xl font-black text-slate-900">Viajes disponibles</h2><p className="mt-1 text-sm text-slate-500">Selecciona un viaje con precio y cupos definidos.</p></div>
          <Link href="/cliente/historial" className="text-xs font-black text-slate-400 hover:text-[#E31E24]">Mis pagos</Link>
        </div>
        {viajesMessage && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{viajesMessage}</p>}
        <div className="grid gap-4 md:grid-cols-2">{catalogoViajes.map((viaje) => <article key={viaje.id} className="overflow-hidden rounded-2xl border border-slate-200"><div className="grid grid-cols-2 gap-1">{viaje.vehiculo_imagen_url && <img src={viaje.vehiculo_imagen_url} alt={`Vehículo ${viaje.vehiculo_placa || ""}`} className="h-36 w-full object-cover" />}{Array.isArray(viaje.imagenes) && viaje.imagenes.slice(0, 3).map((image: string) => <img key={image} src={image} alt={`Destino ${viaje.destino}`} className="h-36 w-full object-cover" />)}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-black text-slate-900">{viaje.titulo}</h3><span className="text-lg font-black text-[#E31E24]">${Number(viaje.precio).toFixed(2)}</span></div><p className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-600"><MapPin size={15} className="text-[#E31E24]" />{viaje.origen} <ArrowRight size={13} /> {viaje.destino}</p><p className="mt-2 text-xs font-semibold text-slate-500">{viaje.vehiculo_placa ? `Vehículo ${viaje.vehiculo_placa} · ${viaje.vehiculo_modelo || ""}` : "Vehículo por confirmar"}</p><div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500"><span className="rounded-lg bg-slate-50 px-2 py-1">{viaje.fecha_servicio}</span><span className="rounded-lg bg-slate-50 px-2 py-1">{viaje.hora_salida || "Hora por definir"}</span><span className="rounded-lg bg-slate-50 px-2 py-1">{viaje.cupos_disponibles} cupos</span></div><button onClick={() => { setViajeCompra(viaje); setCompraForm({ pasajeros: "1", fecha: viaje.fecha_servicio?.slice(0, 10) || "", hora: viaje.hora_salida || "", ubicacion: viaje.origen || "" }); }} disabled={!viaje.cupos_disponibles} className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-40">{viaje.cupos_disponibles ? "Reservar este viaje" : "Sin cupos"}</button></div></article>)}</div>
        {!catalogoViajes.length && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">No hay viajes publicados en este momento.</p>}
      </section>

      {viajeCompra && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={(event) => { event.preventDefault(); void reservarViaje(); }} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-[#E31E24]">Confirmar compra</p><h2 className="mt-1 text-xl font-black text-slate-900">{viajeCompra.titulo}</h2></div><button type="button" onClick={() => setViajeCompra(null)} className="text-2xl text-slate-400">×</button></div><p className="text-sm font-semibold text-slate-600">{viajeCompra.origen} → {viajeCompra.destino} · ${Number(viajeCompra.precio).toFixed(2)} por pasajero</p><label className="block text-xs font-black uppercase tracking-wider text-slate-500">Pasajeros<input type="number" min="1" max={viajeCompra.cupos_disponibles} value={compraForm.pasajeros} onChange={(e) => setCompraForm({ ...compraForm, pasajeros: e.target.value })} className="mt-1 w-full rounded-xl border p-3 text-sm" required /></label><label className="block text-xs font-black uppercase tracking-wider text-slate-500">Fecha del viaje<input type="date" value={compraForm.fecha} onChange={(e) => setCompraForm({ ...compraForm, fecha: e.target.value })} className="mt-1 w-full rounded-xl border p-3 text-sm" required /></label><label className="block text-xs font-black uppercase tracking-wider text-slate-500">Hora de salida<input type="time" value={compraForm.hora} onChange={(e) => setCompraForm({ ...compraForm, hora: e.target.value })} className="mt-1 w-full rounded-xl border p-3 text-sm" required /></label><label className="block text-xs font-black uppercase tracking-wider text-slate-500">Ubicación de recogida<input value={compraForm.ubicacion} onChange={(e) => setCompraForm({ ...compraForm, ubicacion: e.target.value })} className="mt-1 w-full rounded-xl border p-3 text-sm normal-case" placeholder="Dirección o punto de encuentro" required /></label><button disabled={comprando} className="w-full rounded-xl bg-[#E31E24] py-3 font-black text-white disabled:opacity-50">{comprando ? "Registrando..." : "Confirmar reserva"}</button></form></div>}

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
