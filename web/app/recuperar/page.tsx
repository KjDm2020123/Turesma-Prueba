"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Bus
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pinRequested, setPinRequested] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequestPin = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo enviar el PIN");
      }

      setPinRequested(true);
      setMessage(data.message || "Si el correo existe, enviamos el PIN.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Ocurrió un error inesperado"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          pin,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar la contraseña");
      }

      setMessage(data.message || "Contraseña actualizada correctamente");
      setPin("");
      setNewPassword("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Ocurrió un error inesperado"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8f9fa] px-4 py-10">
      {/* ELEMENTOS DE FONDO INSPIRADOS EN EL LOGO */}
      <div className="absolute left-[-5%] top-[-5%] h-[400px] w-[400px] rounded-full bg-yellow-400/20 blur-[100px]" />
      <div className="absolute bottom-[-5%] right-[-5%] h-[400px] w-[400px] rounded-full bg-green-500/10 blur-[100px]" />

      <section className="relative z-10 w-full max-w-md rounded-3xl border-b-8 border-[#E31E24] bg-white shadow-2xl overflow-hidden">
        
        {/* CABECERA CON IDENTIDAD TURESMA */}
        <div className="bg-[#E31E24] p-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg border-2 border-yellow-400">
            <KeyRound size={28} className="text-[#E31E24]" />
          </div>
          <h1 className="text-xl font-black uppercase tracking-wider text-white">Seguridad Turesma</h1>
        </div>

        <div className="p-7 md:p-9">
          <div className="mb-6 text-center">
            <h2 className="text-lg font-bold text-slate-900">¿Olvidaste tu contraseña?</h2>
            <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-tighter">Recuperación de acceso al sistema</p>
          </div>

          {error ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 animate-pulse">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {message ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
              <ShieldCheck size={16} className="shrink-0" />
              <span>{message}</span>
            </div>
          ) : null}

          {!pinRequested ? (
            <form onSubmit={handleRequestPin} className="space-y-5">
              <div className="space-y-1">
                <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Correo Electrónico</label>
                <div className="relative group">
                  <Mail size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#E31E24] transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-bold text-slate-700 outline-none transition-all focus:border-[#E31E24]"
                    placeholder="correo@turesma.com"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#E31E24] to-[#b3141a] py-4 text-sm font-black uppercase tracking-widest text-white transition-all hover:from-black hover:to-black shadow-lg shadow-red-100 disabled:opacity-70"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : "Enviar PIN de Seguridad"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1">
                <label className="px-1 text-[10px] font-black uppercase text-slate-400">Verificar Email</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full rounded-xl border-2 border-slate-50 bg-slate-50/50 py-3 pl-12 text-sm font-bold text-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="px-1 text-[10px] font-black uppercase text-slate-400">PIN de 6 Dígitos</label>
                <div className="relative group">
                  <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#E31E24]" />
                  <input
                    type="text"
                    value={pin}
                    onChange={(event) => setPin(event.target.value)}
                    className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 py-3 pl-12 text-sm font-black tracking-[0.5em] outline-none focus:border-[#E31E24]"
                    placeholder="000000"
                    maxLength={6}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="px-1 text-[10px] font-black uppercase text-slate-400">Nueva Contraseña</label>
                <div className="relative group">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#E31E24]" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 py-3 pl-12 text-sm font-bold outline-none focus:border-[#E31E24]"
                    minLength={6}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#E31E24] to-[#b3141a] py-4 text-sm font-black uppercase tracking-widest text-white transition-all hover:from-black hover:to-black"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : "Actualizar Contraseña"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setPinRequested(false);
                  setPin("");
                  setNewPassword("");
                  setError("");
                  setMessage("");
                }}
                className="w-full py-2 text-[10px] font-black uppercase tracking-tighter text-slate-400 hover:text-[#E31E24] transition-colors"
              >
                ¿No recibiste el PIN? Intentar de nuevo
              </button>
            </form>
          )}

          <div className="mt-8 border-t border-slate-100 pt-6">
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-[#E31E24] transition-colors"
            >
              <ArrowLeft size={16} />
              Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER PEQUEÑO */}
      <div className="absolute bottom-4 text-center">
         <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
           Soporte Técnico Turesma S.A.
         </p>
      </div>
    </main>
  );
}