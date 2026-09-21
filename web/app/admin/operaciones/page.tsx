"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Plus, RefreshCw, X } from "lucide-react";
import { getAuthHeaders } from "../../../lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Operation = {
  id: number;
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
  vehiculo_placa?: string | null;
  conductor_nombre?: string | null;
  conductor_apellido?: string | null;
};

type Vehicle = { id: number; placa: string; modelo: string; capacidad: number; estado: string; activo: boolean };
type Driver = { id: number; nombre: string; apellido?: string; estado: string; activo: boolean };

const stateLabels: Record<string, string> = {
  programada: "Programada",
  asignada: "Asignada",
  en_curso: "En curso",
  completada: "Completada",
  cancelada: "Cancelada",
  incidencia: "Incidencia",
};

export default function OperacionesPage() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [assignment, setAssignment] = useState<Operation | null>(null);
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
      const [operationsRes, vehiclesRes, driversRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/operaciones`, { headers }),
        fetch(`${API_URL}/api/admin/vehiculos`, { headers }),
        fetch(`${API_URL}/api/admin/conductores`, { headers }),
      ]);
      const operationsData = await operationsRes.json();
      const vehiclesData = await vehiclesRes.json();
      const driversData = await driversRes.json();
      if (!operationsRes.ok) throw new Error(operationsData.error || "No se pudieron cargar las operaciones");
      setOperations(operationsData.data || []);
      setVehicles(Array.isArray(vehiclesData) ? vehiclesData : vehiclesData.data || []);
      setDrivers(Array.isArray(driversData) ? driversData : driversData.data || []);
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
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "La operación no pudo completarse");
    return data;
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
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await request(`/api/admin/operaciones/${assignment.id}/asignar`, {
        method: "PATCH",
        body: JSON.stringify({ vehiculo_id: Number(data.get("vehiculo_id")), conductor_id: Number(data.get("conductor_id")) }),
      });
      setMessage("Recursos asignados. Las validaciones operativas fueron aprobadas.");
      setAssignment(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo asignar la operación");
    } finally {
      setSaving(false);
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
          <h1 className="mt-2 text-3xl font-black tracking-tight">Operaciones de transporte</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">Planifica, asigna y ejecuta servicios con validaciones de flota y trazabilidad.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300">
          <Plus size={17} /> Nueva operación
        </button>
      </header>

      {(message || error) && (
        <div className={`flex items-center gap-3 rounded-2xl border p-4 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{error || message}</span>
          <button className="ml-auto" onClick={() => { setMessage(""); setError(""); }} aria-label="Cerrar mensaje"><X size={16} /></button>
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3"><ClipboardList className="text-cyan-600" size={20} /><h2 className="font-black text-slate-900">Agenda operativa</h2></div>
          <button onClick={() => void load()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Actualizar operaciones"><RefreshCw size={17} /></button>
        </div>
        {loading ? <p className="p-8 text-center text-sm font-semibold text-slate-400">Cargando operaciones...</p> : operations.length === 0 ? <p className="p-8 text-center text-sm font-semibold text-slate-400">No hay operaciones registradas.</p> : (
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Servicio</th><th className="px-5 py-3">Fecha</th><th className="px-5 py-3">Ruta</th><th className="px-5 py-3">Recursos</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{operations.map((operation) => <tr key={operation.id} className="align-top"><td className="px-5 py-4"><p className="font-black text-slate-900">#{operation.id} · {operation.tipo_servicio}</p><p className="mt-1 text-xs text-slate-500">{operation.pasajeros} pasajeros</p></td><td className="whitespace-nowrap px-5 py-4 text-slate-600">{operation.fecha_programada}<br /><span className="text-xs">{operation.hora_inicio || "Sin hora"}{operation.hora_fin ? ` - ${operation.hora_fin}` : ""}</span></td><td className="max-w-xs px-5 py-4 text-slate-600">{operation.origen}<br /><span className="font-semibold text-slate-900">{operation.destino}</span></td><td className="px-5 py-4 text-xs text-slate-600">{operation.vehiculo_placa || "Sin vehículo"}<br />{operation.conductor_nombre ? `${operation.conductor_nombre} ${operation.conductor_apellido || ""}` : "Sin conductor"}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{stateLabels[operation.estado] || operation.estado}</span></td><td className="space-y-2 px-5 py-4"><div className="flex flex-wrap gap-2">{["programada", "asignada"].includes(operation.estado) && <button onClick={() => setAssignment(operation)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">{operation.vehiculo_id ? "Reasignar" : "Asignar"}</button>}{operation.estado === "asignada" && <button onClick={() => void changeState(operation, "en_curso")} disabled={saving} className="rounded-lg bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700">Iniciar</button>}{operation.estado === "en_curso" && <button onClick={() => void changeState(operation, "completada")} disabled={saving} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Finalizar</button>}</div></td></tr>)}</tbody></table></div>
        )}
      </section>

      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={createOperation} className="w-full max-w-2xl space-y-4 rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-black text-slate-950">Nueva operación</h2><button type="button" onClick={() => setShowCreate(false)} aria-label="Cerrar formulario"><X /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-600">Tipo de servicio<input value={form.tipo_servicio} onChange={(e) => setForm({ ...form, tipo_servicio: e.target.value })} className="mt-1 w-full rounded-xl border p-3" required /></label><label className="text-sm font-bold text-slate-600">Pasajeros<input type="number" min="1" value={form.pasajeros} onChange={(e) => setForm({ ...form, pasajeros: e.target.value })} className="mt-1 w-full rounded-xl border p-3" required /></label><label className="text-sm font-bold text-slate-600">Fecha<input type="date" value={form.fecha_programada} onChange={(e) => setForm({ ...form, fecha_programada: e.target.value })} className="mt-1 w-full rounded-xl border p-3" required /></label><div className="grid grid-cols-2 gap-2"><label className="text-sm font-bold text-slate-600">Inicio<input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold text-slate-600">Fin<input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label></div><label className="text-sm font-bold text-slate-600">Origen<input value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })} className="mt-1 w-full rounded-xl border p-3" required /></label><label className="text-sm font-bold text-slate-600">Destino<input value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })} className="mt-1 w-full rounded-xl border p-3" required /></label></div><button disabled={saving} className="w-full rounded-xl bg-slate-950 py-3 font-black text-white disabled:opacity-50">{saving ? "Guardando..." : "Crear operación"}</button></form></div>}

      {assignment && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={assignOperation} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-600">Operación #{assignment.id}</p><h2 className="text-xl font-black text-slate-950">Asignar recursos</h2></div><button type="button" onClick={() => setAssignment(null)} aria-label="Cerrar asignación"><X /></button></div><label className="block text-sm font-bold text-slate-600">Vehículo<select name="vehiculo_id" defaultValue={assignment.vehiculo_id || ""} className="mt-1 w-full rounded-xl border p-3" required><option value="">Selecciona un vehículo</option>{vehicles.filter((vehicle) => vehicle.activo && !["mantenimiento", "inactivo"].includes(vehicle.estado)).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.placa} · {vehicle.modelo} · {vehicle.capacidad} pax</option>)}</select></label><label className="block text-sm font-bold text-slate-600">Conductor<select name="conductor_id" defaultValue={assignment.conductor_id || ""} className="mt-1 w-full rounded-xl border p-3" required><option value="">Selecciona un conductor</option>{drivers.filter((driver) => driver.activo && !["inactivo", "mantenimiento"].includes(driver.estado)).map((driver) => <option key={driver.id} value={driver.id}>{driver.nombre} {driver.apellido || ""}</option>)}</select></label><p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">El backend verificará capacidad, mantenimiento, licencia y conflictos de horario.</p><button disabled={saving} className="w-full rounded-xl bg-cyan-500 py-3 font-black text-slate-950 disabled:opacity-50">{saving ? "Validando..." : "Confirmar asignación"}</button></form></div>}
    </main>
  );
}
