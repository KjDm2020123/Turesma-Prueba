"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAdminGuard } from "../../../lib/use-admin-guard";
import { getAuthHeaders } from "../../../lib/session";
import { useAutoRefresh } from "../../../lib/use-auto-refresh";
import { descargarCSV } from "../../../lib/download";
import { useConfirm } from "../../../components/confirm-dialog";
import {
  Bus, Plus, Edit3, Trash2, RefreshCw, X, Search,
  CheckCircle, AlertCircle, Clock, Wrench, Car,
  Users, Loader2, ChevronDown, UploadCloud, Download
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Vehiculo = {
  id: number;
  placa: string;
  tipo: string;
  modelo: string;
  capacidad: number;
  color: string | null;
  imagen_url: string | null;
  descripcion: string | null;
  dias_servicio: number[];
  estado: string;
  activo: boolean;
  fecha_creacion: string;
  conductor_id: number | null;
  conductor_nombre: string | null;
  conductor_email: string | null;
  conductor_imagen_url: string | null;
};

type ConductorOpt = { id: number; nombre: string; email: string };

const TIPO_OPTIONS = ["van", "bus", "suv", "minibus", "sedan"];
const ESTADO_OPTIONS = ["disponible", "en_servicio", "mantenimiento", "inactivo"];
const DIAS_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const ESTADO_BADGE: Record<string, string> = {
  disponible: "bg-emerald-100 text-emerald-700 border-emerald-200",
  en_servicio: "bg-blue-100 text-blue-700 border-blue-200",
  mantenimiento: "bg-amber-100 text-amber-700 border-amber-200",
  inactivo: "bg-gray-100 text-gray-500 border-gray-200",
};

const ESTADO_ICON: Record<string, React.ReactNode> = {
  disponible: <CheckCircle size={12} />,
  en_servicio: <Bus size={12} />,
  mantenimiento: <Wrench size={12} />,
  inactivo: <AlertCircle size={12} />,
};

const INPUT_CLS = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition-all focus:border-[#E31E24] focus:bg-white placeholder:font-normal";

export default function AdminVehiculosPage() {
  const { checkingSession } = useAdminGuard();
  const confirmar = useConfirm();
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [conductores, setConductores] = useState<ConductorOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);

  const emptyForm = {
    placa: "", tipo: "van", modelo: "", capacidad: "",
    color: "", imagen_url: "", descripcion: "",
    conductor_id: "", estado: "disponible",
    dias_servicio: [1, 2, 3, 4, 5] as number[],
  };
  const [form, setForm] = useState(emptyForm);

  const load = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [vRes, cRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/vehiculos`, { headers }),
        fetch(`${API_URL}/api/admin/conductores`, { headers }),
      ]);
      if (vRes.ok) setVehiculos(await vRes.json());
      if (cRes.ok) setConductores(await cRes.json());
    } catch { /* silencio */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (!checkingSession) load(); }, [checkingSession]);

  useAutoRefresh(() => load(true), { enabled: !checkingSession, immediate: false });

  const filtered = vehiculos.filter((v) => {
    const matchSearch = !search ||
      v.placa.toLowerCase().includes(search.toLowerCase()) ||
      v.modelo.toLowerCase().includes(search.toLowerCase()) ||
      (v.conductor_nombre || "").toLowerCase().includes(search.toLowerCase());
    const matchEstado = filtroEstado === "todos" || v.estado === filtroEstado;
    return matchSearch && matchEstado && v.activo;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setMsg(""); setErr("");
    setModalOpen(true);
  };

  const exportarCSV = async () => {
    setExportando(true); setErr("");
    const result = await descargarCSV("/api/admin/reportes/exportar-csv?tipo=vehiculos", "reporte_vehiculos.csv");
    if (!result.ok) setErr(result.error || "No se pudo exportar");
    setExportando(false);
  };

  const openEdit = (v: Vehiculo) => {
    setEditingId(v.id);
    setForm({
      placa: v.placa,
      tipo: v.tipo || "van",
      modelo: v.modelo,
      capacidad: String(v.capacidad),
      color: v.color || "",
      imagen_url: v.imagen_url || "",
      descripcion: v.descripcion || "",
      conductor_id: v.conductor_id ? String(v.conductor_id) : "",
      estado: v.estado || "disponible",
      dias_servicio: v.dias_servicio || [1, 2, 3, 4, 5],
    });
    setMsg(""); setErr("");
    setModalOpen(true);
  };

  const handleImgUpload = async (file: File | null) => {
    if (!file) return;
    setUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append("imagen", file);
      const authToken = getAuthHeaders()["Authorization"];
      const res = await fetch(`${API_URL}/api/admin/uploads/vehiculo-imagen`, {
        method: "POST",
        body: fd,
        headers: authToken ? { Authorization: authToken } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al subir imagen");
      setForm((p) => ({ ...p, imagen_url: json.imageUrl || "" }));
    } catch { setErr("No se pudo subir la imagen"); }
    finally { setUploadingImg(false); }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(""); setMsg("");
    const payload = {
      placa: form.placa.toUpperCase(),
      tipo: form.tipo,
      modelo: form.modelo,
      capacidad: Number(form.capacidad),
      color: form.color || null,
      imagen_url: form.imagen_url || null,
      descripcion: form.descripcion || null,
      usuario_id: form.conductor_id ? Number(form.conductor_id) : null,
      estado: form.estado,
      dias_servicio: form.dias_servicio,
    };
    const url = editingId ? `${API_URL}/api/admin/vehiculos/${editingId}` : `${API_URL}/api/admin/vehiculos`;
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || "Error al guardar"); return; }
    setMsg(editingId ? "Vehículo actualizado correctamente" : "Vehículo registrado correctamente");
    setModalOpen(false);
    load();
  };

  const handleDelete = async (v: Vehiculo) => {
    if (!(await confirmar({ title: "Desactivar vehículo", message: `¿Desactivar el vehículo ${v.placa} — ${v.modelo}?`, confirmText: "Desactivar", tone: "danger" }))) return;
    const res = await fetch(`${API_URL}/api/admin/vehiculos/${v.id}`, { method: "DELETE", headers: getAuthHeaders() });
    if (res.ok) { setMsg("Vehículo desactivado"); load(); }
  };

  const toggleDia = (d: number) => {
    const next = form.dias_servicio.includes(d)
      ? form.dias_servicio.filter((x) => x !== d)
      : [...form.dias_servicio, d].sort();
    setForm((p) => ({ ...p, dias_servicio: next }));
  };

  if (checkingSession) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="animate-spin text-[#E31E24]" size={36} />
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ACCIONES */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button onClick={exportarCSV} disabled={exportando} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-60">
          {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Exportar CSV
        </button>
        <button onClick={openCreate} className="flex items-center gap-2 bg-[#E31E24] hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-red-600/20">
          <Plus size={16} />
          Nuevo Vehículo
        </button>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Total flota", val: vehiculos.filter(v => v.activo).length, color: "text-slate-900", bg: "bg-white" },
          { label: "Disponibles", val: vehiculos.filter(v => v.activo && v.estado === "disponible").length, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "En servicio", val: vehiculos.filter(v => v.activo && v.estado === "en_servicio").length, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Mantenimiento", val: vehiculos.filter(v => v.activo && v.estado === "mantenimiento").length, color: "text-amber-600", bg: "bg-amber-50" },
        ].map((k) => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-4 sm:p-5 border border-gray-100 shadow-sm`}>
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400">{k.label}</p>
            <p className={`text-2xl sm:text-4xl font-black italic tracking-tighter mt-1 ${k.color}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* MENSAJES */}
      {msg && <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 text-sm font-bold rounded-r-xl">{msg}</div>}
      {err && <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-bold rounded-r-xl">{err}</div>}

      {/* FILTROS */}
      <div className="flex flex-wrap gap-3 items-center bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por placa, modelo o conductor..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-bold outline-none focus:border-[#E31E24] transition-all" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["todos", ...ESTADO_OPTIONS].map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === e ? "bg-[#E31E24] text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {e === "todos" ? "Todos" : e.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden border-b-8 border-b-[#E31E24]">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin text-[#E31E24]" size={36} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Bus size={48} className="text-slate-200" />
            <p className="text-sm font-black uppercase text-slate-300 italic tracking-tighter">Sin vehículos registrados</p>
          </div>
        ) : (
          <>
          {/* MÓVIL: tarjetas */}
          <div className="lg:hidden divide-y divide-slate-100">
            {filtered.map((v) => (
              <div key={v.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {v.imagen_url ? (
                      <img src={v.imagen_url} alt={v.placa} className="w-11 h-11 rounded-xl object-cover border border-slate-100 shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                        <Car size={20} className="text-slate-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{v.placa}</p>
                      <p className="text-[11px] text-slate-400 truncate">{v.modelo || v.tipo} · {v.capacidad} pax</p>
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase border ${ESTADO_BADGE[v.estado] || ESTADO_BADGE.inactivo}`}>
                    {v.estado.replace("_", " ")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Users size={13} className="text-slate-400 shrink-0" />
                  {v.conductor_nombre ? <span className="truncate">{v.conductor_nombre}</span> : <span className="italic text-slate-300">Sin conductor asignado</span>}
                </div>
                {(v.dias_servicio || []).length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {(v.dias_servicio || []).map(d => (
                      <span key={d} className="text-[9px] font-black bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{DIAS_LABEL[d]}</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => openEdit(v)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-black uppercase text-blue-600 bg-blue-50 rounded-lg">
                    <Edit3 size={14} /> Editar
                  </button>
                  <button onClick={() => handleDelete(v)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-black uppercase text-red-500 bg-red-50 rounded-lg">
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* ESCRITORIO: tabla */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-[920px] w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100">
                  {["Vehículo", "Tipo / Capacidad", "Conductor", "Días servicio", "Estado", "Acciones"].map(h => (
                    <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {v.imagen_url ? (
                          <img src={v.imagen_url} alt={v.placa} className="w-10 h-10 rounded-xl object-cover border border-slate-100" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                            <Car size={20} className="text-slate-400" />
                          </div>
                        )}
                        <div>
                          <p className="font-black text-slate-900 italic tracking-tighter uppercase text-sm">{v.placa}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{v.modelo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-black text-slate-600 uppercase">{v.tipo}</span>
                      <span className="ml-2 bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-black">{v.capacidad} pax</span>
                    </td>
                    <td className="px-6 py-4">
                      {v.conductor_nombre ? (
                        <div className="flex items-center gap-2">
                          {v.conductor_imagen_url ? (
                            <img src={v.conductor_imagen_url} alt={v.conductor_nombre} className="w-7 h-7 rounded-lg object-cover border border-slate-200" />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-[#E31E24]/10 flex items-center justify-center">
                              <Users size={12} className="text-[#E31E24]" />
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-black text-slate-700">{v.conductor_nombre}</p>
                            <p className="text-[10px] text-slate-400">{v.conductor_email}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-300 italic">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {(v.dias_servicio || []).map(d => (
                          <span key={d} className="text-[9px] font-black bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{DIAS_LABEL[d]}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase border ${ESTADO_BADGE[v.estado] || ESTADO_BADGE.inactivo}`}>
                        {ESTADO_ICON[v.estado]}
                        {v.estado.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(v)} className="p-2.5 text-blue-500 hover:bg-blue-50 rounded-xl transition-all" title="Editar">
                          <Edit3 size={16} />
                        </button>
                        <button onClick={() => handleDelete(v)} className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all" title="Eliminar">
                          <Trash2 size={16} />
                        </button>
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

      {/* MODAL CREAR / EDITAR */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0f1a]/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-[2.5rem] bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 my-4">
            <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-[#E31E24] p-2 rounded-xl"><Bus size={20} /></div>
                <h2 className="text-lg font-black italic tracking-tighter uppercase">
                  {editingId ? "Editar Vehículo" : "Registrar Nuevo Vehículo"}
                </h2>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-7 grid gap-5 max-h-[75vh] overflow-y-auto">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Placa *</label>
                  <input value={form.placa} onChange={e => setForm(p => ({ ...p, placa: e.target.value.toUpperCase() }))} className={INPUT_CLS} placeholder="ABC-1234" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Modelo *</label>
                  <input value={form.modelo} onChange={e => setForm(p => ({ ...p, modelo: e.target.value }))} className={INPUT_CLS} placeholder="Toyota Hiace 2022" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} className={INPUT_CLS}>
                    {TIPO_OPTIONS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Capacidad (pasajeros) *</label>
                  <input type="number" min="1" value={form.capacidad} onChange={e => setForm(p => ({ ...p, capacidad: e.target.value }))} className={INPUT_CLS} placeholder="12" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Color</label>
                  <input value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className={INPUT_CLS} placeholder="Blanco" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))} className={INPUT_CLS}>
                    {ESTADO_OPTIONS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </div>
              </div>

              {/* Conductor */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Conductor asignado</label>
                <select value={form.conductor_id} onChange={e => setForm(p => ({ ...p, conductor_id: e.target.value }))} className={INPUT_CLS}>
                  <option value="">Sin asignar</option>
                  {conductores.map(c => <option key={c.id} value={c.id}>{c.nombre} — {c.email}</option>)}
                </select>
              </div>

              {/* Imagen */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Imagen del vehículo</label>
                <div className="relative rounded-2xl border-2 border-dashed border-slate-200 p-5 text-center hover:border-[#E31E24] transition-all cursor-pointer bg-slate-50">
                  <input type="file" accept="image/*" onChange={e => handleImgUpload(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <UploadCloud className="mx-auto text-slate-300 mb-2" size={28} />
                  <p className="text-xs font-bold text-slate-400">Haz clic para cargar foto</p>
                  {uploadingImg && <Loader2 className="animate-spin mx-auto mt-2 text-[#E31E24]" size={18} />}
                  {form.imagen_url && <img src={form.imagen_url} alt="preview" className="mt-3 h-28 w-full object-cover rounded-xl" />}
                </div>
              </div>

              {/* Días de servicio */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Días de servicio</label>
                <div className="flex gap-2 flex-wrap">
                  {DIAS_LABEL.map((label, i) => (
                    <button key={i} type="button" onClick={() => toggleDia(i)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${form.dias_servicio.includes(i) ? "bg-[#E31E24] text-white shadow-sm" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descripción */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Descripción / Notas</label>
                <textarea value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} rows={2} className={INPUT_CLS + " resize-none"} placeholder="Observaciones del vehículo..." />
              </div>

              {err && <p className="text-red-600 text-sm font-bold">{err}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-3 rounded-2xl border-2 border-slate-100 text-slate-500 font-black text-xs uppercase tracking-widest hover:border-slate-300 transition-all">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 py-3 rounded-2xl bg-[#E31E24] text-white font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-red-200">
                  {editingId ? "Guardar Cambios" : "Registrar Vehículo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
