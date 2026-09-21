"use client";

import React, { FormEvent, useEffect, useState } from "react";
import {
  MapPin, Calendar, Users, Car, FileText, Clock, CheckCircle2,
  XCircle, Loader2, RefreshCw, Send, ArrowRight,
  DollarSign, ChevronDown, ChevronUp, Zap, Minus, Plus, Bus,
  Navigation, AlertCircle,
  Sparkles,
} from "lucide-react";
import { getAuthHeaders, handleUnauthorized } from "../../../lib/session";
import { useClienteGuard } from "../../../lib/use-cliente-guard";
import { useAutoRefresh } from "../../../lib/use-auto-refresh";
import { MapPicker, Punto } from "../../../components/map-picker";
import { VehiculoCalendario } from "../../../components/vehiculo-calendario";
import { calcularRuta, reverseGeocode, RutaCalculada } from "../../../lib/leaflet";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Vehiculo = { id: number; placa: string; tipo: string; modelo?: string | null; capacidad?: number; imagen_url?: string | null };
type Cotizacion = {
  id: number; origen: string; destino: string; fecha_servicio: string; fecha_fin?: string | null;
  num_personas: number; tipo_vehiculo?: string | null; notas?: string | null;
  estado: string; precio_final?: number | null; valor_ofrecido?: number | null;
  precio_propuesto?: number | null; turno?: string | null;
  duracion_valor?: number | null; duracion_unidad?: string | null; hora_salida?: string | null;
  respuesta_admin?: string | null; reserva_id?: number | null; creado_en: string;
  vehiculo_placa?: string | null; vehiculo_modelo?: string | null;
  num_viajes?: number | null; distancia_km?: number | null; precio_desglose?: any;
};
type Tarifas = {
  tarifa_diaria: number; precio_km: number; tarifa_viaje: number; recargo_peajes: number; minimo_km: number;
  tarifa_van?: number; tarifa_bus?: number; tarifa_suv?: number; tarifa_minibus?: number; tarifa_sedan?: number;
  traslado_van?: number; traslado_bus?: number; traslado_suv?: number; traslado_minibus?: number; traslado_sedan?: number;
  hora_van?: number; hora_bus?: number; hora_suv?: number; hora_minibus?: number; hora_sedan?: number;
  medio_dia_van?: number; medio_dia_bus?: number; medio_dia_suv?: number; medio_dia_minibus?: number; medio_dia_sedan?: number;
  oferta_activa?: boolean; oferta_dia?: string; descuento_oferta_pct?: number; oferta_descripcion?: string;
};
type VehicleRecommendation = {
  id: number; placa: string; tipo: string; modelo?: string | null; capacidad: number;
  imagen_url?: string | null; descripcion?: string | null;
};

const ESTADO_INFO: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pendiente: { label: "En revisión", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: <Clock size={14} className="text-amber-600" /> },
  negociacion: { label: "Tienes una propuesta", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: <DollarSign size={14} className="text-purple-600" /> },
  aprobada: { label: "Aprobada ✓", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: <CheckCircle2 size={14} className="text-emerald-600" /> },
  rechazada: { label: "No disponible", color: "text-red-600", bg: "bg-red-50 border-red-200", icon: <XCircle size={14} className="text-red-500" /> },
};

const INPUT = "w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-[#E31E24] focus:bg-white placeholder:text-slate-300 placeholder:font-normal";

// Tope de días seguidos que puede reservar el cliente en un solo servicio.
const MAX_DIAS = 30;

// Cantidad de días que abarca un rango (ambos extremos incluidos).
const diasEntre = (a: string, b: string) => {
  if (!a || !b) return 1;
  const d1 = new Date(a + "T00:00"), d2 = new Date(b + "T00:00");
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
};

