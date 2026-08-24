"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminGuard } from "../../../lib/use-admin-guard";
import { getAuthHeaders } from "../../../lib/session";
import { useConfirm } from "../../../components/confirm-dialog";
import {
  Images, Loader2, UploadCloud, Trash2, Eye, EyeOff, X, Plus, CheckCircle2,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Foto = {
  id: number;
  imagen_url: string;
  titulo: string | null;
  descripcion: string | null;
  orden: number;
  activo: boolean;
  creado_en: string;
};

export default function AdminGaleriaPage() {
  const { checkingSession } = useAdminGuard();
  const confirmar = useConfirm();
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Formulario de nueva foto
  const [imagenUrl, setImagenUrl] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const flash = (setter: (v: string) => void, value: string) => {
    setter(value);
    setTimeout(() => setter(""), 4000);
  };

  const load = async () => {
    try {
      const res = await fetch(`${API}/api/admin/galeria`, { headers: getAuthHeaders() });
      if (res.ok) setFotos(await res.json());
    } catch { /* silencio */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (!checkingSession) load(); }, [checkingSession]);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setErr(""); setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("imagen", file);
      const authToken = getAuthHeaders()["Authorization"];
      const res = await fetch(`${API}/api/admin/uploads/galeria-imagen`, {
        method: "POST",
        body: fd,
        headers: authToken ? { Authorization: authToken } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al subir la imagen");
      setImagenUrl(json.imageUrl || "");
    } catch (e: any) { flash(setErr, e.message || "No se pudo subir la imagen"); }
    finally { setSubiendo(false); }
  };

  const handleGuardar = async () => {
    if (!imagenUrl) { flash(setErr, "Primero sube una foto"); return; }
    setGuardando(true); setErr("");
    try {
      const res = await fetch(`${API}/api/admin/galeria`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ imagen_url: imagenUrl, titulo, descripcion }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");
      setFotos((p) => [json, ...p]);
      setImagenUrl(""); setTitulo(""); setDescripcion("");
      if (fileRef.current) fileRef.current.value = "";
      flash(setMsg, "Foto publicada en la página principal");
    } catch (e: any) { flash(setErr, e.message || "No se pudo guardar"); }
    finally { setGuardando(false); }
  };

  const toggleActivo = async (foto: Foto) => {
    setActingId(foto.id);
    try {
      const res = await fetch(`${API}/api/admin/galeria/${foto.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !foto.activo }),
      });
      const json = await res.json();
      if (res.ok) setFotos((p) => p.map((f) => (f.id === foto.id ? json : f)));
    } catch { /* silencio */ }
    finally { setActingId(null); }
  };

  const eliminar = async (id: number) => {
    if (!(await confirmar({ title: "Eliminar foto", message: "¿Eliminar esta foto de la galería? No se puede deshacer.", confirmText: "Eliminar", tone: "danger" }))) return;
    setActingId(id);
    try {
      const res = await fetch(`${API}/api/admin/galeria/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setFotos((p) => p.filter((f) => f.id !== id));
        flash(setMsg, "Foto eliminada");
      }
    } catch { /* silencio */ }
    finally { setActingId(null); }
  };

  if (checkingSession) return (
    <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#E31E24]" size={36} /></div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {msg && <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 text-sm font-bold rounded-r-xl flex items-center gap-2"><CheckCircle2 size={16} />{msg}</div>}
      {err && <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-bold rounded-r-xl">{err}</div>}

      {/* AYUDA */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
        <div className="bg-[#E31E24]/10 p-2 rounded-xl shrink-0"><Images size={20} className="text-[#E31E24]" /></div>
        <p className="text-sm text-slate-600 font-medium leading-relaxed">
          Las fotos que subas aquí aparecen en la página principal, justo debajo de <span className="font-black italic">&ldquo;Nuestra Flota&rdquo;</span>, en la sección de viajes realizados. Puedes ocultarlas sin borrarlas con el botón de visibilidad.
        </p>
      </div>

      {/* SUBIR NUEVA FOTO */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4">Agregar foto de viaje</p>
        <div className="grid md:grid-cols-[240px_1fr] gap-5">
          {/* Zona de subida */}
          <div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-[#E31E24] hover:bg-red-50/40 transition-all flex flex-col items-center justify-center gap-2 overflow-hidden relative"
            >
              {imagenUrl ? (
                <img src={imagenUrl} alt="Vista previa" className="absolute inset-0 w-full h-full object-cover" />
              ) : subiendo ? (
                <Loader2 className="animate-spin text-[#E31E24]" size={26} />
              ) : (
                <>
                  <UploadCloud className="text-slate-300" size={30} />
                  <span className="text-xs font-bold text-slate-400">Haz clic para cargar</span>
                  <span className="text-[10px] text-slate-300">JPG, PNG o WEBP · máx 5MB</span>
                </>
              )}
            </button>
            {imagenUrl && (
              <button type="button" onClick={() => { setImagenUrl(""); if (fileRef.current) fileRef.current.value = ""; }} className="mt-2 text-[11px] font-bold text-slate-400 hover:text-[#E31E24] transition-colors">
                Quitar imagen
              </button>
            )}
          </div>

          {/* Datos */}
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Título (opcional)</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120}
                placeholder="Ej: Tour a Los Frailes, Manabí"
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-medium outline-none focus:border-[#E31E24] transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Descripción (opcional)</label>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500} rows={3}
                placeholder="Una frase corta sobre el viaje..."
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-medium outline-none focus:border-[#E31E24] transition-all resize-none" />
            </div>
            <button
              onClick={handleGuardar}
              disabled={guardando || subiendo || !imagenUrl}
              className="flex items-center gap-2 bg-[#E31E24] hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Publicar foto
            </button>
          </div>
        </div>
      </div>

      {/* GALERÍA ACTUAL */}
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4">
          Fotos publicadas {fotos.length > 0 && <span className="text-slate-300">· {fotos.length}</span>}
        </p>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#E31E24]" size={30} /></div>
        ) : fotos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
            <Images size={40} className="text-slate-200 mx-auto mb-3" />
            <p className="font-black text-slate-300 uppercase italic text-sm">Aún no hay fotos en la galería</p>
            <p className="text-xs text-slate-400 mt-1">Sube la primera foto para que aparezca en la página principal.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {fotos.map((f) => (
              <div key={f.id} className={`group bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${f.activo ? "border-slate-200" : "border-slate-200 opacity-60"}`}>
                <div className="relative aspect-[4/3] bg-slate-100 cursor-zoom-in" onClick={() => setZoomImg(f.imagen_url)}>
                  <img src={f.imagen_url} alt={f.titulo || "Foto de viaje"} className="w-full h-full object-cover" />
                  {!f.activo && (
                    <span className="absolute top-2 left-2 bg-slate-900/80 text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg">Oculta</span>
                  )}
                </div>
                <div className="p-3">
                  {f.titulo ? (
                    <p className="text-sm font-black text-slate-800 truncate">{f.titulo}</p>
                  ) : (
                    <p className="text-sm font-bold text-slate-300 italic">Sin título</p>
                  )}
                  {f.descripcion && <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{f.descripcion}</p>}
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => toggleActivo(f)}
                      disabled={actingId === f.id}
                      title={f.activo ? "Ocultar de la web" : "Mostrar en la web"}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                    >
                      {actingId === f.id ? <Loader2 size={12} className="animate-spin" /> : f.activo ? <EyeOff size={12} /> : <Eye size={12} />}
                      {f.activo ? "Ocultar" : "Mostrar"}
                    </button>
                    <button
                      onClick={() => eliminar(f.id)}
                      disabled={actingId === f.id}
                      title="Eliminar"
                      className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-all disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ZOOM */}
      {zoomImg && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setZoomImg(null)}>
          <button className="absolute top-5 right-5 text-white/70 hover:text-white transition-colors" onClick={() => setZoomImg(null)}><X size={28} /></button>
          <img src={zoomImg} alt="Foto de viaje" className="max-w-full max-h-full object-contain rounded-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
