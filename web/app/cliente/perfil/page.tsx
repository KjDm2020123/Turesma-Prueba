"use client";

import { useEffect, useState } from "react";
import {
  User, Mail, Phone, Lock, Camera, Loader2, Save,
  CheckCircle2, ShieldCheck, IdCard, Upload, Clock, XCircle,
} from "lucide-react";
import { getAuthHeaders, getStoredToken, getStoredUser, setStoredUser, handleUnauthorized } from "../../../lib/session";
import { useClienteGuard } from "../../../lib/use-cliente-guard";
import { useAutoRefresh } from "../../../lib/use-auto-refresh";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Perfil = { id: number; nombre: string; email: string; rol: string; telefono?: string | null; imagen_url?: string | null };
type Verif = { estado_verificacion: string; cedula: string | null; cedula_url: string | null; notas_verificacion: string | null };

const INPUT = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 disabled:bg-slate-50 disabled:text-slate-400";

const ESTADO = {
  verificado: { label: "Verificado", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  pendiente: { label: "En revisión", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  rechazado: { label: "Rechazado", cls: "bg-red-100 text-red-600 border-red-200" },
  no_verificado: { label: "Sin verificar", cls: "bg-slate-100 text-slate-500 border-slate-200" },
} as const;

export default function ClientePerfilPage() {
  const { checkingSession } = useClienteGuard();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  // Verificación de identidad
  const [verif, setVerif] = useState<Verif | null>(null);
  const [cedula, setCedula] = useState("");
  const [cedulaUrl, setCedulaUrl] = useState<string | null>(null);
  const [subiendoCedula, setSubiendoCedula] = useState(false);
  const [enviandoVerif, setEnviandoVerif] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/me`, { headers: getAuthHeaders() });
      if (handleUnauthorized(res.status)) return;
      if (res.ok) {
        const u: Perfil = (await res.json()).user;
        setPerfil(u); setNombre(u.nombre || ""); setTelefono(u.telefono || ""); setImagenUrl(u.imagen_url || null);
      }
      const vres = await fetch(`${API}/api/usuarios/verificacion`, { headers: getAuthHeaders() });
      if (vres.ok) {
        const vd: Verif = await vres.json();
        setVerif(vd); setCedula(vd.cedula || ""); setCedulaUrl(vd.cedula_url || null);
      }
    } catch { /* silencio */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (checkingSession) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingSession]);

  // Refresco silencioso: solo actualiza el estado de verificación (no toca los
  // campos que el usuario podría estar editando), para reflejar en vivo cuando
  // el administrador aprueba o rechaza sin recargar la página.
  useAutoRefresh(() => {
    fetch(`${API}/api/usuarios/verificacion`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((vd) => { if (vd) setVerif(vd); })
      .catch(() => {});
  }, { enabled: !checkingSession, immediate: false });

  const handlePhoto = async (file: File | null) => {
    if (!file) return;
    setUploading(true); setErr("");
    try {
      const fd = new FormData(); fd.append("imagen", file);
      const res = await fetch(`${API}/api/auth/upload-perfil`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al subir la foto");
      setImagenUrl(data.imageUrl);
    } catch (e: any) { setErr(e.message); }
    finally { setUploading(false); }
  };

  const handleSave = async () => {
    setErr(""); setMsg("");
    if (password && password !== password2) { setErr("Las contraseñas no coinciden"); return; }
    if (password && password.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { nombre, telefono, imagen_url: imagenUrl };
      if (password) body.password = password;
      const res = await fetch(`${API}/api/auth/me`, { method: "PUT", headers: getAuthHeaders(), body: JSON.stringify(body) });
      if (handleUnauthorized(res.status)) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar");
      setMsg("Perfil actualizado correctamente");
      setPassword(""); setPassword2("");
      const stored = getStoredUser();
      if (stored) setStoredUser({ ...stored, nombre: data.user.nombre, imagen_url: data.user.imagen_url });
      setPerfil(data.user);
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const subirCedula = async (file: File | null) => {
    if (!file) return;
    setSubiendoCedula(true); setErr("");
    try {
      const token = getStoredToken();
      const fd = new FormData(); fd.append("cedula", file);
      const res = await fetch(`${API}/api/usuarios/uploads/cedula`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al subir la cédula");
      setCedulaUrl(data.imageUrl);
    } catch (e: any) { setErr(e.message); }
    finally { setSubiendoCedula(false); }
  };

  const enviarVerif = async () => {
    setErr(""); setMsg("");
    if (!/^\d{10}$/.test(cedula.trim())) { setErr("La cédula debe tener 10 dígitos"); return; }
    if (!cedulaUrl) { setErr("Sube la foto de tu cédula"); return; }
    setEnviandoVerif(true);
    try {
      const res = await fetch(`${API}/api/usuarios/verificacion`, {
        method: "POST", headers: getAuthHeaders(),
        body: JSON.stringify({ cedula: cedula.trim(), cedula_url: cedulaUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo enviar");
      setMsg(data.message || "Documento enviado para verificación");
      setVerif({ estado_verificacion: "pendiente", cedula: cedula.trim(), cedula_url: cedulaUrl, notas_verificacion: null });
    } catch (e: any) { setErr(e.message); }
    finally { setEnviandoVerif(false); }
  };

  if (checkingSession || loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#E31E24]" size={34} /></div>;

  const estado = (verif?.estado_verificacion || "no_verificado") as keyof typeof ESTADO;
  const estadoInfo = ESTADO[estado] || ESTADO.no_verificado;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* CABECERA */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
        <div className="relative shrink-0">
          {imagenUrl ? (
            <img src={imagenUrl} alt="perfil" className="w-24 h-24 rounded-2xl object-cover border border-slate-200" />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-slate-100 flex items-center justify-center"><User size={38} className="text-slate-300" /></div>
          )}
          <label className="absolute -bottom-2 -right-2 bg-[#E31E24] hover:bg-[#b3141a] p-2.5 rounded-xl cursor-pointer shadow-md transition-all text-white">
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
            <input type="file" accept="image/*" className="hidden" onChange={e => handlePhoto(e.target.files?.[0] || null)} disabled={uploading} />
          </label>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Cliente</p>
          <h1 className="text-2xl font-black text-slate-900 truncate">{perfil?.nombre}</h1>
          <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5 justify-center sm:justify-start"><Mail size={13} /> {perfil?.email}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full border ${estadoInfo.cls}`}>
          <ShieldCheck size={13} /> {estadoInfo.label}
        </span>
      </div>

      {msg && <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 text-sm font-medium rounded-r-lg flex items-center gap-2"><CheckCircle2 size={16} />{msg}</div>}
      {err && <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-medium rounded-r-lg flex items-center gap-2"><XCircle size={16} />{err}</div>}

      {/* VERIFICACIÓN DE IDENTIDAD */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><IdCard size={16} className="text-[#E31E24]" /> Verificación de identidad</h2>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${estadoInfo.cls}`}>{estadoInfo.label}</span>
        </div>

        {estado === "verificado" ? (
          <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-4 text-emerald-700">
            <CheckCircle2 size={22} className="shrink-0" />
            <p className="text-sm font-medium">Tu identidad está verificada. Ya puedes solicitar y confirmar tus servicios sin restricciones.</p>
          </div>
        ) : estado === "pendiente" ? (
          <div className="flex items-center gap-3 bg-amber-50 rounded-xl p-4 text-amber-700">
            <Clock size={22} className="shrink-0" />
            <p className="text-sm font-medium">Tu documento está en revisión. Te avisaremos cuando el administrador confirme tu identidad.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500">Para solicitar servicios necesitas verificar tu identidad. Ingresa tu cédula y sube una foto clara de la misma.</p>
            {estado === "rechazado" && verif?.notas_verificacion && (
              <div className="flex items-start gap-2 bg-red-50 rounded-lg p-3 text-red-600 text-xs font-medium">
                <XCircle size={16} className="shrink-0 mt-0.5" /> Rechazado: {verif.notas_verificacion}. Vuelve a intentarlo.
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Número de cédula</label>
              <div className="relative"><IdCard size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input value={cedula} onChange={e => setCedula(e.target.value.replace(/\D/g, "").slice(0, 10))} className={INPUT + " pl-9"} placeholder="10 dígitos" inputMode="numeric" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Foto de la cédula</label>
              {cedulaUrl ? (
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-emerald-200">
                  <img src={cedulaUrl} alt="cédula" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setCedulaUrl(null)} className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600"><XCircle size={16} /></button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <div className="w-full h-32 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:border-[#E31E24] transition-all flex flex-col items-center justify-center gap-2">
                    {subiendoCedula ? <><Loader2 size={22} className="text-[#E31E24] animate-spin" /><span className="text-xs text-slate-500 font-medium">Subiendo...</span></>
                      : <><Upload size={22} className="text-slate-400" /><span className="text-xs text-slate-500 font-medium">Selecciona una foto de tu cédula</span></>}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={e => subirCedula(e.target.files?.[0] || null)} disabled={subiendoCedula} />
                </label>
              )}
            </div>
            <button onClick={enviarVerif} disabled={enviandoVerif} className="w-full py-3 bg-[#E31E24] hover:bg-[#b3141a] text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60">
              {enviandoVerif ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Enviar para verificación
            </button>
          </>
        )}
      </div>

      {/* DATOS PERSONALES (incluye cambio de contraseña) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><User size={16} className="text-[#E31E24]" /> Datos personales</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-500">Nombre</label>
            <div className="relative"><User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" /><input value={nombre} onChange={e => setNombre(e.target.value)} className={INPUT + " pl-9"} /></div></div>
          <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-500">Teléfono</label>
            <div className="relative"><Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" /><input value={telefono} onChange={e => setTelefono(e.target.value)} className={INPUT + " pl-9"} placeholder="099 123 4567" /></div></div>
          <div className="space-y-1.5 sm:col-span-2"><label className="text-xs font-semibold text-slate-500">Correo (no editable)</label>
            <div className="relative"><Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" /><input value={perfil?.email || ""} disabled className={INPUT + " pl-9"} /></div></div>
        </div>

        {/* Cambio de contraseña (opcional) */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center gap-2">
            <Lock size={15} className="text-[#E31E24]" />
            <h3 className="text-xs font-bold text-slate-700">Cambiar contraseña</h3>
            <span className="text-[11px] text-slate-400">(opcional — déjalo en blanco si no la cambias)</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={INPUT} placeholder="Nueva contraseña" />
            <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} className={INPUT} placeholder="Confirmar" />
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="w-full py-3.5 bg-[#E31E24] hover:bg-[#b3141a] text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}{saving ? "Guardando..." : "Guardar cambios"}
      </button>
    </div>
  );
}
