"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ChevronRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { getRolePath, getStoredUser, setStoredUser, setStoredToken } from "../../lib/session";
import AuthCarousel from "../../components/auth-carousel";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const checkSession = () => {
      const storedUser = getStoredUser();
      if (storedUser) {
        router.replace(getRolePath(storedUser.rol));
        return;
      }
      setCheckingSession(false);
    };

    checkSession();
    window.addEventListener("pageshow", checkSession);
    return () => window.removeEventListener("pageshow", checkSession);
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error((data?.error as string) || "No se pudo iniciar sesion");
      }

      const user = (data?.user ?? {}) as Record<string, unknown>;
      const token = data?.token as string | undefined;
      setStoredUser(user);
      if (token) setStoredToken(token);
      router.replace(getRolePath(String(user.rol || "")));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ocurrio un error inesperado");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center p-6">
        <Loader2 size={28} className="animate-spin text-[#E31E24]" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white flex font-sans">
      <AuthCarousel />

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[#E31E24] transition-colors mb-6 group">
            <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-1" />
            Volver al inicio
          </Link>
          <div className="mb-8">
            <h1 className="text-3xl font-black text-gray-900 mb-2">Inicia sesion</h1>
            <p className="text-sm text-gray-500">
              Ingresa tus credenciales para acceder a tu cuenta de Turesma.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 flex items-center gap-3 text-red-700 text-sm font-medium rounded-r-lg">
              <AlertCircle size={18} className="shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* CAMPO: EMAIL */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Correo Electronico</label>
              <div className="relative group">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#E31E24] transition-colors">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@turesma.com"
                  className="w-full bg-white border border-gray-300 rounded-lg pl-11 pr-4 py-3 text-sm text-gray-900 outline-none focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 transition-all"
                />
              </div>
            </div>

            {/* CAMPO: PASSWORD */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-gray-600">Contraseña</label>
                <Link href="/recuperar" className="text-xs font-semibold text-[#E31E24] hover:underline">
                  Olvide mi clave
                </Link>
              </div>
              <div className="relative group">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#E31E24] transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  className="w-full bg-white border border-gray-300 rounded-lg pl-11 pr-11 py-3 text-sm text-gray-900 outline-none focus:border-[#E31E24] focus:ring-2 focus:ring-[#E31E24]/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* BOTON DE ACCION */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#E31E24] hover:bg-[#b3141a] text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-70 mt-2"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  Iniciar Sesion
                  <ChevronRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className="text-sm text-gray-500 text-center mt-8">
            No tienes cuenta?{" "}
            <Link href="/registro" className="text-[#E31E24] font-semibold hover:underline">
              Registrate
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
