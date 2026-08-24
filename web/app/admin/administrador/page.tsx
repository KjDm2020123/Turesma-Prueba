"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "../../../lib/use-admin-guard";
import { getAuthHeaders, getStoredUser } from "../../../lib/session";
import { useAutoRefresh } from "../../../lib/use-auto-refresh";
import { useConfirm } from "../../../components/confirm-dialog";
import {
  ShieldCheck, User, Save, Loader2, RefreshCw,
  Plus, Trash2, Edit3, X, UserPlus, Key,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type AdminUser = {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  telefono?: string | null;
  activo: boolean;
  creado_en: string;
};

const INPUT = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition-all focus:border-[#E31E24] focus:bg-white placeholder:font-normal";

export default function AdminAdministradorPage() {
  const { checkingSession } = useAdminGuard();
  const confirmar = useConfirm();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [passModal, setPassModal] = useState<number | null>(null);
  const [newPass, setNewPass] = useState("");
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "", password: "" });
  const currentUser = getStoredUser();
  const h = getAuthHeaders();

  const load = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/usuarios`, { headers: h });
      const raw: any[] = res.ok ? await res.json() : [];
      setAdmins(raw.filter((u) => u.rol === "admin"));
    } catch { setErr("Error al cargar administradores"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (!checkingSession) load(); }, [checkingSession]);

  useAutoRefresh(() => load(true), { enabled: !checkingSession, immediate: false });

  const openNew = () => {
    setForm({ nombre: "", email: "", telefono: "", password: "" });
    setEditId(null);
    setModal(true);
  };

  const openEdit = (a: AdminUser) => {
    setForm({ nombre: a.nombre, email: a.email, telefono: a.telefono || "", password: "" });
    setEditId(a.id);
    setModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setErr(""); setMsg("");
    try {
      const body: any = { nombre: form.nombre, email: form.email, telefono: form.telefono, rol: "admin" };
      if (!editId) body.password = form.password || form.email + "Admin123";
      const url = editId ? `${API}/api/admin/usuarios/${editId}` : `${API}/api/admin/usuarios`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: h, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error al guardar");
      setMsg(editId ? "Administrador actualizado" : "Administrador creado correctamente");
      setModal(false);
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (id === currentUser?.id) { setErr("No puedes eliminarte a ti mismo"); return; }
    if (!(await confirmar({ title: "Eliminar administrador", message: "¿Eliminar este administrador?", confirmText: "Eliminar", tone: "danger" }))) return;
    try {
      const res = await fetch(`${API}/api/admin/usuarios/${id}`, { method: "DELETE", headers: h });
      if (!res.ok) throw new Error("Error al eliminar");
      setMsg("Administrador eliminado");
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const handleResetPass = async () => {
    if (!passModal || !newPass) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/usuarios/${passModal}/recuperar-password`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ nueva_password: newPass }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      setMsg("Contraseña actualizada");
      setPassModal(null);
      setNewPass("");
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  if (checkingSession) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#E31E24]" size={32} /></div>;

  const ROL_BADGE: Record<string, string> = {
    admin: "bg-red-100 text-red-700 border-red-200",
    operativo: "bg-blue-100 text-blue-700 border-blue-200",
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex justify-end">
        <button onClick={openNew} className="flex items-center gap-2 bg-[#E31E24] hover:bg-[#c0181e] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-red-600/30">
          <UserPlus size={14} /> Nuevo Admin
        </button>
      </div>

      {/* PERFIL ACTUAL */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex items-center gap-5">
        <div className="w-14 h-14 rounded-2xl bg-[#E31E24] flex items-center justify-center text-white font-black text-xl shadow-lg shadow-red-500/20">
          {currentUser?.nombre?.slice(0, 2).toUpperCase() ?? "AD"}
        </div>
        <div className="flex-1">
          <p className="font-black text-slate-800 text-lg">{currentUser?.nombre ?? "Administrador"}</p>
          <p className="text-sm text-slate-500">{currentUser?.email ?? "—"}</p>
          <span className="inline-flex items-center mt-1 rounded-full px-3 py-1 text-[10px] font-black border bg-red-100 text-red-700 border-red-200 uppercase tracking-widest">
            {currentUser?.rol ?? "admin"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]"></div>
          <span className="text-xs font-black text-slate-400 uppercase">En línea</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase text-red-400 tracking-widest">Administradores</p>
          <p className="text-3xl sm:text-4xl font-black text-red-700 mt-1">{admins.length}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Activos</p>
          <p className="text-3xl sm:text-4xl font-black text-emerald-700 mt-1">{admins.filter((a) => a.activo !== false).length}</p>
        </div>
      </div>

      {msg && <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 text-sm font-bold rounded-r-xl">{msg}</div>}
      {err && <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-bold rounded-r-xl">{err}</div>}

      {/* TABLA */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden border-b-8 border-b-[#E31E24]">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-[#E31E24]" size={32} /></div>
        ) : admins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <User size={42} className="text-slate-200" />
            <p className="text-sm font-black uppercase text-slate-300 italic">Sin administradores</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[600px] w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Administrador", "Email", "Rol", "Registrado", "Acciones"].map((h) => (
                    <th key={h} className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {admins.map((a) => (
                  <tr key={a.id} className={`hover:bg-slate-50 transition-colors ${a.id === currentUser?.id ? "bg-red-50/30" : ""}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#0b0f1a] flex items-center justify-center text-white font-black text-sm">
                          {a.nombre.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-slate-800 text-sm flex items-center gap-2">
                            {a.nombre}
                            {a.id === currentUser?.id && <span className="text-[9px] font-black bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full uppercase">Tú</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{a.email}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black border uppercase ${ROL_BADGE[a.rol] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {a.rol}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">{new Date(a.creado_en).toLocaleDateString("es-EC")}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(a)} className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" title="Editar">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => { setPassModal(a.id); setNewPass(""); }} className="p-2 rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors" title="Cambiar contraseña">
                          <Key size={14} />
                        </button>
                        {a.id !== currentUser?.id && (
                          <button onClick={() => handleDelete(a.id)} className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CREAR / EDITAR */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 border-b-8 border-[#E31E24]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black uppercase italic tracking-tight">{editId ? "Editar Admin" : "Nuevo Administrador"}</h3>
              <button onClick={() => setModal(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Nombre completo</label>
                <input className={INPUT} required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre del administrador" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Email</label>
                <input className={INPUT} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin@turesma.com" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Teléfono</label>
                <input className={INPUT} type="tel" required value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="099 123 4567" />
              </div>
              {!editId && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Contraseña inicial</label>
                  <input className={INPUT} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Dejar vacío para usar email+Admin123" />
                </div>
              )}
              {err && <p className="text-red-600 text-xs font-bold">{err}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-sm font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-[#E31E24] text-white text-sm font-black uppercase tracking-wide hover:bg-[#c0181e] disabled:opacity-60 shadow-lg shadow-red-600/20">
                  {saving ? "Guardando…" : editId ? "Actualizar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONTRASEÑA */}
      {passModal !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 border-b-8 border-amber-400">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black uppercase italic tracking-tight">Cambiar Contraseña</h3>
              <button onClick={() => setPassModal(null)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Nueva contraseña</label>
                <input className={INPUT} type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              {err && <p className="text-red-600 text-xs font-bold">{err}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setPassModal(null)} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-sm font-black uppercase text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleResetPass} disabled={saving || !newPass} className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-black uppercase hover:bg-amber-600 disabled:opacity-60 shadow-lg shadow-amber-500/20">
                  {saving ? "Guardando…" : "Actualizar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
