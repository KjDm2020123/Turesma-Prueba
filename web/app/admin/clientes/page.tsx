"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "../../../lib/use-admin-guard";
import { getAuthHeaders } from "../../../lib/session";
import { useAutoRefresh } from "../../../lib/use-auto-refresh";
import { WhatsAppButton } from "../../../components/whatsapp-button";
import { useConfirm } from "../../../components/confirm-dialog";
import {
  Users, Plus, X, Search, Loader2, RefreshCw, Trash2,
  Edit3, Eye, ShoppingCart, DollarSign, Key, Printer, FileText,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Cliente = {
  id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  imagen_url?: string | null;
  activo: boolean;
  creado_en: string;
  total_reservas?: number;
  total_gastado?: number;
};

type ReservaCliente = {
  id: number; origen?: string | null; destino?: string | null;
  fecha_reserva?: string | null; num_personas?: number; total?: number;
  estado?: string; vehiculo_placa?: string | null; conductor_nombre?: string | null;
};

const INPUT = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition-all focus:border-[#E31E24] focus:bg-white placeholder:font-normal";

const EMPTY: Partial<Cliente> = { nombre: "", email: "", telefono: "" };

export default function AdminClientesPage() {
  const { checkingSession } = useAdminGuard();
  const confirmar = useConfirm();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [detalle, setDetalle] = useState<Cliente | null>(null);
  const [detalleReservas, setDetalleReservas] = useState<ReservaCliente[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [showPassInput, setShowPassInput] = useState(false);
  const [form, setForm] = useState<Partial<Cliente>>(EMPTY);
  const [formPass, setFormPass] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const h = getAuthHeaders();

  const openDetalle = async (c: Cliente) => {
    setDetalle(c); setDetalleReservas([]); setShowPassInput(false); setNewPass("");
    setLoadingDetalle(true);
    try {
      const res = await fetch(`${API}/api/admin/reservas?usuario_id=${c.id}`, { headers: getAuthHeaders() });
      const data = res.ok ? await res.json() : [];
      const arr = Array.isArray(data) ? data : (data?.data ?? []);
      setDetalleReservas(arr.filter((r: any) => r.usuario_id === c.id));
    } catch { /* silencio */ }
    finally { setLoadingDetalle(false); }
  };

  const cambiarPassword = async () => {
    if (!detalle || newPass.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres"); return; }
    setSaving(true); setErr(""); setMsg("");
    try {
      const res = await fetch(`${API}/api/admin/usuarios/${detalle.id}/recuperar-password`, {
        method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ nueva_password: newPass }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      setMsg(`Contraseña de ${detalle.nombre} actualizada`);
      setShowPassInput(false); setNewPass("");
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const verFactura = (c: Cliente, r: ReservaCliente) => {
    const w = window.open("", "_blank", "width=760,height=900");
    if (!w) return;
    const fecha = r.fecha_reserva ? new Date(r.fecha_reserva).toLocaleDateString("es-EC") : "—";
    const total = Number(r.total || 0).toFixed(2);
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Factura #${r.id} - Turesma</title>
      <style>
        *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
        body{margin:0;padding:40px;color:#1a1a1a}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #E31E24;padding-bottom:20px}
        .logo{font-size:30px;font-weight:900;font-style:italic;color:#E31E24;letter-spacing:-1px}
        .sub{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:2px}
        .doc{text-align:right} .doc h2{margin:0;font-size:24px} .doc p{margin:2px 0;font-size:12px;color:#666}
        .grid{display:flex;gap:20px;margin-top:24px}
        .box{flex:1;background:#f6f7f9;border-radius:12px;padding:16px}
        .box .t{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:6px}
        table{width:100%;border-collapse:collapse;margin-top:24px}
        th{background:#0b0f1a;color:#fff;text-align:left;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:1px}
        td{padding:12px;border-bottom:1px solid #eee;font-size:13px}
        .total{margin-top:24px;text-align:right} .total .amt{font-size:30px;font-weight:900;color:#E31E24}
        .ft{margin-top:40px;text-align:center;font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:2px}
        .badge{display:inline-block;background:#16a34a;color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase}
        @media print{.noprint{display:none}}
      </style></head><body>
      <div class="head">
        <div><div class="logo">TURESMA <span style="font-size:12px">S.A</span></div><div class="sub">Transporte Turístico</div></div>
        <div class="doc"><h2>FACTURA</h2><p>No. ${String(r.id).padStart(6, "0")}</p><p>Fecha emisión: ${new Date().toLocaleDateString("es-EC")}</p></div>
      </div>
      <div class="grid">
        <div class="box"><div class="t">Cliente</div><b>${c.nombre}</b><br>${c.email}<br>${c.telefono || ""}</div>
        <div class="box"><div class="t">Servicio</div>Fecha del viaje: <b>${fecha}</b><br>Estado: <span class="badge">${r.estado || "—"}</span></div>
      </div>
      <table>
        <thead><tr><th>Descripción</th><th>Ruta</th><th>Pasajeros</th><th>Vehículo</th><th style="text-align:right">Valor</th></tr></thead>
        <tbody><tr>
          <td>Servicio de transporte turístico</td>
          <td>${r.origen || "—"} → ${r.destino || "—"}</td>
          <td>${r.num_personas || 1}</td>
          <td>${r.vehiculo_placa || "—"}</td>
          <td style="text-align:right">$${total}</td>
        </tr></tbody>
      </table>
      <div class="total"><div class="t" style="font-size:11px;color:#999">Total a pagar</div><div class="amt">$${total}</div></div>
      <div class="ft">Gracias por confiar en Turesma S.A. · Documento generado electrónicamente</div>
      <div class="noprint" style="text-align:center;margin-top:30px"><button onclick="window.print()" style="background:#E31E24;color:#fff;border:none;padding:12px 30px;border-radius:10px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:1px">Imprimir / Guardar PDF</button></div>
      </body></html>`);
    w.document.close();
  };

  const load = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      // Cargamos usuarios con rol cliente
      const res = await fetch(`${API}/api/admin/usuarios?rol=cliente`, { headers: h });
      const raw: any[] = res.ok ? await res.json() : [];
      // Para cada cliente, intentamos obtener sus reservas
      const clientesConStats = await Promise.all(
        raw
          .filter((u) => u.rol === "cliente")
          .map(async (u) => {
            try {
              const rRes = await fetch(`${API}/api/admin/reservas?usuario_id=${u.id}`, { headers: h });
              const reservas: any[] = rRes.ok ? await rRes.json() : [];
              const arr = Array.isArray(reservas) ? reservas : (reservas as any).data ?? [];
              return {
                ...u,
                total_reservas: arr.length,
                total_gastado: arr
                  .filter((r: any) => r.estado !== "cancelada")
                  .reduce((s: number, r: any) => s + Number(r.total || 0), 0),
              };
            } catch {
              return { ...u, total_reservas: 0, total_gastado: 0 };
            }
          })
      );
      setClientes(clientesConStats);
    } catch {
      setErr("Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!checkingSession) load(); }, [checkingSession]);

  useAutoRefresh(() => load(true), { enabled: !checkingSession, immediate: false });

  const openNew = () => { setForm(EMPTY); setFormPass(""); setEditId(null); setModal(true); };
  const openEdit = (c: Cliente) => {
    setForm({ nombre: c.nombre, email: c.email, telefono: c.telefono ?? "" });
    setFormPass("");
    setEditId(c.id);
    setModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setMsg("");

    // La contraseña es obligatoria al crear (el cliente la usará para ingresar).
    // Al editar, solo se cambia si el admin escribe una nueva.
    if (!editId && (!formPass || formPass.length < 6)) {
      setErr("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (editId && formPass && formPass.length < 6) {
      setErr("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...form, rol: "cliente" };
      if (!editId || formPass) body.password = formPass;
      const url = editId ? `${API}/api/admin/usuarios/${editId}` : `${API}/api/admin/usuarios`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: h, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error al guardar");
      setMsg(editId
        ? "Cliente actualizado"
        : `Cliente creado. Ingresa con el correo ${form.email} y la contraseña asignada.`);
      setModal(false);
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmar({ title: "Eliminar cliente", message: "¿Eliminar este cliente?", confirmText: "Eliminar", tone: "danger" }))) return;
    try {
      const res = await fetch(`${API}/api/admin/usuarios/${id}`, { method: "DELETE", headers: h });
      if (!res.ok) throw new Error("Error al eliminar");
      setMsg("Cliente eliminado");
      load();
    } catch (e: any) { setErr(e.message); }
  };

  if (checkingSession) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#E31E24]" size={32} /></div>;

  const filtrados = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalGastado = clientes.reduce((s, c) => s + (c.total_gastado ?? 0), 0);
  const totalReservas = clientes.reduce((s, c) => s + (c.total_reservas ?? 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex justify-end">
        <button onClick={openNew} className="flex items-center gap-2 bg-[#E31E24] hover:bg-[#c0181e] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-red-600/30">
          <Plus size={14} /> Nuevo Cliente
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest">Total Clientes</p>
          <p className="text-3xl sm:text-4xl font-black text-blue-700 mt-1">{clientes.length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase text-amber-400 tracking-widest">Total Reservas</p>
          <p className="text-3xl sm:text-4xl font-black text-amber-700 mt-1">{totalReservas}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Total Facturado</p>
          <p className="text-3xl font-black text-emerald-700 mt-1">
            ${totalGastado.toLocaleString("es-EC", { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {msg && <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 text-sm font-bold rounded-r-xl">{msg}</div>}
      {err && <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-bold rounded-r-xl">{err}</div>}

      {/* BÚSQUEDA */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3">
        <Search size={16} className="text-slate-400" />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o email…"
          className="flex-1 text-sm font-bold outline-none text-slate-700 bg-transparent placeholder:font-normal placeholder:text-slate-400"
        />
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden border-b-8 border-b-[#E31E24]">
        {loading ? (
          <div className="flex items-center justify-center h-56"><Loader2 className="animate-spin text-[#E31E24]" size={32} /></div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 gap-3">
            <Users size={42} className="text-slate-200" />
            <p className="text-sm font-black uppercase text-slate-300 italic">Sin clientes registrados</p>
          </div>
        ) : (
          <>
          {/* MÓVIL: tarjetas */}
          <div className="lg:hidden divide-y divide-slate-100">
            {filtrados.map((c) => (
              <div key={c.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {c.imagen_url ? (
                      <img src={c.imagen_url} alt={c.nombre} className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-[#E31E24] flex items-center justify-center text-white font-black text-sm shrink-0">
                        {c.nombre.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{c.nombre}</p>
                      <p className="text-[11px] text-slate-400 truncate">{c.email}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black border ${c.activo ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                    {c.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5"><ShoppingCart size={13} className="text-blue-500" /> {c.total_reservas ?? 0} reservas</span>
                  <span className="flex items-center gap-1.5"><DollarSign size={13} className="text-emerald-500" /> ${(c.total_gastado ?? 0).toLocaleString("es-EC", { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex gap-2 pt-1 items-center">
                  <WhatsAppButton telefono={c.telefono} title={`WhatsApp de ${c.nombre}`} mensaje={`Hola ${c.nombre}, le saludamos de Turesma S.A.`} />
                  <button onClick={() => openDetalle(c)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-black uppercase text-blue-600 bg-blue-50 rounded-lg"><Eye size={14} /> Ver</button>
                  <button onClick={() => openEdit(c)} className="p-2 rounded-lg bg-slate-100 text-slate-600" aria-label="Editar"><Edit3 size={16} /></button>
                  <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg bg-red-50 text-red-500" aria-label="Eliminar"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
          {/* ESCRITORIO: tabla */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-[700px] w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Cliente", "Email", "Reservas", "Facturado", "Estado", "Acciones"].map((h) => (
                    <th key={h} className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtrados.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {c.imagen_url ? (
                          <img src={c.imagen_url} alt={c.nombre} className="w-9 h-9 rounded-xl object-cover border border-slate-200" />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-[#E31E24] flex items-center justify-center text-white font-black text-sm">
                            {c.nombre.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-black text-slate-800 text-sm">{c.nombre}</p>
                          <p className="text-[10px] text-slate-400">Registrado: {new Date(c.creado_en).toLocaleDateString("es-EC")}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{c.email}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <ShoppingCart size={13} className="text-blue-500" />
                        <span className="font-black text-slate-700">{c.total_reservas ?? 0}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <DollarSign size={13} className="text-emerald-500" />
                        <span className="font-black text-slate-700">
                          ${(c.total_gastado ?? 0).toLocaleString("es-EC", { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black border ${c.activo ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                        {c.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <WhatsAppButton telefono={c.telefono} title={`WhatsApp de ${c.nombre}`} mensaje={`Hola ${c.nombre}, le saludamos de Turesma S.A.`} />
                        <button onClick={() => openDetalle(c)} className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => openEdit(c)} className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
                          <Trash2 size={14} />
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
      {modal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 border-b-8 border-[#E31E24]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black uppercase italic tracking-tight">{editId ? "Editar Cliente" : "Nuevo Cliente"}</h3>
              <button onClick={() => setModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Nombre completo</label>
                <input className={INPUT} required value={form.nombre ?? ""} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. María García" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Email</label>
                <input className={INPUT} type="email" required value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Teléfono (opcional)</label>
                <input className={INPUT} value={form.telefono ?? ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="0999999999" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  {editId ? "Nueva contraseña (opcional)" : "Contraseña"}
                </label>
                <input
                  className={INPUT}
                  type="password"
                  required={!editId}
                  value={formPass}
                  onChange={(e) => setFormPass(e.target.value)}
                  placeholder={editId ? "Dejar en blanco para no cambiarla" : "Mínimo 6 caracteres"}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  {editId
                    ? "Solo se cambia si escribes una nueva. Recuerda avisarle al cliente."
                    : "El cliente ingresará con su correo y esta contraseña. Compártesela."}
                </p>
              </div>
              {err && <p className="text-red-600 text-xs font-bold">{err}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-sm font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-[#E31E24] text-white text-sm font-black uppercase tracking-wide hover:bg-[#c0181e] disabled:opacity-60 transition-all shadow-lg shadow-red-600/20">
                  {saving ? "Guardando…" : editId ? "Actualizar" : "Crear Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALLE */}
      {detalle && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 border-b-8 border-blue-500 my-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-black uppercase italic tracking-tight">Detalle Cliente</h3>
              <button onClick={() => setDetalle(null)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="flex items-center gap-4 mb-5">
              {detalle.imagen_url ? (
                <img src={detalle.imagen_url} alt={detalle.nombre} className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-200" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-[#E31E24] flex items-center justify-center text-white font-black text-2xl">{detalle.nombre.slice(0, 2).toUpperCase()}</div>
              )}
              <div className="min-w-0">
                <p className="font-black text-lg text-slate-800 truncate">{detalle.nombre}</p>
                <p className="text-sm text-slate-500 truncate">{detalle.email}</p>
                {detalle.telefono && <p className="text-xs text-slate-400">{detalle.telefono}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-amber-700">{detalle.total_reservas ?? 0}</p>
                <p className="text-[10px] font-black uppercase text-amber-400 mt-1">Reservas</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-emerald-700">${(detalle.total_gastado ?? 0).toLocaleString()}</p>
                <p className="text-[10px] font-black uppercase text-emerald-400 mt-1">Facturado</p>
              </div>
            </div>

            {/* CAMBIAR CONTRASEÑA */}
            <div className="bg-slate-50 rounded-2xl p-4 mb-5">
              {!showPassInput ? (
                <button onClick={() => { setShowPassInput(true); setErr(""); }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white border-2 border-amber-200 text-amber-600 text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 transition-all">
                  <Key size={13} /> Cambiar contraseña del cliente
                </button>
              ) : (
                <div className="flex gap-2 items-center">
                  <input type="text" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Nueva contraseña (mín. 6)" className="flex-1 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[#E31E24]" />
                  <button onClick={cambiarPassword} disabled={saving} className="px-4 py-2 rounded-xl bg-amber-500 text-white text-[10px] font-black uppercase disabled:opacity-60">Guardar</button>
                  <button onClick={() => setShowPassInput(false)} className="px-3 py-2 rounded-xl bg-slate-200 text-slate-500 text-[10px] font-black uppercase">X</button>
                </div>
              )}
            </div>

            {/* RESERVAS REALES CON # Y FACTURA */}
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1"><FileText size={12} /> Reservas del cliente</p>
            {loadingDetalle ? (
              <div className="flex justify-center py-6"><Loader2 className="animate-spin text-[#E31E24]" size={24} /></div>
            ) : detalleReservas.length === 0 ? (
              <p className="text-center text-xs text-slate-300 font-black uppercase italic py-6">Sin reservas registradas</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {detalleReservas.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800">Reserva #{String(r.id).padStart(6, "0")}</p>
                      <p className="text-[10px] text-slate-400 truncate">{r.origen || "—"} → {r.destino || "—"} · {r.fecha_reserva ? new Date(r.fecha_reserva).toLocaleDateString("es-EC") : "—"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-black text-emerald-600">${Number(r.total || 0).toFixed(0)}</span>
                      <button onClick={() => verFactura(detalle, r)} className="p-2 rounded-lg bg-[#0b0f1a] text-white hover:bg-slate-700 transition-colors" title="Ver factura">
                        <Printer size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400 text-center mt-4">Registrado: {new Date(detalle.creado_en).toLocaleDateString("es-EC")}</p>
          </div>
        </div>
      )}

    </div>
  );
}
