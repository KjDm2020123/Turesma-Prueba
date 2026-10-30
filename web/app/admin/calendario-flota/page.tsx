"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowRight, Bus, CalendarDays, Car, CheckCircle2,
  ChevronLeft, ChevronRight, Clock3, Loader2, RefreshCw, Wrench,
} from "lucide-react";
import { getAuthHeaders, normalizeRole } from "../../../lib/session";
import { useAdminGuard } from "../../../lib/use-admin-guard";
import { useAutoRefresh } from "../../../lib/use-auto-refresh";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const WEEKDAYS = ["D", "L", "M", "X", "J", "V", "S"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type FleetVehicle = {
  id: number;
  placa: string;
  tipo: string | null;
  modelo: string;
  estado: string;
};

type FleetEvent = {
  id: number;
  vehiculo_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  tipo: "operacion" | "reserva" | "mantenimiento";
  estado: string;
  tipo_servicio?: string | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  origen?: string | null;
  destino?: string | null;
  descripcion?: string | null;
};

type UnassignedReservation = {
  id: number;
  fecha_salida: string | null;
  fecha_servicio: string | null;
  fecha_reserva: string;
  fecha_llegada: string | null;
  fecha_fin: string | null;
  origen: string | null;
  destino: string | null;
  tipo_vehiculo: string | null;
  num_personas: number;
  cliente_nombre: string;
  operacion_id: number | null;
  subcontratacion_estado: string | null;
};

type FleetCalendarData = {
  vehicles: FleetVehicle[];
  events: FleetEvent[];
  unassignedReservations: UnassignedReservation[];
};

type CalendarEventLayout = FleetEvent & {
  gridStart: number;
  gridEnd: number;
  lane: number;
  visibleStart: string;
  visibleEnd: string;
};

const asIsoDate = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

const fromIsoDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatDate = (value: string) => fromIsoDate(value).toLocaleDateString("es-EC", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const eventName = (event: FleetEvent) => {
  if (event.tipo === "mantenimiento") return "Mantenimiento";
  if (event.tipo === "reserva") return "Reserva";
  return event.tipo_servicio || "Viaje";
};

const eventStyle = (event: FleetEvent) => {
  if (event.tipo === "mantenimiento") return "border-amber-200 bg-amber-50 text-amber-800";
  if (event.estado === "en_curso") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (event.estado === "incidencia") return "border-red-200 bg-red-50 text-red-700";
  if (event.estado === "completada") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-blue-200 bg-blue-50 text-blue-800";
};

const eventSummary = (event: FleetEvent) => {
  const time = event.hora_inicio ? ` · ${event.hora_inicio.slice(0, 5)}${event.hora_fin ? `–${event.hora_fin.slice(0, 5)}` : ""}` : "";
  const route = [event.origen, event.destino].filter(Boolean).join(" → ");
  return `${eventName(event)}${time}${route ? ` · ${route}` : ""}`;
};

const eventStatusLabel = (event: FleetEvent) => {
  if (event.tipo === "mantenimiento") {
    return event.estado === "en_progreso" ? "Mantenimiento en curso" : "Mantenimiento programado";
  }
  if (event.tipo === "reserva") return "Reserva confirmada · vehículo asignado";
  const labels: Record<string, string> = {
    programada: "Viaje programado",
    asignada: "Viaje asignado",
    en_curso: "Viaje en curso",
    completada: "Viaje finalizado",
    incidencia: "Viaje con incidencia",
  };
  return labels[event.estado] || "Viaje registrado";
};

export default function CalendarioFlotaPage() {
  const { checkingSession, user } = useAdminGuard();
  const router = useRouter();
  const isAdmin = normalizeRole(user?.rol) === "admin";
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => asIsoDate(new Date()));
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedReservation[]>([]);
  const [typeFilter, setTypeFilter] = useState("todos");
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const monthStart = asIsoDate(month);
  const monthEnd = asIsoDate(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/admin/calendario-flota?desde=${monthStart}&hasta=${monthEnd}`,
        { headers: getAuthHeaders(), cache: "no-store" }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "No se pudo cargar el calendario de flota");
      if (!data || !Array.isArray(data.vehicles) || !Array.isArray(data.events) || !Array.isArray(data.unassignedReservations)) {
        throw new Error("La respuesta del calendario de flota no es válida");
      }
      const calendar = data as FleetCalendarData;
      setVehicles(calendar.vehicles);
      setEvents(calendar.events);
      setUnassigned(calendar.unassignedReservations);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el calendario de flota");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [monthEnd, monthStart]);

  useEffect(() => {
    if (!checkingSession && user && !isAdmin) router.replace("/admin");
  }, [checkingSession, isAdmin, router, user]);

  useEffect(() => {
    if (checkingSession || !isAdmin) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [checkingSession, isAdmin, load]);

  useAutoRefresh(() => load(true), { enabled: !checkingSession && isAdmin, immediate: false });

  const days = useMemo(() => {
    const offset = fromIsoDate(monthStart).getDay();
    const count = fromIsoDate(monthEnd).getDate();
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: count }, (_, index) => asIsoDate(new Date(month.getFullYear(), month.getMonth(), index + 1))),
    ];
  }, [month, monthEnd, monthStart]);

  const dayOffset = fromIsoDate(monthStart).getDay();
  const calendarDays = days.filter((day): day is string => day !== null);
  const types = useMemo(() => [...new Set(vehicles.map((vehicle) => vehicle.tipo).filter((type): type is string => Boolean(type)))].sort(), [vehicles]);
  const filteredVehicles = useMemo(
    () => vehicles.filter((vehicle) => typeFilter === "todos" || vehicle.tipo === typeFilter),
    [typeFilter, vehicles]
  );
  const selectedEvents = useMemo(
    () => events.filter((event) => event.fecha_inicio <= selectedDate && event.fecha_fin >= selectedDate),
    [events, selectedDate]
  );
  const selectedVehicleIds = useMemo(
    () => new Set(selectedEvents.map((event) => event.vehiculo_id)),
    [selectedEvents]
  );
  const outOfServiceCount = filteredVehicles.filter((vehicle) => ["mantenimiento", "inactivo"].includes(vehicle.estado.toLowerCase())).length;
  const occupiedCount = filteredVehicles.filter((vehicle) => selectedVehicleIds.has(vehicle.id)).length;
  const unavailableIds = new Set([
    ...selectedVehicleIds,
    ...filteredVehicles
      .filter((vehicle) => ["mantenimiento", "inactivo"].includes(vehicle.estado.toLowerCase()))
      .map((vehicle) => vehicle.id),
  ]);
  const availableCount = Math.max(0, filteredVehicles.length - unavailableIds.size);
  const selectedReservations = unassigned.filter((reservation) => {
    const start = (reservation.fecha_salida || reservation.fecha_servicio || reservation.fecha_reserva).slice(0, 10);
    const end = (reservation.fecha_llegada || reservation.fecha_fin || reservation.fecha_reserva).slice(0, 10);
    return start <= selectedDate && end >= selectedDate;
  });
  const selectedEvent = selectedItemKey?.startsWith("event:")
    ? events.find((event) => `event:${event.tipo}:${event.id}` === selectedItemKey) || null
    : null;
  const selectedUnassignedReservation = selectedItemKey?.startsWith("reservation:")
    ? unassigned.find((reservation) => `reservation:${reservation.id}` === selectedItemKey) || null
    : null;

  const calendarEventsByVehicle = useMemo(() => {
    const result = new Map<number, CalendarEventLayout[]>();
    for (const vehicle of filteredVehicles) {
      const laneEnds: number[] = [];
      const vehicleEvents = events
        .filter((event) => event.vehiculo_id === vehicle.id && event.fecha_inicio <= monthEnd && event.fecha_fin >= monthStart)
        .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio) || a.fecha_fin.localeCompare(b.fecha_fin));
      const layouts = vehicleEvents.map((event) => {
        const visibleStart = event.fecha_inicio < monthStart ? monthStart : event.fecha_inicio;
        const visibleEnd = event.fecha_fin > monthEnd ? monthEnd : event.fecha_fin;
        const gridStart = dayOffset + fromIsoDate(visibleStart).getDate() - 1;
        const gridEnd = dayOffset + fromIsoDate(visibleEnd).getDate() - 1;
        let lane = laneEnds.findIndex((lastDay) => lastDay < gridStart);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = gridEnd;
        return { ...event, visibleStart, visibleEnd, gridStart, gridEnd, lane };
      });
      result.set(vehicle.id, layouts);
    }
    return result;
  }, [dayOffset, events, filteredVehicles, monthEnd, monthStart]);

  const mobileAgenda = useMemo(
    () => calendarDays.map((day) => ({
      day,
      events: events.filter((event) => event.fecha_inicio <= day && event.fecha_fin >= day),
      reservations: unassigned.filter((reservation) => {
        const start = (reservation.fecha_salida || reservation.fecha_servicio || reservation.fecha_reserva).slice(0, 10);
        const end = (reservation.fecha_llegada || reservation.fecha_fin || reservation.fecha_reserva).slice(0, 10);
        return start <= day && end >= day;
      }),
    })).filter((group) => group.events.length > 0 || group.reservations.length > 0),
    [calendarDays, events, unassigned]
  );

  const changeMonth = (amount: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1);
    setMonth(next);
    setSelectedDate(asIsoDate(next));
  };

  if (checkingSession || (user && !isAdmin)) {
    return (
      <div role="status" className="flex h-64 items-center justify-center gap-3 text-sm font-semibold text-slate-600">
        <Loader2 className="animate-spin text-[#E31E24]" size={24} />
        {checkingSession ? "Comprobando sesión..." : "Verificando permisos..."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-[#E31E24]">
            <CalendarDays size={24} />
          </span>
          <div>
            <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Calendario de flota</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
              Consulta viajes, reservas y mantenimientos para planificar la asignación o subcontratación de vehículos.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Mes anterior" className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(asIsoDate(now)); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
            Hoy
          </button>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Mes siguiente" className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50">
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          <span className="flex items-center gap-2"><AlertTriangle size={17} />{error}</span>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 font-bold hover:bg-red-100">
            <RefreshCw size={14} /> Reintentar
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: `Disponibles · ${formatDate(selectedDate)}`, value: availableCount, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Vehículos ocupados", value: occupiedCount, icon: Bus, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Fuera de servicio", value: outOfServiceCount, icon: Wrench, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Reservas sin vehículo", value: selectedReservations.length, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
        ].map((item) => (
          <article key={item.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.bg} ${item.color}`}><item.icon size={20} /></span>
            <div><p className="text-2xl font-black text-slate-900">{loading ? "—" : item.value}</p><p className="text-[11px] font-semibold text-slate-500">{item.label}</p></div>
          </article>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-lg font-black capitalize text-slate-900">{MONTHS[month.getMonth()]} {month.getFullYear()}</h2>
            <p className="text-xs text-slate-500">Selecciona un día para consultar sus servicios y vehículos disponibles.</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="fleet-type-filter" className="text-xs font-bold text-slate-500">Tipo</label>
            <select id="fleet-type-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
              <option value="todos">Toda la flota</option>
              {types.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <button type="button" onClick={() => void load()} disabled={loading} aria-label="Actualizar calendario" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr className="bg-slate-50">
                <th scope="col" className="sticky left-0 z-10 min-w-48 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-[10px] font-black uppercase tracking-wide text-slate-500">Vehículo</th>
                {days.map((day, index) => (
                  <th key={day || `blank-${index}`} scope="col" className="min-w-[30px] border-b border-slate-200 px-0.5 py-2">
                    {day && (
                      <button type="button" onClick={() => setSelectedDate(day)} aria-pressed={selectedDate === day} className={`flex w-full flex-col items-center rounded-lg py-1 text-[9px] font-bold ${selectedDate === day ? "bg-[#E31E24] text-white" : day === asIsoDate(new Date()) ? "text-[#E31E24]" : "text-slate-500"}`}>
                        <span>{WEEKDAYS[fromIsoDate(day).getDay()]}</span><span className="mt-0.5 text-xs">{Number(day.slice(8, 10))}</span>
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={days.length + 1} className="py-16 text-center text-sm font-semibold text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin text-[#E31E24]" size={24} />Cargando calendario…</td></tr>
              ) : filteredVehicles.length === 0 ? (
                <tr><td colSpan={days.length + 1} className="py-12 text-center text-sm font-medium text-slate-500">No hay vehículos activos para mostrar.</td></tr>
              ) : filteredVehicles.map((vehicle) => (
                <tr key={vehicle.id} className="hover:bg-slate-50/60">
                  <th scope="row" className="sticky left-0 z-[1] min-w-48 border-b border-r border-slate-100 bg-white px-4 py-2 text-left">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Car size={17} /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black text-slate-800">{vehicle.placa}</span>
                        <span className="block truncate text-[10px] font-medium text-slate-500">{vehicle.tipo || vehicle.modelo}</span>
                        {vehicle.estado.toLowerCase() === "mantenimiento" && <span className="text-[9px] font-bold text-amber-700">En mantenimiento</span>}
                      </span>
                    </div>
                  </th>
                  <td colSpan={days.length} className="border-b border-slate-100 p-1">
                    {(() => {
                      const vehicleEvents = calendarEventsByVehicle.get(vehicle.id) || [];
                      const laneCount = Math.max(1, ...vehicleEvents.map((event) => event.lane + 1));
                      return (
                        <div
                          className="grid gap-x-0.5 gap-y-1 py-1"
                          style={{
                            gridTemplateColumns: `repeat(${days.length}, minmax(30px, 1fr))`,
                            gridTemplateRows: `18px repeat(${laneCount}, 24px)`,
                            minWidth: `${days.length * 31}px`,
                          }}
                        >
                          {days.map((day, index) => day ? (
                            <button
                              key={day}
                              type="button"
                              onClick={() => { setSelectedDate(day); setSelectedItemKey(null); }}
                              aria-label={`Ver disponibilidad del ${formatDate(day)}`}
                              aria-pressed={selectedDate === day}
                              style={{ gridColumn: index + 1, gridRow: 1 }}
                              className={`rounded-md text-[9px] ${selectedDate === day ? "bg-red-50 ring-1 ring-inset ring-red-200" : "hover:bg-slate-50"}`}
                            />
                          ) : <span key={`blank-${index}`} style={{ gridColumn: index + 1, gridRow: 1 }} />)}
                          {vehicleEvents.map((event) => {
                            const itemKey = `event:${event.tipo}:${event.id}`;
                            return (
                              <button
                                key={itemKey}
                                type="button"
                                onClick={() => {
                                  setSelectedDate(event.visibleStart);
                                  setSelectedItemKey(itemKey);
                                }}
                                aria-pressed={selectedItemKey === itemKey}
                                aria-label={`${vehicle.placa}, ${formatDate(event.visibleStart)}${event.visibleEnd !== event.visibleStart ? ` al ${formatDate(event.visibleEnd)}` : ""}, ${eventSummary(event)}, ${eventStatusLabel(event)}`}
                                title={`${eventStatusLabel(event)} · ${formatDate(event.visibleStart)}${event.visibleEnd !== event.visibleStart ? ` al ${formatDate(event.visibleEnd)}` : ""} · ${eventSummary(event)}`}
                                style={{
                                  gridColumn: `${event.gridStart + 1} / ${event.gridEnd + 2}`,
                                  gridRow: event.lane + 2,
                                }}
                                className={`z-[1] min-w-0 truncate rounded-lg border px-1.5 text-left text-[9px] font-black leading-5 transition hover:brightness-95 ${eventStyle(event)} ${selectedItemKey === itemKey ? "ring-2 ring-[#E31E24] ring-offset-1" : ""}`}
                              >
                                {event.tipo === "mantenimiento" ? "Mantenimiento" : event.tipo === "reserva" ? "Reserva" : eventSummary(event)}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="hidden flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 text-[10px] font-semibold text-slate-600 sm:px-5 lg:flex">
          <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-blue-200 bg-blue-50" /> Viaje o reserva</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-emerald-200 bg-emerald-50" /> En curso</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-amber-200 bg-amber-50" /> Mantenimiento</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-slate-200 bg-slate-100" /> Finalizado</span>
        </div>

        <div className="divide-y divide-slate-100 lg:hidden">
          {loading ? (
            <div className="py-12 text-center text-sm font-semibold text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin text-[#E31E24]" size={22} />Cargando agenda…</div>
          ) : mobileAgenda.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No hay viajes ni reservas pendientes para este mes.</p>
          ) : mobileAgenda.map(({ day, events: dayEvents, reservations: dayReservations }) => (
            <section key={day} className={selectedDate === day ? "bg-red-50/40" : ""}>
              <button
                type="button"
                onClick={() => { setSelectedDate(day); setSelectedItemKey(null); }}
                aria-pressed={selectedDate === day}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="text-sm font-black capitalize text-slate-800">{formatDate(day)}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                  {dayEvents.length + dayReservations.length} {dayEvents.length + dayReservations.length === 1 ? "servicio" : "servicios"}
                </span>
              </button>
              <ul className="space-y-2 px-4 pb-3">
                {dayEvents.map((event) => {
                  const vehicle = vehicles.find((entry) => entry.id === event.vehiculo_id);
                  const itemKey = `event:${event.tipo}:${event.id}`;
                  return (
                    <li key={itemKey}>
                      <button
                        type="button"
                        onClick={() => { setSelectedDate(day); setSelectedItemKey(itemKey); }}
                        aria-pressed={selectedItemKey === itemKey}
                        className={`w-full rounded-xl border p-3 text-left ${eventStyle(event)} ${selectedItemKey === itemKey ? "ring-2 ring-[#E31E24] ring-offset-1" : ""}`}
                      >
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-black">{vehicle ? `${vehicle.placa} · ${vehicle.modelo}` : eventName(event)}</span>
                          <span className="text-[9px] font-bold">{eventStatusLabel(event)}</span>
                        </span>
                        <span className="mt-1 block text-[11px] font-semibold">{eventSummary(event)}</span>
                      </button>
                    </li>
                  );
                })}
                {dayReservations.map((reservation) => {
                  const itemKey = `reservation:${reservation.id}`;
                  return (
                    <li key={itemKey}>
                      <button
                        type="button"
                        onClick={() => { setSelectedDate(day); setSelectedItemKey(itemKey); }}
                        aria-pressed={selectedItemKey === itemKey}
                        className={`w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-amber-900 ${selectedItemKey === itemKey ? "ring-2 ring-amber-500 ring-offset-1" : ""}`}
                      >
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-black">Reserva #{reservation.id} · {reservation.cliente_nombre}</span>
                          <span className="text-[9px] font-black uppercase">Requiere vehículo</span>
                        </span>
                        <span className="mt-1 block text-[11px] font-semibold">{[reservation.origen, reservation.destino].filter(Boolean).join(" → ") || "Ruta pendiente"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900">Agenda del {formatDate(selectedDate)}</h2>
              <p className="mt-1 text-xs text-slate-500">Servicios asignados al día seleccionado.</p>
            </div>
            <Clock3 size={19} className="shrink-0 text-slate-400" />
          </div>
          {selectedEvents.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No hay viajes ni mantenimientos registrados para este día.</p>
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((event) => {
                const vehicle = vehicles.find((entry) => entry.id === event.vehiculo_id);
                const itemKey = `event:${event.tipo}:${event.id}`;
                return (
                  <li key={itemKey}>
                    <button
                      type="button"
                      onClick={() => setSelectedItemKey(itemKey)}
                      aria-pressed={selectedItemKey === itemKey}
                      className={`w-full rounded-xl border p-3 text-left ${eventStyle(event)} ${selectedItemKey === itemKey ? "ring-2 ring-[#E31E24] ring-offset-1" : ""}`}
                    >
                      <p className="text-sm font-black">{vehicle ? `${vehicle.placa} · ${vehicle.modelo}` : "Vehículo"}</p>
                      <p className="mt-1 text-xs font-semibold">{eventSummary(event)}</p>
                      {event.tipo === "mantenimiento" && event.descripcion && <p className="mt-1 text-xs">{event.descripcion}</p>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900">Reservas confirmadas sin vehículo</h2>
              <p className="mt-1 text-xs text-slate-600">Revisa si requieren asignación o subcontratación.</p>
            </div>
            <AlertTriangle size={19} className="shrink-0 text-amber-600" />
          </div>
          {selectedReservations.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-white/70 p-4 text-sm text-slate-600">No hay reservas confirmadas sin vehículo para este día.</p>
          ) : (
            <ul className="mb-4 space-y-2">
              {selectedReservations.map((reservation) => (
                <li key={reservation.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedItemKey(`reservation:${reservation.id}`)}
                    aria-pressed={selectedItemKey === `reservation:${reservation.id}`}
                    className={`w-full rounded-xl border border-amber-200 bg-white p-3 text-left ${selectedItemKey === `reservation:${reservation.id}` ? "ring-2 ring-amber-500 ring-offset-1" : ""}`}
                  >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-800">Reserva #{reservation.id} · {reservation.cliente_nombre}</p>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-800">{reservation.num_personas} pasajeros · requiere vehículo</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{[reservation.origen, reservation.destino].filter(Boolean).join(" → ") || "Ruta pendiente"}</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">{reservation.tipo_vehiculo || "Tipo de vehículo por definir"} · {formatDate((reservation.fecha_salida || reservation.fecha_servicio || reservation.fecha_reserva).slice(0, 10))}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/operaciones" className="inline-flex items-center gap-2 rounded-xl bg-[#E31E24] px-4 py-2.5 text-xs font-black text-white transition hover:bg-red-700">
            Ir a despacho <ArrowRight size={15} />
          </Link>
        </section>
      </div>

      <section aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays size={18} className="text-slate-500" />
          <h2 className="text-base font-black text-slate-900">Detalle seleccionado</h2>
        </div>
        {selectedEvent ? (
          <div className={`rounded-xl border p-4 ${eventStyle(selectedEvent)}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black">{eventName(selectedEvent)} · {vehicles.find((vehicle) => vehicle.id === selectedEvent.vehiculo_id)?.placa || "Vehículo"}</p>
                <p className="mt-1 text-xs font-semibold">{eventStatusLabel(selectedEvent)}</p>
              </div>
              <span className="rounded-full border border-current/20 bg-white/70 px-3 py-1 text-[10px] font-black">
                {formatDate(selectedEvent.fecha_inicio)}{selectedEvent.fecha_fin !== selectedEvent.fecha_inicio ? ` – ${formatDate(selectedEvent.fecha_fin)}` : ""}
              </span>
            </div>
            <p className="mt-3 text-xs font-semibold">{eventSummary(selectedEvent)}</p>
            {selectedEvent.tipo === "mantenimiento" && selectedEvent.descripcion && <p className="mt-1 text-xs">{selectedEvent.descripcion}</p>}
            {selectedEvent.tipo !== "mantenimiento" && <p className="mt-2 text-xs font-bold">Unidad asignada a este servicio.</p>}
          </div>
        ) : selectedUnassignedReservation ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black">Reserva #{selectedUnassignedReservation.id} · {selectedUnassignedReservation.cliente_nombre}</p>
                <p className="mt-1 text-xs font-semibold">Requiere asignar un vehículo o confirmar una subcontratación.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black">{selectedUnassignedReservation.num_personas} pasajeros</span>
            </div>
            <p className="mt-3 text-xs font-semibold">{[selectedUnassignedReservation.origen, selectedUnassignedReservation.destino].filter(Boolean).join(" → ") || "Ruta pendiente"}</p>
            <p className="mt-1 text-xs">{selectedUnassignedReservation.tipo_vehiculo || "Tipo de vehículo por definir"} · {formatDate((selectedUnassignedReservation.fecha_salida || selectedUnassignedReservation.fecha_servicio || selectedUnassignedReservation.fecha_reserva).slice(0, 10))}</p>
            <Link href="/admin/operaciones" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#E31E24] px-3 py-2 text-xs font-black text-white hover:bg-red-700">
              Revisar en despacho <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Selecciona una barra de viaje, mantenimiento o reserva para ver sus detalles y estado de asignación.</p>
        )}
      </section>
    </div>
  );
}
