"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Phone,
  User,
  Upload,
  X
} from "lucide-react";
import AuthCarousel from "../../components/auth-carousel";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function RegistroPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    telefono: "",
    password: "",
    confirmarPassword: "",
  });

  const passwordMatch = useMemo(() => {
    if (!form.password || !form.confirmarPassword) return true;
    return form.password === form.confirmarPassword;
  }, [form.password, form.confirmarPassword]);

  const handleFotoUpload = async (file: File | null) => {
    if (!file) return;

    setUploadingFoto(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("imagen", file);

      const response = await fetch(`${API_URL}/api/auth/upload-perfil`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Error al subir la foto");
      }

      setFotoUrl(data.imageUrl);
      setFotoPreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la foto");
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!passwordMatch) {
      setError("Las contrasenas no coinciden");
      return;
    }

    if (form.password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (!form.telefono.trim()) {
      setError("Debes ingresar un numero de telefono");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          email: form.email.trim().toLowerCase(),
          telefono: form.telefono.trim(),
          password: form.password,
          foto_url: fotoUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo crear la cuenta");
      }

      setSuccess("Cuenta creada correctamente. Te redirigimos al login...");

      setTimeout(() => {
        router.push("/login");
      }, 1300);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ocurrio un error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white flex font-sans">
      <AuthCarousel />

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 lg:overflow-y-auto">
        <div className="w-full max-w-[400px] my-8">
          <div className="mb-8">
            <h1 className="text-3xl font-black text-gray-900 mb-2">Crea tu cuenta</h1>
            <p className="text-sm text-gray-500">
              Registrate para cotizar y reservar tus viajes con Turesma.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 flex items-center gap-3 text-red-700 text-sm font-medium rounded-r-lg">
              <AlertCircle size={18} className="shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-emerald-50 border-l-4 border-emerald-500 flex items-center gap-3 text-emerald-700 text-sm font-medium rounded-r-lg">
              <CheckCircle2 size={18} className="shrink-0" />
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* NOMBRE */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Nombre Completo</label>
              <div className="relative group">
                <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#E31E24] transition-colors" />
                <input
                  type="text"
                  required
                  value={form.nombre}
                  onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Ej. Maria Zambrano"
                  className="w-full bg-white border border-gray-300 rounded-lg pl-11 pr-4 py-3 text-sm text-gray-900 outline-none focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 transition-all"
                />
              </div>
            </div>

            {/* EMAIL */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Correo Electronico</label>
              <div className="relative group">
                <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#E31E24] transition-colors" />
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="usuario@turesma.com"
                  className="w-full bg-white border border-gray-300 rounded-lg pl-11 pr-4 py-3 text-sm text-gray-900 outline-none focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 transition-all"
                />
              </div>
            </div>

            {/* TELEFONO */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Numero de Telefono</label>
              <div className="relative group">
                <Phone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#E31E24] transition-colors" />
                <input
                  type="tel"
                  required
                  value={form.telefono}
                  onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))}
                  placeholder="Ej. 099 123 4567"
                  className="w-full bg-white border border-gray-300 rounded-lg pl-11 pr-4 py-3 text-sm text-gray-900 outline-none focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 transition-all"
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Contraseña</label>
              <div className="relative group">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#E31E24] transition-colors" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="********"
                  className="w-full bg-white border border-gray-300 rounded-lg pl-11 pr-11 py-3 text-sm text-gray-900 outline-none focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 transition-all"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* CONFIRMAR PASSWORD */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Confirmar Contrasena</label>
              <div className="relative group">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#E31E24] transition-colors" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={form.confirmarPassword}
                  onChange={(e) => setForm((prev) => ({ ...prev, confirmarPassword: e.target.value }))}
                  placeholder="********"
                  className={`w-full bg-white border rounded-lg pl-11 pr-11 py-3 text-sm text-gray-900 outline-none transition-all ${!passwordMatch ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100' : 'border-gray-300 focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10'}`}
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* FOTO PERFIL (OPCIONAL) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Foto de Perfil (Opcional)</label>
              <div className="relative">
                {fotoPreview ? (
                  <div className="relative w-full h-28 rounded-lg overflow-hidden border border-emerald-300 bg-gray-50 flex items-center justify-center">
                    <Image
                      src={fotoPreview}
                      alt="preview"
                      width={200}
                      height={112}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFotoPreview(null);
                        setFotoUrl(null);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer block">
                    <div className="w-full h-28 rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:border-[#E31E24] transition-all flex flex-col items-center justify-center gap-2">
                      {uploadingFoto ? (
                        <>
                          <Loader2 size={22} className="text-[#E31E24] animate-spin" />
                          <span className="text-xs text-gray-500 font-medium">Subiendo...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={22} className="text-gray-400" />
                          <span className="text-xs text-gray-500 font-medium">Selecciona una foto</span>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFotoUpload(e.target.files?.[0] || null)}
                      className="hidden"
                      disabled={uploadingFoto}
                    />
                  </label>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#E31E24] hover:bg-[#b3141a] text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-70 mt-2"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : (
                <>Registrarse <ChevronRight size={18} /></>
              )}
            </button>
          </form>

          <p className="text-sm text-gray-500 text-center mt-8">
            Ya tienes cuenta?{" "}
            <Link href="/login" className="text-[#E31E24] font-semibold hover:underline">
              Inicia Sesion
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
