"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle, X } from "lucide-react";

// Diálogo de confirmación con el diseño del sistema, para reemplazar el
// window.confirm() nativo del navegador. Se usa con el hook useConfirm():
//
//   const confirmar = useConfirm();
//   if (!(await confirmar({ message: "¿Eliminar?", tone: "danger" }))) return;
//
export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
};

type Pending = { opts: ConfirmOptions; resolve: (v: boolean) => void };

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirmar = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setPending({ opts, resolve }));
  }, []);

  const cerrar = (valor: boolean) => {
    setPending((p) => { p?.resolve(valor); return null; });
  };

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {pending && <ConfirmModal opts={pending.opts} onClose={cerrar} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return ctx;
}

function ConfirmModal({ opts, onClose }: { opts: ConfirmOptions; onClose: (v: boolean) => void }) {
  const danger = opts.tone === "danger";
  const okRef = useRef<HTMLButtonElement>(null);

  // Enfoca el botón principal y permite Enter (aceptar) / Escape (cancelar).
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
      if (e.key === "Enter") onClose(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0b0f1a]/80 backdrop-blur-sm p-4"
      onClick={() => onClose(false)}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-4">
          <div className={`shrink-0 rounded-2xl p-3 ${danger ? "bg-red-50 text-[#E31E24]" : "bg-slate-100 text-slate-500"}`}>
            {danger ? <AlertTriangle size={22} /> : <HelpCircle size={22} />}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-base font-black text-slate-900">{opts.title || (danger ? "Confirmar acción" : "Confirmación")}</h3>
            <p className="mt-1 text-sm text-slate-500 leading-relaxed">{opts.message}</p>
          </div>
          <button onClick={() => onClose(false)} className="shrink-0 text-slate-300 hover:text-slate-500"><X size={18} /></button>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => onClose(false)}
            className="flex-1 rounded-xl bg-slate-100 py-3 text-[11px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-200"
          >
            {opts.cancelText || "Cancelar"}
          </button>
          <button
            ref={okRef}
            onClick={() => onClose(true)}
            className={`flex-1 rounded-xl py-3 text-[11px] font-black uppercase tracking-widest text-white transition-all ${danger ? "bg-[#E31E24] hover:bg-red-700" : "bg-[#0b0f1a] hover:bg-black"}`}
          >
            {opts.confirmText || "Aceptar"}
          </button>
        </div>
      </div>
    </div>
  );
}
