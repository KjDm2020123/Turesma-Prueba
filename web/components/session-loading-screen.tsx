import { Bus, LoaderCircle } from "lucide-react";

export function SessionLoadingScreen() {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8f9fa] px-4 py-10"
      role="status"
      aria-live="polite"
      aria-label="Verificando sesión"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-red-100/70 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-blue-100/60 blur-3xl" />
      </div>

      <section className="relative w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white/95 p-8 text-center shadow-[0_24px_70px_-35px_rgba(15,23,42,0.28)] sm:p-10">
        <div className="mx-auto flex w-fit items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E31E24] text-white shadow-lg shadow-red-600/20">
            <Bus size={25} strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div className="text-left">
            <p className="text-base font-black italic leading-none tracking-tight text-[#0b0f1a]">
              TURESMA <span className="text-[9px] not-italic text-[#E31E24]">S.A.</span>
            </p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Transporte turístico
            </p>
          </div>
        </div>

        <div className="mx-auto mt-9 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-[#E31E24]">
          <LoaderCircle
            size={34}
            strokeWidth={2}
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        </div>

        <h1 className="mt-6 text-xl font-extrabold tracking-tight text-slate-900">
          Preparando tu espacio
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">
          Estamos verificando tu sesión y configurando tu acceso de forma segura.
        </p>

        <div aria-hidden="true" className="mt-8 flex justify-center gap-1.5">
          <span className="h-1.5 w-8 rounded-full bg-[#E31E24]" />
          <span className="h-1.5 w-5 animate-pulse rounded-full bg-red-200 motion-reduce:animate-none" />
          <span className="h-1.5 w-5 rounded-full bg-slate-200" />
        </div>
      </section>
    </main>
  );
}
