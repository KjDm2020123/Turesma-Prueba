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
  Bus,
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
    <main className="flex min-h-screen bg-slate-50 font-sans">
      <AuthCarousel />

      <div className="flex min-h-screen flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-2 rounded-lg text-sm font-bold text-slate-500 transition-colors hover:text-[#E31E24] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 group">
              <ArrowLeft size={17} className="transition-transform group-hover:-translate-x-1" />
              Volver al inicio
            </Link>
            <span className="hidden text-xs font-bold uppercase tracking-[0.16em] text-slate-400 sm:inline">Acceso seguro</span>
          </div>

          <div className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-9">
            <div className="mb-7 lg:hidden">
              <Link href="/" className="inline-flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E31E24] text-white shadow-md shadow-red-200">
                  <Bus size={21} />
                </span>
                <span className="text-lg font-black italic tracking-tight text-slate-900">TURESMA <span className="text-[10px] not-italic text-[#E31E24]">S.A.</span></span>
              </Link>
            </div>

            <div className="mb-8">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#E31E24]">Bienvenido de nuevo</p>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Inicia sesión</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Ingresa tus credenciales para acceder a tu cuenta de Turesma.
              </p>
            </div>

            {error && (
              <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="login-email" className="text-xs font-bold text-slate-700">Correo electrónico</label>
                <div className="group relative">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#E31E24]" />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@turesma.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#E31E24] focus:bg-white focus:ring-4 focus:ring-red-100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="login-password" className="text-xs font-bold text-slate-700">Contraseña</label>
                  <Link href="/recuperar" className="rounded text-xs font-bold text-[#E31E24] transition-colors hover:text-red-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100">
                    ¿Olvidaste tu clave?
                  </Link>
                </div>
                <div className="group relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#E31E24]" />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ingresa tu contraseña"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-12 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#E31E24] focus:bg-white focus:ring-4 focus:ring-red-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#E31E24] py-3.5 text-sm font-black text-white shadow-lg shadow-red-200/70 transition-all hover:-translate-y-0.5 hover:bg-[#b3141a] hover:shadow-red-300/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 active:translate-y-0 disabled:cursor-wait disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <Loader2 size={19} className="animate-spin" />
                    Validando acceso...
                  </>
                ) : (
                  <>
                    Iniciar sesión
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-slate-500">
              ¿No tienes cuenta?{" "}
              <Link href="/registro" className="rounded font-bold text-[#E31E24] transition-colors hover:text-red-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100">
                Regístrate
              </Link>
            </p>
          </div>
          <p className="mt-6 text-center text-[11px] font-medium text-slate-400">Turesma S.A. · Transporte turístico y ejecutivo</p>
        </div>
      </div>
    </main>
  );
}
