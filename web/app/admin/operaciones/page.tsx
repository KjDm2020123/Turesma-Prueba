"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { getAuthHeaders } from "../../../lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ApiList<T> = T[] | { data?: T[] };

const getApiList = <T,>(payload: ApiList<T>) =>
  Array.isArray(payload) ? payload : payload.data || [];

const readApiJson = async <T,>(response: Response, path: string): Promise<T> => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    throw new Error(
      `La API devolvió HTML en ${path} (HTTP ${response.status}). Verifica NEXT_PUBLIC_API_URL y que el backend publicado tenga esta ruta.`
    );
  }

  let payload: T;
  try {
    payload = await response.json() as T;
  } catch {
    throw new Error(`La API devolvió JSON inválido en ${path} (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const errorMessage = typeof payload === "object" && payload !== null && "error" in payload
      && typeof payload.error === "string"
      ? payload.error
      : `La solicitud a ${path} falló (HTTP ${response.status}).`;
    throw new Error(errorMessage);
  }

  return payload;
};

type Operation = {
  id: number;
  reserva_id?: number | null;
  tipo_servicio: string;
  fecha_programada: string;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  origen: string;
  destino: string;
  pasajeros: number;
  estado: string;
  vehiculo_id?: number | null;
  conductor_id?: number | null;
  conductor_usuario_id?: number | null;
  vehiculo_placa?: string | null;
  conductor_nombre?: string | null;
  conductor_apellido?: string | null;
};

type ReservationReady = {
  id: number;
  fecha_reserva: string;
  fecha_servicio?: string | null;
  fecha_salida?: string | null;
  fecha_llegada?: string | null;
  origen?: string | null;
  destino?: string | null;
  num_personas: number;
  total: number;
  tipo_vehiculo?: string | null;
  vehiculo_id?: number | null;
  conductor_id?: number | null;
  operacion_cancelada_id?: number | null;
  cliente_nombre?: string | null;
  vehiculo_placa?: string | null;
};

type Vehicle = { id: number; placa: string; modelo: string; capacidad: number; estado: string; activo: boolean };
type Driver = { id: number; nombre: string; apellido?: string; estado: string; activo: boolean };
type AssignmentRecommendation = {
  decisionId: number;
  vehiculo: { vehiculo_id: number; conductor_id?: number | null; placa: string; puntaje: number; razones: string[] };
  alternativas: Array<{ vehiculo_id: number; placa: string }>;
};

const stateLabels: Record<string, string> = {
  programada: "Programada",
  asignada: "Asignada",
  en_curso: "En curso",
  completada: "Completada",
  cancelada: "Cancelada",
  incidencia: "Incidencia",
};

const formatDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const formatTime = (value?: string | null) => value?.slice(0, 5) || null;

export default function OperacionesPage() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [reservations, setReservations] = useState<ReservationReady[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [assignment, setAssignment] = useState<Operation | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [assignmentRecommendation, setAssignmentRecommendation] = useState<AssignmentRecommendation | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const [form, setForm] = useState({
    tipo_servicio: "viaje",
    fecha_programada: new Date().toISOString().slice(0, 10),
    hora_inicio: "08:00",
    hora_fin: "10:00",
    origen: "",
    destino: "",
    pasajeros: "1",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = getAuthHeaders();
      const [operationsRes, reservationsRes, vehiclesRes, driversRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/operaciones`, { headers }),
        fetch(`${API_URL}/api/admin/operaciones/reservas-pendientes`, { headers }),
        fetch(`${API_URL}/api/admin/vehiculos`, { headers }),
        fetch(`${API_URL}/api/admin/conductores`, { headers }),
      ]);
      const [operationsData, reservationsData, vehiclesData, driversData] = await Promise.all([
        readApiJson<{ data?: Operation[] }>(operationsRes, "/api/admin/operaciones"),
        readApiJson<{ data?: ReservationReady[] }>(reservationsRes, "/api/admin/operaciones/reservas-pendientes"),
        readApiJson<ApiList<Vehicle>>(vehiclesRes, "/api/admin/vehiculos"),
        readApiJson<ApiList<Driver>>(driversRes, "/api/admin/conductores"),
      ]);
      setOperations(operationsData.data || []);
      setReservations(reservationsData.data || []);
      setVehicles(getApiList(vehiclesData));
      setDrivers(getApiList(driversData));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error cargando datos operativos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const request = async (url: string, options: RequestInit) => {
    const response = await fetch(`${API_URL}${url}`, { ...options, headers: { ...getAuthHeaders(), "Content-Type": "application/json" } });
    return readApiJson<Record<string, unknown>>(response, url);
  };

  const sendReservationToDispatch = async (reservation: ReservationReady) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await request(
        reservation.operacion_cancelada_id
          ? `/api/admin/operaciones/${reservation.operacion_cancelada_id}/reabrir`
          : `/api/admin/operaciones/reservas/${reservation.id}/despachar`,
        {
          method: reservation.operacion_cancelada_id ? "PATCH" : "POST",
          body: JSON.stringify({}),
        }
      );
      setMessage(reservation.operacion_cancelada_id
        ? `Se reabrió el despacho cancelado de la reserva #${reservation.id}.`
        : `La reserva #${reservation.id} quedó preparada para despacho.`);
      await load();
    } catch (dispatchError) {
      setError(dispatchError instanceof Error ? dispatchError.message : "No se pudo preparar el despacho");
    } finally {
      setSaving(false);
    }
  };

  const createOperation = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await request("/api/admin/operaciones", { method: "POST", body: JSON.stringify({ ...form, pasajeros: Number(form.pasajeros) }) });
      setMessage("Operación creada correctamente");
      setShowCreate(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo crear la operación");
    } finally {
      setSaving(false);
    }
  };

  const assignOperation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignment) return;
    const selectedVehicle = Number(selectedVehicleId);
    const selectedDriver = Number(selectedDriverId);
    const selectingAlternative = assignmentRecommendation !== null
      && selectedVehicle !== assignmentRecommendation.vehiculo.vehiculo_id;
    if (selectingAlternative && !decisionReason.trim()) {
      setError("Indica por qué se eligió una alternativa a la recomendación.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await request(`/api/admin/operaciones/${assignment.id}/asignar`, {
        method: "PATCH",
        body: JSON.stringify({
          vehiculo_id: selectedVehicle,
          conductor_id: selectedDriver,
          ...(assignmentRecommendation ? {
            decision_id: assignmentRecommendation.decisionId,
            decision_reason: decisionReason.trim(),
          } : {}),
        }),
      });
      setMessage("Recursos asignados. Las validaciones operativas fueron aprobadas.");
      setAssignment(null);
      setAssignmentRecommendation(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo asignar la operación");
    } finally {
      setSaving(false);
    }
  };

  const openAssignment = (operation: Operation) => {
    setAssignment(operation);
    setSelectedVehicleId(operation.vehiculo_id ? String(operation.vehiculo_id) : "");
    setSelectedDriverId(operation.conductor_usuario_id ? String(operation.conductor_usuario_id) : "");
    setAssignmentRecommendation(null);
    setDecisionReason("");
    setError("");
  };

  const recommendAssignment = async () => {
    if (!assignment) return;
    setRecommendationLoading(true);
    setAssignmentRecommendation(null);
    setError("");
    try {
      const query = new URLSearchParams({
        fecha: assignment.fecha_programada,
        pasajeros: String(assignment.pasajeros),
        operacion_id: String(assignment.id),
      });
      if (assignment.hora_inicio) query.set("hora_inicio", assignment.hora_inicio.slice(0, 5));
      if (assignment.hora_fin) query.set("hora_fin", assignment.hora_fin.slice(0, 5));
      const payload = await request(`/api/admin/inteligencia/asignacion-recomendada?${query}`, { method: "GET" });
      const recommendation = payload.data as AssignmentRecommendation;
      setAssignmentRecommendation(recommendation);
      setSelectedVehicleId(String(recommendation.vehiculo.vehiculo_id));
      if (recommendation.vehiculo.conductor_id) {
        setSelectedDriverId(String(recommendation.vehiculo.conductor_id));
      }
      setDecisionReason("");
    } catch (recommendationError) {
      setError(recommendationError instanceof Error ? recommendationError.message : "No se pudo generar la recomendación");
    } finally {
      setRecommendationLoading(false);
    }
  };

  const changeState = async (operation: Operation, estado: string) => {
    setSaving(true);
    setError("");
    try {
      await request(`/api/admin/operaciones/${operation.id}/estado`, { method: "PATCH", body: JSON.stringify({ estado }) });
      setMessage(`Operación ${stateLabels[estado].toLowerCase()}.`);
      await load();
    } catch (stateError) {
      setError(stateError instanceof Error ? stateError.message : "No se pudo cambiar el estado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">Gestión operativa</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Despacho de servicios</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">Prepara reservas confirmadas, asigna recursos y supervisa cada servicio con validaciones operativas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300">
            <Plus size={17} /> Crear servicio manual
          </button>
        </div>
      </header>

      {(message || error) && (
        <div className={`flex items-center gap-3 rounded-2xl border p-4 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{error || message}</span>
          <button className="ml-auto" onClick={() => { setMessage(""); setError(""); }} aria-label="Cerrar mensaje"><X size={16} /></button>
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/70 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Flujo principal</p>
            <h2 className="mt-1 font-black text-slate-900">Reservas confirmadas por despachar</h2>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">{reservations.length}</span>
        </div>
        {loading ? <p className="p-6 text-center text-sm font-semibold text-slate-400">Buscando reservas confirmadas...</p> : reservations.length === 0 ? (
          <div className="p-7 text-center">
            <p className="text-sm font-black text-slate-600">No hay reservas pendientes de despacho</p>
            <p className="mt-1 text-xs text-slate-400">Cuando una reserva se confirme y necesite vehículo o conductor, aparecerá aquí.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reservations.map((reservation) => (
              <div key={reservation.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-black text-slate-900">Reserva #{reservation.id} · {reservation.cliente_nombre || "Cliente"}</p>
                  <p className="mt-1 text-sm text-slate-600">{reservation.origen || "Origen pendiente"} → {reservation.destino || "Destino pendiente"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {String(reservation.fecha_salida || reservation.fecha_servicio || reservation.fecha_reserva).slice(0, 10)}
                    {" · "}{reservation.num_personas} pasajeros
                    {" · "}Vehículo: {reservation.vehiculo_placa || "pendiente"}
                    {reservation.tipo_vehiculo && ` · Preferencia: ${reservation.tipo_vehiculo}`}
                    {" · "}Conductor: {reservation.conductor_id ? "asignado" : "pendiente"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void sendReservationToDispatch(reservation)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reservation.operacion_cancelada_id ? "Reabrir despacho" : "Preparar despacho"} <ArrowRight size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3"><ClipboardList className="text-cyan-600" size={20} /><h2 className="font-black text-slate-900">Servicios programados</h2></div>
          <button onClick={() => void load()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Actualizar operaciones"><RefreshCw size={17} /></button>
        </div>
        {loading ? <p className="p-8 text-center text-sm font-semibold text-slate-400">Cargando servicios...</p> : operations.length === 0 ? <div className="p-10 text-center"><p className="text-sm font-black text-slate-500">No hay servicios programados</p><p className="mt-1 text-xs text-slate-400">Las reservas confirmadas aparecerán aquí para asignar conductor y vehículo.</p></div> : (
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Servicio</th><th className="px-5 py-3">Fecha</th><th className="px-5 py-3">Ruta</th><th className="px-5 py-3">Recursos</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{operations.map((operation) => {
            const startTime = formatTime(operation.hora_inicio);
            const endTime = formatTime(operation.hora_fin);
            return <tr key={operation.id} className="align-top"><td className="px-5 py-4"><p className="font-black text-slate-900">#{operation.id} · {operation.reserva_id ? `Reserva #${operation.reserva_id}` : operation.tipo_servicio}</p><p className="mt-1 text-xs text-slate-500">{operation.pasajeros} pasajeros</p></td><td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(operation.fecha_programada)}<br /><span className="text-xs">{startTime || "Sin hora"}{endTime ? ` - ${endTime}` : ""}</span></td><td className="max-w-xs px-5 py-4 text-slate-600">{operation.origen}<br /><span className="font-semibold text-slate-900">{operation.destino}</span></td><td className="px-5 py-4 text-xs text-slate-600">{operation.vehiculo_placa || "Sin vehículo"}<br />{operation.conductor_nombre ? `${operation.conductor_nombre} ${operation.conductor_apellido || ""}` : "Sin conductor"}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{stateLabels[operation.estado] || operation.estado}</span></td><td className="space-y-2 px-5 py-4"><div className="flex flex-wrap gap-2">{["programada", "asignada"].includes(operation.estado) && <button onClick={() => openAssignment(operation)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">{operation.vehiculo_id ? "Reasignar" : "Asignar"}</button>}{operation.estado === "asignada" && <button onClick={() => void changeState(operation, "en_curso")} disabled={saving} className="rounded-lg bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700">Iniciar</button>}{operation.estado === "en_curso" && <button onClick={() => void changeState(operation, "completada")} disabled={saving} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Finalizar</button>}</div></td></tr>;
          })}</tbody></table></div>
        )}
      </section>

      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={createOperation} className="w-full max-w-2xl space-y-4 rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-black text-slate-950">Nueva operación</h2><button type="button" onClick={() => setShowCreate(false)} aria-label="Cerrar formulario"><X /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-600">Tipo de servicio<input value={form.tipo_servicio} onChange={(e) => setForm({ ...form, tipo_servicio: e.target.value })} className="mt-1 w-full rounded-xl border p-3" required /></label><label className="text-sm font-bold text-slate-600">Pasajeros<input type="number" min="1" value={form.pasajeros} onChange={(e) => setForm({ ...form, pasajeros: e.target.value })} className="mt-1 w-full rounded-xl border p-3" required /></label><label className="text-sm font-bold text-slate-600">Fecha<input type="date" value={form.fecha_programada} onChange={(e) => setForm({ ...form, fecha_programada: e.target.value })} className="mt-1 w-full rounded-xl border p-3" required /></label><div className="grid grid-cols-2 gap-2"><label className="text-sm font-bold text-slate-600">Inicio<input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold text-slate-600">Fin<input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label></div><label className="text-sm font-bold text-slate-600">Origen<input value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })} className="mt-1 w-full rounded-xl border p-3" required /></label><label className="text-sm font-bold text-slate-600">Destino<input value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })} className="mt-1 w-full rounded-xl border p-3" required /></label></div><button disabled={saving} className="w-full rounded-xl bg-slate-950 py-3 font-black text-white disabled:opacity-50">{saving ? "Guardando..." : "Crear operación"}</button></form></div>}

      {assignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
          <form
            onSubmit={assignOperation}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-4 overflow-y-auto overscroll-contain rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">
                  Operación #{assignment.id}{assignment.reserva_id ? ` · Reserva #${assignment.reserva_id}` : ""}
                </p>
                <h2 className="text-xl font-black text-slate-950">Asignar recursos</h2>
              </div>
              <button type="button" onClick={() => { setAssignment(null); setAssignmentRecommendation(null); }} aria-label="Cerrar asignación">
                <X />
              </button>
            </div>
            <button
              type="button"
              onClick={() => void recommendAssignment()}
              disabled={recommendationLoading || saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800 disabled:opacity-50"
            >
              <Sparkles size={16} />
              {recommendationLoading ? "Evaluando disponibilidad..." : assignmentRecommendation ? "Actualizar recomendación" : "Sugerir vehículo"}
            </button>
            {assignmentRecommendation && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                <p className="font-black">Sugerido: {assignmentRecommendation.vehiculo.placa} · puntaje {assignmentRecommendation.vehiculo.puntaje}/100</p>
                <ul className="mt-1 list-inside list-disc">
                  {assignmentRecommendation.vehiculo.razones.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </div>
            )}
            <label className="block text-sm font-bold text-slate-600">
              Vehículo
              <select
                name="vehiculo_id"
                value={selectedVehicleId}
                onChange={(event) => {
                  setSelectedVehicleId(event.target.value);
                  if (event.target.value === String(assignmentRecommendation?.vehiculo.vehiculo_id)) setDecisionReason("");
                }}
                className="mt-1 w-full rounded-xl border p-3"
                required
              >
                <option value="">Selecciona un vehículo</option>
                {vehicles.filter((vehicle) => vehicle.activo && !["mantenimiento", "inactivo"].includes(vehicle.estado) && (!assignmentRecommendation || vehicle.id === assignmentRecommendation.vehiculo.vehiculo_id || assignmentRecommendation.alternativas.some((option) => option.vehiculo_id === vehicle.id))).map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>{vehicle.placa} · {vehicle.modelo} · {vehicle.capacidad} pax</option>
                ))}
              </select>
            </label>
            {assignmentRecommendation && selectedVehicleId !== String(assignmentRecommendation.vehiculo.vehiculo_id) && (
              <label className="block text-sm font-bold text-slate-600">
                Motivo para elegir otra opción
                <textarea
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                  maxLength={500}
                  className="mt-1 w-full rounded-xl border p-3"
                  required
                  rows={2}
                />
              </label>
            )}
            <label className="block text-sm font-bold text-slate-600">
              Conductor
              <select name="conductor_id" value={selectedDriverId} onChange={(event) => setSelectedDriverId(event.target.value)} className="mt-1 w-full rounded-xl border p-3" required>
                <option value="">Selecciona un conductor</option>
                {drivers.filter((driver) => driver.activo && !["inactivo", "mantenimiento"].includes(driver.estado)).map((driver) => (
                  <option key={driver.id} value={driver.id}>{driver.nombre} {driver.apellido || ""}</option>
                ))}
              </select>
            </label>
            <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              La sugerencia es una ayuda para decidir, no una asignación automática. El backend valida capacidad, mantenimiento, licencia y conflictos de horario antes de confirmar.
            </p>
            <button disabled={saving} className="w-full rounded-xl bg-cyan-500 py-3 font-black text-slate-950 disabled:opacity-50">
              {saving ? "Validando..." : "Confirmar asignación"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
