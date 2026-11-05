"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { getAuthHeaders, handleUnauthorized } from "../../../lib/session";
import { useConductorPanel } from "../_components/use-conductor-panel";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Block = {
  id: number;
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  motivo: "viaje_externo" | "ocupado" | "fuera_de_servicio";
  cliente_empresa?: string | null;
  origen?: string | null;
  destino?: string | null;
};
type Vehicle = { id: number; placa: string; modelo: string; estado: string };

const today = () => new Date().toISOString().slice(0, 10);
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-[#E31E24]";

const reasonLabels: Record<Block["motivo"], string> = {
  viaje_externo: "Viaje externo",
  ocupado: "Ocupado con otro cliente",
  fuera_de_servicio: "Fuera de servicio",
};

export default function DisponibilidadPage() {
  const { checkingSession, user } = useConductorPanel();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    fecha_inicio: today(),
    vehiculo_id: "",
    fecha_fin: today(),
    hora_inicio: "",
    hora_fin: "",
    motivo: "viaje_externo" as Block["motivo"],
    cliente_empresa: "",
    origen: "",
    destino: "",
    notas: "",
  });

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [response, vehicleResponse] = await Promise.all([
        fetch(`${API}/api/conductor/${user.id}/disponibilidad-externa`, { headers: getAuthHeaders() }),
        fetch(`${API}/api/conductor/${user.id}/vehiculo`, { headers: getAuthHeaders() }),
      ]);
      if (handleUnauthorized(response.status)) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cargar la disponibilidad");
      setBlocks(data);
      if (vehicleResponse.ok) {
        const vehicleData = await vehicleResponse.json();
        setVehicles(Array.isArray(vehicleData.vehiculos) ? vehicleData.vehiculos : [vehicleData]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar la disponibilidad");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!checkingSession) void load();
  }, [checkingSession, user?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setSending(true);
    try {
      const response = await fetch(`${API}/api/conductor/${user?.id}/disponibilidad-externa`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, vehiculo_id: Number(form.vehiculo_id) }),
      });
      if (handleUnauthorized(response.status)) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo registrar el bloqueo");
      setMessage(data.message || "Disponibilidad registrada");
      setForm((current) => ({ ...current, fecha_inicio: today(), fecha_fin: today(), hora_inicio: "", hora_fin: "", cliente_empresa: "", origen: "", destino: "", notas: "" }));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo registrar el bloqueo");
    } finally {
      setSending(false);
    }
  };

  const cancel = async (id: number) => {
    setError("");
    try {
      const response = await fetch(`${API}/api/conductor/${user?.id}/disponibilidad-externa/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (handleUnauthorized(response.status)) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cancelar el bloqueo");
      setMessage(data.message || "Bloqueo cancelado");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cancelar el bloqueo");
    }
  };

  if (checkingSession) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#E31E24]" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#E31E24]">Agenda del vehículo</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Mi disponibilidad</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">Registra viajes externos u otros compromisos para que el administrador los vea y no asigne tu vehículo en ese horario.</p>
      </div>
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
      <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-2">
        <label className="text-xs font-black text-slate-600 md:col-span-2">Vehículo<select required className={inputClass} value={form.vehiculo_id} onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}><option value="">Selecciona un vehículo</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.placa} · {vehicle.modelo}{vehicle.estado === "mantenimiento" ? " · En mantenimiento" : ""}</option>)}</select></label>
        <label className="text-xs font-black text-slate-600">Desde<input required type="date" className={inputClass} value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></label>
        <label className="text-xs font-black text-slate-600">Hasta<input required type="date" className={inputClass} value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} /></label>
        <label className="text-xs font-black text-slate-600">Hora de inicio (opcional)<input type="time" className={inputClass} value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} /></label>
        <label className="text-xs font-black text-slate-600">Hora de fin (opcional)<input type="time" className={inputClass} value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} /></label>
        <label className="text-xs font-black text-slate-600">Motivo<select className={inputClass} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value as Block["motivo"] })}>{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-black text-slate-600">Cliente o empresa (opcional)<input className={inputClass} maxLength={160} value={form.cliente_empresa} onChange={(e) => setForm({ ...form, cliente_empresa: e.target.value })} /></label>
        <label className="text-xs font-black text-slate-600">Origen<input className={inputClass} maxLength={300} value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })} /></label>
        <label className="text-xs font-black text-slate-600">Destino<input className={inputClass} maxLength={300} value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })} /></label>
        <label className="text-xs font-black text-slate-600 md:col-span-2">Notas<textarea className={inputClass} rows={2} maxLength={1000} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></label>
        <button disabled={sending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E31E24] px-4 py-3 text-sm font-black text-white disabled:opacity-60 md:col-span-2"><Plus size={17} />{sending ? "Guardando..." : "Registrar disponibilidad"}</button>
      </form>
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><CalendarClock size={20} />Bloqueos activos</h2>
        {loading ? <Loader2 className="animate-spin text-[#E31E24]" /> : blocks.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">No tienes bloqueos externos registrados.</p> : blocks.map((block) => (
          <article key={block.id} className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-black text-violet-900">{reasonLabels[block.motivo]} · {block.fecha_inicio}{block.fecha_fin !== block.fecha_inicio ? ` al ${block.fecha_fin}` : ""}</p><p className="text-xs font-semibold text-violet-700">{block.hora_inicio ? `${block.hora_inicio.slice(0, 5)} - ${block.hora_fin?.slice(0, 5)}` : "Todo el día"}{block.cliente_empresa ? ` · ${block.cliente_empresa}` : ""}</p>{(block.origen || block.destino) && <p className="text-xs text-violet-700">{[block.origen, block.destino].filter(Boolean).join(" → ")}</p>}</div>
            <button type="button" onClick={() => void cancel(block.id)} className="inline-flex items-center gap-2 self-start rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50"><Trash2 size={15} />Cancelar</button>
          </article>
        ))}
      </section>
    </div>
  );
}