export default function ClienteCotizarPage() {
  const { user, checkingSession } = useClienteGuard();
  const userId = user?.id;
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loadingCot, setLoadingCot] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [sending, setSending] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [formErr, setFormErr] = useState("");
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantMsg, setAssistantMsg] = useState("");
  const [assistantErr, setAssistantErr] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<VehicleRecommendation | null>(null);
  const [alternatives, setAlternatives] = useState<VehicleRecommendation[]>([]);
  const [route, setRoute] = useState<RutaCalculada | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [tarifas, setTarifas] = useState<Tarifas | null>(null);

  // Negociación
  const [counterId, setCounterId] = useState<number | null>(null);
  const [counterVal, setCounterVal] = useState("");
  const [respMsg, setRespMsg] = useState("");

  const responder = async (cot: Cotizacion, accion: "aceptar" | "contraoferta" | "rechazar") => {
    setRespMsg("");
    const body: Record<string, unknown> = { accion };
    if (accion === "contraoferta") {
      if (!counterVal) { setRespMsg("Ingresa el valor que propones"); return; }
      body.valor = Number(counterVal);
    }
    try {
      const res = await fetch(`${API}/api/cotizaciones/${cot.id}/responder`, {
        method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify(body),
      });
      if (handleUnauthorized(res.status)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRespMsg(data.message || "Listo");
      setCounterId(null); setCounterVal("");
      loadCotizaciones();
    } catch (e: any) { setRespMsg(e.message); }
  };

  const [form, setForm] = useState({
    fecha_servicio: "", fecha_fin: "", num_personas: "1",
    num_viajes: "1", vehiculo_id: "", valor_ofrecido: "", hora_salida: "", notas: "", modalidad_servicio: "dia", duracion_horas: "2",
  });
  // false = servicio de un solo día · true = reserva de varios días (rango)
  const [variosDias, setVariosDias] = useState(false);
  const [origin, setOrigin] = useState<Punto | null>(null);
  const [destination, setDestination] = useState<Punto | null>(null);
  const [locatingOrigin, setLocatingOrigin] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [focusSignal, setFocusSignal] = useState(0);

  const onMapChange = (which: "origin" | "destination", val: Punto) => {
    if (which === "origin") setOrigin(val); else setDestination(val);
  };
  const step = (field: "num_personas", delta: number, min: number) =>
    setForm(p => ({ ...p, [field]: String(Math.max(min, (Number(p[field]) || min) + delta)) }));

  // Detecta la ubicación actual del cliente y la usa como punto de salida por
  // defecto, así solo tiene que marcar el destino en el mapa.
  const locateMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("Tu dispositivo no soporta ubicación automática. Marca la salida manualmente en el mapa.");
      return;
    }
    setLocatingOrigin(true); setLocationError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const label = await reverseGeocode(latitude, longitude);
        setOrigin({ lat: latitude, lng: longitude, label });
        setFocusSignal((s) => s + 1);
        setLocatingOrigin(false);
      },
      () => {
        setLocationError("No se pudo detectar tu ubicación. Marca la salida manualmente en el mapa.");
        setLocatingOrigin(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  // Al abrir la página, intenta ubicar al cliente automáticamente.
  useEffect(() => { locateMyLocation(); /* eslint-disable-next-line */ }, []);

  const loadVehiculos = async () => {
    try {
      const res = await fetch(`${API}/api/usuarios/vehiculos`);
      if (res.ok) {
        const data = await res.json();
        setVehiculos(Array.isArray(data) ? data : []);
      }
    } catch { /* silencio */ }
  };

  const loadCotizaciones = async (silencioso = false) => {
    if (!userId) return;
    if (!silencioso) setLoadingCot(true);
    try {
      const res = await fetch(`${API}/api/cotizaciones/mias`, { headers: getAuthHeaders() });
      if (handleUnauthorized(res.status)) return;
      if (res.ok) setCotizaciones(await res.json());
    } catch { /* silencio */ }
    finally { setLoadingCot(false); }
  };

  const loadTarifas = async () => {
    try {
      const res = await fetch(`${API}/api/usuarios/tarifas`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) setTarifas(await res.json());
    } catch { /* silencio */ }
  };

  const askVehicleAssistant = async () => {
    setAssistantLoading(true); setAssistantErr(""); setAssistantMsg("");
    try {
      const res = await fetch(`${API}/api/usuarios/vehiculos/recomendacion`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          num_personas: Number(form.num_personas) || 1,
          fecha_servicio: form.fecha_servicio || null,
          fecha_fin: variosDias ? form.fecha_fin || form.fecha_servicio || null : form.fecha_servicio || null,
          notas: `${assistantPrompt} ${form.notas}`.trim(),
        }),
      });
      if (handleUnauthorized(res.status)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo consultar al asistente");
      setRecommendation(data.recommendation || null);
      setAlternatives(Array.isArray(data.alternatives) ? data.alternatives : []);
      setAssistantMsg(data.message || "Revisa estas opciones para tu viaje.");
      if (data.recommendation) setForm(p => ({ ...p, vehiculo_id: String(data.recommendation.id) }));
    } catch (e: any) {
      setAssistantErr(e.message || "No se pudo consultar al asistente");
    } finally { setAssistantLoading(false); }
  };

  useEffect(() => {
    if (checkingSession || !userId) return;
    loadVehiculos(); loadCotizaciones(); loadTarifas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingSession, userId]);

  useEffect(() => {
    if (!origin || !destination) { setRoute(null); return; }
    let cancelled = false;
    setRouteLoading(true);
    calcularRuta(origin, destination).then(result => { if (!cancelled) setRoute(result); }).finally(() => { if (!cancelled) setRouteLoading(false); });
    return () => { cancelled = true; };
  }, [origin, destination]);

  useAutoRefresh(() => {
    loadVehiculos();
    loadCotizaciones(true);
    loadTarifas();
  }, { enabled: !checkingSession && !!userId, intervalMs: 5000, immediate: false });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!origin || !destination) { setFormErr("Marca el punto de salida y el destino en el mapa."); return; }
    if (!form.fecha_servicio) { setFormErr("Selecciona una fecha disponible en el calendario."); return; }
    if (variosDias && !form.fecha_fin) { setFormErr("Elegiste varios días: toca también el último día del viaje en el calendario."); return; }
    if (variosDias && form.fecha_fin && diasEntre(form.fecha_servicio, form.fecha_fin) > MAX_DIAS) { setFormErr(`El servicio no puede superar los ${MAX_DIAS} días seguidos.`); return; }
    setSending(true); setFormErr(""); setFormMsg("");
    try {
      const res = await fetch(`${API}/api/cotizaciones/reserva-directa`, {
        method: "POST", headers: getAuthHeaders(),
        body: JSON.stringify({
          ...form,
          fecha_fin: variosDias ? form.fecha_fin || null : null,
          origen: origin.label,
          destino: destination.label,
          origen_lat: origin.lat, origen_lng: origin.lng,
          destino_lat: destination.lat, destino_lng: destination.lng,
          num_personas: Number(form.num_personas) || 1,
          num_viajes: Number(form.num_viajes) || 1,
          modalidad_servicio: variosDias ? "varios_dias" : form.modalidad_servicio,
          duracion_horas: form.modalidad_servicio === "horas" ? Number(form.duracion_horas) || 1 : null,
          vehiculo_id: form.vehiculo_id || null,
          valor_ofrecido: form.valor_ofrecido ? Number(form.valor_ofrecido) : null,
          hora_salida: form.hora_salida || null,
        }),
      });
      if (handleUnauthorized(res.status)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al enviar");
      if (data.approval_url) {
        window.location.assign(data.approval_url);
        return;
      }
      setFormMsg("Reserva creada. PayPal no está disponible todavía; puedes pagar por transferencia desde Historial.");
      setForm({ fecha_servicio: "", fecha_fin: "", num_personas: "1", num_viajes: "1", vehiculo_id: "", valor_ofrecido: "", hora_salida: "", notas: "", modalidad_servicio: "dia", duracion_horas: "2" });
      setVariosDias(false);
      setOrigin(null); setDestination(null);
      locateMyLocation();
      loadCotizaciones();
    } catch (e: any) { setFormErr(e.message); }
    finally { setSending(false); }
  };

  const selectedVehicle = vehiculos.find((v) => String(v.id) === form.vehiculo_id) ?? null;
  const tipoSeleccionado = (selectedVehicle?.tipo || "van").toString().trim().toLowerCase();
  const selectedDays = form.fecha_servicio && variosDias && form.fecha_fin ? diasEntre(form.fecha_servicio, form.fecha_fin) : 1;
  const selectedTrips = Math.max(1, Number(form.num_viajes) || 1);
  const modalidad = variosDias ? "varios_dias" : form.modalidad_servicio;
  const horasServicio = Math.max(1, Number(form.duracion_horas) || 1);
  const billedKm = Math.max(Number(tarifas?.minimo_km) || 0, route?.distanciaKm || 0);
  const tipoRate = tipoSeleccionado;
  const tarifaPorTipo =
    tipoRate === "bus" ? Number(tarifas?.tarifa_bus ?? tarifas?.tarifa_diaria ?? 0)
    : tipoRate === "suv" ? Number(tarifas?.tarifa_suv ?? tarifas?.tarifa_diaria ?? 0)
    : tipoRate === "minibus" ? Number(tarifas?.tarifa_minibus ?? tarifas?.tarifa_diaria ?? 0)
    : tipoRate === "sedan" ? Number(tarifas?.tarifa_sedan ?? tarifas?.tarifa_diaria ?? 0)
    : Number(tarifas?.tarifa_van ?? tarifas?.tarifa_diaria ?? 0);
  const tarifaServicio = modalidad === "traslado"
    ? Number(tarifas?.[`traslado_${tipoRate}` as keyof Tarifas] ?? tarifaPorTipo)
    : modalidad === "horas"
      ? Number(tarifas?.[`hora_${tipoRate}` as keyof Tarifas] ?? tarifaPorTipo) * horasServicio
      : modalidad === "medio_dia"
        ? Number(tarifas?.[`medio_dia_${tipoRate}` as keyof Tarifas] ?? tarifaPorTipo)
        : tarifaPorTipo * selectedDays;
  const descuentoOferta = Number(tarifas?.descuento_oferta_pct || 0);
  const subtotalDiario = tarifaServicio;
  const subtotalKm = billedKm * Number(tarifas?.precio_km || 0);
  const subtotalViajes = modalidad === "traslado" ? 0 : Number(tarifas?.tarifa_viaje || 0) * selectedTrips;
  const subtotalPeajes = Number(tarifas?.recargo_peajes || 0);
  const discountAmount = tarifas?.oferta_activa ? (subtotalDiario * descuentoOferta) / 100 : 0;
  const estimatedTotal = tarifas
    ? subtotalDiario + subtotalKm + subtotalViajes + subtotalPeajes - discountAmount
    : null;

  if (checkingSession) return (
    <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#E31E24]" size={34} /></div>
  );

  return (
    <div className="space-y-6">

      {/* TOGGLE FORM */}
      <button onClick={() => { setShowForm(f => !f); setFormErr(""); setFormMsg(""); }}
        className={`w-full flex items-center justify-between p-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg ${showForm ? "bg-slate-800 text-white" : "bg-[#E31E24] text-white hover:bg-red-700"}`}>
        <span className="flex items-center gap-3"><div className="bg-white/20 p-2 rounded-xl"><FileText size={18} /></div>{showForm ? "Ocultar formulario" : "Nueva cotización"}</span>
        {showForm ? <ChevronUp size={18} /> : <ArrowRight size={18} />}
      </button>

      {/* FORM */}
      {showForm && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6">

            <div className="rounded-3xl border border-blue-200 bg-[linear-gradient(135deg,#eff6ff,#ffffff)] p-4 sm:p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-blue-600 p-2.5 text-white shadow-lg shadow-blue-200"><Sparkles size={18} /></div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Asistente inteligente</p>
                  <h2 className="text-base font-black text-slate-900">Cuéntame qué necesitas y te sugiero el vehículo ideal</h2>
                  <p className="mt-1 text-xs text-slate-500">Usaré pasajeros, fechas, disponibilidad y tus preferencias para recomendarte una opción real.</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={assistantPrompt} onChange={e => setAssistantPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); askVehicleAssistant(); } }}
                  className="flex-1 rounded-2xl border-2 border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500"
                  placeholder="Ej: viajamos con maletas y queremos comodidad" />
                <button type="button" onClick={askVehicleAssistant} disabled={assistantLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700 disabled:opacity-60">
                  {assistantLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {assistantLoading ? "Analizando" : "Recomendar"}
                </button>
              </div>
              {assistantMsg && <p className="rounded-2xl bg-white/80 p-3 text-sm font-bold text-blue-800">{assistantMsg}</p>}
              {assistantErr && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-600">{assistantErr}</p>}
              {(recommendation || alternatives.length > 0) && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {[recommendation, ...alternatives].filter(Boolean).map((vehicle, index) => {
                    const item = vehicle as VehicleRecommendation;
                    const selected = form.vehiculo_id === String(item.id);
                    return <button key={item.id} type="button" onClick={() => setForm(p => ({ ...p, vehiculo_id: String(item.id) }))}
                      className={`rounded-2xl border-2 bg-white p-3 text-left transition ${selected ? "border-blue-600 ring-2 ring-blue-100" : "border-white hover:border-blue-200"}`}>
                      <p className="text-[9px] font-black uppercase tracking-widest text-blue-600">{index === 0 ? "Mejor coincidencia" : "Alternativa"}</p>
                      <p className="mt-1 truncate text-sm font-black text-slate-800">{item.modelo || item.tipo}</p>
                      <p className="text-[11px] font-semibold text-slate-500">{item.capacidad} pasajeros · {item.placa}</p>
                    </button>;
                  })}
                </div>
              )}
            </div>

            {/* PASO 1: VEHÍCULO (tarjetas con imagen) */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><Car size={12} /> 1. Elige el vehículo</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {vehiculos.map(v => {
                    const sel = form.vehiculo_id === String(v.id);
                    return (
                      <button key={v.id} type="button" onClick={() => setForm(p => ({ ...p, vehiculo_id: sel ? "" : String(v.id), tipo_vehiculo: sel ? "" : String(v.tipo || "van").toLowerCase() }))}
                        className={`text-left rounded-2xl border-2 overflow-hidden transition-all ${sel ? "border-[#E31E24] ring-2 ring-red-100" : "border-slate-100 hover:border-slate-300"}`}>
                        <div className="h-20 bg-slate-100 relative">
                          {v.imagen_url ? <img src={v.imagen_url} alt={v.placa} className="w-full h-full object-cover" /> :
                            <div className="w-full h-full flex items-center justify-center"><Bus size={26} className="text-slate-300" /></div>}
                          {sel && <div className="absolute top-1.5 right-1.5 bg-[#E31E24] text-white rounded-full p-1"><CheckCircle2 size={12} /></div>}
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-black text-slate-800 uppercase italic tracking-tighter truncate">{v.placa}</p>
                          <p className="text-[10px] text-slate-400 truncate">{v.modelo || v.tipo} · {v.capacidad || "?"} pax</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo detectado</label>
                  <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
                    <span>{selectedVehicle ? selectedVehicle.tipo || "Vehículo" : "Sin vehículo seleccionado"}</span>
                    {selectedVehicle && <span className="rounded-full bg-[#E31E24]/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#E31E24]">{tipoSeleccionado}</span>}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-600 sm:grid-cols-3">
                    <div className="rounded-xl bg-white p-2 border border-slate-200"><span className="font-black uppercase text-slate-400 block">Van</span><span>${Number(tarifas?.tarifa_van ?? tarifas?.tarifa_diaria ?? 0).toFixed(2)}/día</span></div>
                    <div className="rounded-xl bg-white p-2 border border-slate-200"><span className="font-black uppercase text-slate-400 block">Bus</span><span>${Number(tarifas?.tarifa_bus ?? tarifas?.tarifa_diaria ?? 0).toFixed(2)}/día</span></div>
                    <div className="rounded-xl bg-white p-2 border border-slate-200"><span className="font-black uppercase text-slate-400 block">SUV</span><span>${Number(tarifas?.tarifa_suv ?? tarifas?.tarifa_diaria ?? 0).toFixed(2)}/día</span></div>
                    <div className="rounded-xl bg-white p-2 border border-slate-200"><span className="font-black uppercase text-slate-400 block">Minibus</span><span>${Number(tarifas?.tarifa_minibus ?? tarifas?.tarifa_diaria ?? 0).toFixed(2)}/día</span></div>
                    <div className="rounded-xl bg-white p-2 border border-slate-200"><span className="font-black uppercase text-slate-400 block">Sedan</span><span>${Number(tarifas?.tarifa_sedan ?? tarifas?.tarifa_diaria ?? 0).toFixed(2)}/día</span></div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400">El tipo se toma del vehículo que selecciones; si no eliges uno, el administrador asignará el adecuado.</p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><Clock size={12} /> Modalidad del servicio</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["traslado", "Traslado puntual"], ["horas", "Por horas"], ["medio_dia", "Medio día"], ["dia", "Día completo"],
                ].map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setForm(p => ({ ...p, modalidad_servicio: value }))}
                    className={`rounded-xl border-2 px-3 py-3 text-[11px] font-black transition-all ${modalidad === value ? "border-[#E31E24] bg-red-50 text-[#E31E24]" : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-300"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {modalidad === "horas" && (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label className="text-xs font-black text-slate-600">Cantidad de horas</label>
                  <input type="number" min="1" max="24" step="1" value={form.duracion_horas} onChange={e => setForm(p => ({ ...p, duracion_horas: e.target.value }))} className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-[#E31E24]" />
                </div>
              )}
              <p className="text-[10px] text-slate-400">El precio cambia según el tipo de servicio y el vehículo seleccionado.</p>
            </div>

            {/* PASO 2: FECHA (calendario con días reservados bloqueados) */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><Calendar size={12} /> 2. Elige la fecha disponible</p>

              {/* Un día o varios días */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 rounded-2xl p-1">
                <button type="button"
                  onClick={() => { setVariosDias(false); setForm(p => ({ ...p, fecha_fin: "" })); }}
                  className={`py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${!variosDias ? "bg-white text-[#E31E24] shadow" : "text-slate-400"}`}>
                  Un día
                </button>
                <button type="button"
                  onClick={() => setVariosDias(true)}
                  className={`py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${variosDias ? "bg-white text-[#E31E24] shadow" : "text-slate-400"}`}>
                  Varios días
                </button>
              </div>

              <VehiculoCalendario
                vehiculoId={form.vehiculo_id ? Number(form.vehiculo_id) : null}
                value={form.fecha_servicio}
                onSelect={(f) => setForm(p => ({ ...p, fecha_servicio: f }))}
                range={variosDias}
                endValue={form.fecha_fin}
                onSelectEnd={(f) => setForm(p => ({ ...p, fecha_fin: f }))}
                maxDays={MAX_DIAS}
              />

              {/* Resumen del rango elegido */}
              {form.fecha_servicio && (
                <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-slate-500 bg-emerald-50 border border-emerald-200 rounded-xl py-2 px-3">
                  <Calendar size={13} className="text-emerald-600" />
                  {variosDias && form.fecha_fin
                    ? <span>Del <b className="text-slate-700">{new Date(form.fecha_servicio + "T00:00").toLocaleDateString("es-EC")}</b> al <b className="text-slate-700">{new Date(form.fecha_fin + "T00:00").toLocaleDateString("es-EC")}</b> · {diasEntre(form.fecha_servicio, form.fecha_fin)} días</span>
                    : <span><b className="text-slate-700">{new Date(form.fecha_servicio + "T00:00").toLocaleDateString("es-EC")}</b>{variosDias ? " — elige el último día" : " · 1 día"}</span>}
                </div>
              )}
            </div>

            {/* PASO 3: MAPA origen/destino */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><MapPin size={12} /> 3. Marca tu destino en el mapa</p>
                <button type="button" onClick={locateMyLocation} disabled={locatingOrigin}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 disabled:opacity-50">
                  {locatingOrigin ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />} Usar mi ubicación actual
                </button>
              </div>

              {locatingOrigin && (
                <p className="text-[11px] text-blue-500 font-bold flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Detectando tu ubicación actual…</p>
              )}
              {!locatingOrigin && origin && !locationError && (
                <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1.5"><CheckCircle2 size={12} /> Salida: <span className="truncate">{origin.label}</span></p>
              )}
              {locationError && (
                <p className="text-[11px] text-amber-600 font-bold flex items-center gap-1.5"><AlertCircle size={12} /> {locationError}</p>
              )}

              <MapPicker origin={origin} destination={destination} onChange={onMapChange} focusDestinationSignal={focusSignal} />
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs font-bold text-sky-800">
                {routeLoading ? "Calculando distancia por carretera…" : route ? `Distancia estimada: ${route.distanciaKm.toFixed(1)} km · Duración: ${Math.round(route.duracionMin)} min` : "Marca ambos puntos para calcular la distancia."}
              </div>
            </div>

            {/* PASO 4: detalles por selección */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><Users size={12} /> 4. Detalles del servicio</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Personas (stepper) */}
                <div className="bg-slate-50 rounded-2xl p-3 flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-500 flex items-center gap-1.5"><Users size={14} /> Personas</span>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => step("num_personas", -1, 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600"><Minus size={14} /></button>
                    <span className="w-6 text-center font-black text-slate-800">{form.num_personas}</span>
                    <button type="button" onClick={() => step("num_personas", 1, 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600"><Plus size={14} /></button>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-500 flex items-center gap-1.5"><RefreshCw size={14} /> Viajes</span>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setForm(p => ({ ...p, num_viajes: String(Math.max(1, Number(p.num_viajes) - 1)) }))} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600"><Minus size={14} /></button>
                    <span className="w-6 text-center font-black text-slate-800">{form.num_viajes}</span>
                    <button type="button" onClick={() => setForm(p => ({ ...p, num_viajes: String(Number(p.num_viajes) + 1) }))} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600"><Plus size={14} /></button>
                  </div>
                </div>
                {/* Hora de salida */}
                <div className="bg-slate-50 rounded-2xl p-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase text-slate-500 flex items-center gap-1.5"><Clock size={14} /> Hora de salida</span>
                  <input type="time" value={form.hora_salida} onChange={e => setForm(p => ({ ...p, hora_salida: e.target.value }))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:border-[#E31E24]" />
                </div>
                {/* Valor ofrecido */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor que ofreces ($) — opcional, podrás negociarlo</label>
                  <div className="relative"><DollarSign size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input type="number" min="0" step="0.01" value={form.valor_ofrecido} onChange={e => setForm(p => ({ ...p, valor_ofrecido: e.target.value }))} className={INPUT + " pl-9"} placeholder="Ej: 250" /></div>
                </div>
                {/* Mensaje / detalles opcional para el administrador */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><FileText size={12} /> Mensaje para el administrador (opcional)</label>
                  <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} rows={3}
                    className={INPUT + " resize-none"}
                    placeholder="Detalla lo que necesitas: equipaje especial, paradas, aire acondicionado, guía turístico, hora de regreso, etc." />
                </div>
              </div>
            </div>

            {formErr && <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-600 font-bold">{formErr}</div>}
            {formMsg && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm text-emerald-700 font-bold flex items-center gap-2"><CheckCircle2 size={16} />{formMsg}</div>}

            {estimatedTotal != null && (
              <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Estimación automática</p>
                    {tarifas?.oferta_activa && (
                      <p className="text-[10px] font-bold text-emerald-700">Oferta del día: {tarifas.oferta_descripcion || `Descuento ${tarifas.descuento_oferta_pct}%`}</p>
                    )}
                  </div>
                  <p className="text-2xl font-black text-emerald-700">${estimatedTotal.toFixed(2)}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold text-emerald-800 sm:grid-cols-5">
                  <span>Días: ${subtotalDiario.toFixed(2)}</span>
                  <span>Km: ${subtotalKm.toFixed(2)}</span>
                  <span>Viajes: ${subtotalViajes.toFixed(2)}</span>
                  <span>Peajes: ${subtotalPeajes.toFixed(2)}</span>
                  <span>Oferta: -${discountAmount.toFixed(2)}</span>
                </div>
              </div>
            )}

            <button type="submit" disabled={sending}
              className="w-full py-4 bg-[#E31E24] hover:bg-black text-white font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2 disabled:opacity-60">
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}{sending ? "Creando reserva..." : "Aceptar precio y pagar"}
            </button>
          </form>
        </div>
      )}

      {/* MIS COTIZACIONES */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black italic tracking-tighter uppercase text-slate-900">Mis Cotizaciones</h2>
        </div>

        {cotizaciones.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
            <FileText size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="font-black text-slate-300 uppercase italic text-sm">Aún no has cotizado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cotizaciones.map(cot => {
              const info = ESTADO_INFO[cot.estado] || ESTADO_INFO.pendiente;
              const isOpen = expandedId === cot.id;
              return (
                <div key={cot.id} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${cot.estado === "aprobada" ? "border-emerald-200" : cot.estado === "rechazada" ? "border-red-100" : "border-slate-200"}`}>
                  <button onClick={() => setExpandedId(isOpen ? null : cot.id)} className="w-full text-left p-4 sm:p-5 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${info.bg} ${info.color}`}>{info.icon}{info.label}</span>
                        <span className="text-[9px] text-slate-400 font-bold">#{cot.id}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        <MapPin size={13} className="text-[#E31E24] flex-shrink-0" /><span className="truncate">{cot.origen}</span>
                        <ArrowRight size={13} className="text-slate-400 flex-shrink-0" /><span className="truncate">{cot.destino}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar size={10} />
                          {new Date(cot.fecha_servicio).toLocaleDateString("es-EC")}
                          {cot.fecha_fin && <> → {new Date(cot.fecha_fin).toLocaleDateString("es-EC")}</>}
                        </span>
                        {cot.hora_salida && <span className="flex items-center gap-1"><Clock size={10} />{cot.hora_salida}</span>}
                        <span className="flex items-center gap-1"><Users size={10} />{cot.num_personas}</span>
                        {cot.vehiculo_placa && <span className="flex items-center gap-1"><Car size={10} />{cot.vehiculo_placa}</span>}
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-2">
                      {cot.precio_final && <p className="text-lg font-black text-emerald-600">${Number(cot.precio_final).toFixed(0)}</p>}
                      {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 px-4 sm:px-5 py-4 space-y-3">
                      {/* NEGOCIACIÓN: el admin propuso un precio */}
                      {cot.estado === "negociacion" && cot.precio_propuesto != null && (
                        <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-4 space-y-3">
                          <div className="flex items-center gap-3">
                            <DollarSign size={22} className="text-purple-600" />
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-purple-500">El administrador te propone</p>
                              <p className="text-2xl font-black text-purple-700">${Number(cot.precio_propuesto).toFixed(2)}</p>
                            </div>
                          </div>
                          {cot.respuesta_admin && <p className="text-sm text-purple-800 bg-white/60 rounded-xl p-2.5">{cot.respuesta_admin}</p>}

                          {counterId === cot.id ? (
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tu nueva propuesta ($)</label>
                              <div className="flex gap-2">
                                <input type="number" min="0" step="0.01" value={counterVal} onChange={e => setCounterVal(e.target.value)}
                                  className="flex-1 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[#E31E24]" placeholder="Tu contraoferta" />
                                <button onClick={() => responder(cot, "contraoferta")} className="px-4 py-2 rounded-xl bg-[#E31E24] text-white text-[10px] font-black uppercase">Enviar</button>
                                <button onClick={() => setCounterId(null)} className="px-3 py-2 rounded-xl bg-slate-200 text-slate-500 text-[10px] font-black uppercase">X</button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              <button onClick={() => responder(cot, "aceptar")} className="py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1">
                                <CheckCircle2 size={13} /> Aceptar
                              </button>
                              <button onClick={() => { setCounterId(cot.id); setCounterVal(""); setRespMsg(""); }} className="py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1">
                                <DollarSign size={13} /> Negociar
                              </button>
                              <button onClick={() => responder(cot, "rechazar")} className="py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1">
                                <XCircle size={13} /> Rechazar
                              </button>
                            </div>
                          )}
                          {respMsg && <p className="text-xs font-bold text-purple-700">{respMsg}</p>}
                        </div>
                      )}

                      {cot.valor_ofrecido && (
                        <div className="flex items-center gap-2 text-xs text-slate-500"><DollarSign size={13} className="text-slate-400" />Valor ofrecido: <b className="text-slate-700">${Number(cot.valor_ofrecido).toFixed(2)}</b></div>
                      )}
                      {cot.notas && <div className="bg-slate-50 rounded-xl p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Tus notas</p><p className="text-sm text-slate-600">{cot.notas}</p></div>}
                      {cot.precio_final && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3"><DollarSign size={20} className="text-emerald-600 flex-shrink-0" />
                          <div><p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Precio acordado</p><p className="text-xl font-black text-emerald-700">${Number(cot.precio_final).toFixed(2)}</p></div></div>
                      )}
                      {cot.respuesta_admin && <div className={`rounded-xl p-4 border ${info.bg}`}><p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${info.color}`}>Respuesta de Turesma</p><p className="text-sm text-slate-700">{cot.respuesta_admin}</p></div>}
                      {cot.reserva_id && (
                        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 flex items-center gap-3"><Zap size={18} className="text-orange-600" />
                          <div><p className="text-xs font-black text-orange-700">Reserva #{cot.reserva_id} creada — pendiente de pago</p><p className="text-[10px] text-orange-600">Paga al menos el 50% en tu Historial para confirmarla.</p></div></div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
