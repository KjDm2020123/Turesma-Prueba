"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bus,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  User,
  X,
  Zap,
} from "lucide-react";
import { clearStoredUser, getStoredUser } from "../../../lib/session";
import { NotificationBell } from "../../../components/notification-bell";
import { useClienteBadges } from "./use-cliente-badges";

type MenuItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
};

const menuItems: MenuItem[] = [
  { href: "/cliente", label: "Inicio", icon: LayoutDashboard },
  { href: "/cliente/cotizar", label: "Cotizar", icon: FileText },
  { href: "/cliente/historial", label: "Historial", icon: History },
  { href: "/cliente/perfil", label: "Perfil", icon: User },
];

type ClienteShellProps = {
  children: React.ReactNode;
};

export function ClienteShell({ children }: ClienteShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [user, setUser] = useState<ReturnType<typeof getStoredUser> | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    setIsHydrated(true);
  }, []);

  const badges = useClienteBadges(isHydrated);

  const isActive = (href: string) => {
    if (href === "/cliente") return pathname === "/cliente";
    return pathname.startsWith(href);
  };

  const currentSection = (() => {
    const active = menuItems.find((item) => isActive(item.href));
    return active?.label || "Panel Cliente";
  })();

  const handleLogout = () => {
    clearStoredUser();
    router.replace("/login");
  };

  if (!isHydrated) {
    return <div className="min-h-screen bg-[#f8f9fa]" />;
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex font-sans text-[#1a1a1a]">
      <aside className="hidden lg:flex w-72 flex-col bg-[#0b0f1a] text-white fixed h-full shadow-[10px_0_30px_rgba(0,0,0,0.1)] z-50">
        <div className="p-8 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#E31E24] rounded-2xl flex items-center justify-center shadow-lg shadow-red-600/20 transform -rotate-3">
              <Bus size={28} className="text-white" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-black italic tracking-tighter leading-none text-white">
                TURESMA <span className="text-[10px] not-italic text-yellow-400">S.A</span>
              </h1>
              <span className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-bold mt-1">Portal Cliente</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
          <p className="px-4 text-[10px] font-black text-gray-600 uppercase tracking-widest mb-4">Navegacion Cliente</p>
          {menuItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            const pendientes = badges[item.href] || 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-300 ${
                  active
                    ? "bg-[#E31E24] text-white shadow-xl shadow-red-600/20"
                    : "text-gray-500 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-xl transition-colors ${active ? "bg-white/20" : "group-hover:bg-white/5"}`}>
                    <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                  </div>
                  <span className={`text-sm font-bold tracking-tight ${active ? "opacity-100" : "opacity-80 group-hover:opacity-100"}`}>
                    {item.label}
                  </span>
                </div>
                {pendientes > 0 ? (
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white shadow-lg shadow-red-500/30 animate-pulse">
                    {pendientes > 99 ? "99+" : pendientes}
                  </span>
                ) : (
                  active && <Zap size={14} className="text-yellow-400 fill-yellow-400 animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 bg-[#080b14] border-t border-white/5">
          <div className="bg-white/5 rounded-[1.5rem] p-4 border border-white/5 shadow-inner">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-gray-700 to-gray-800 flex items-center justify-center text-sm font-black border border-white/10 text-white" suppressHydrationWarning>
                  {isHydrated && user ? String(user.nombre || "CL").slice(0, 2).toUpperCase() : "CL"}
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-[#0b0f1a] rounded-full shadow-lg"></div>
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold truncate text-white">
                  {user?.nombre || "Cliente"}
                </p>
                <p className="text-[10px] text-gray-400 truncate">Cliente</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#E31E24]/10 hover:bg-[#E31E24] text-[#E31E24] hover:text-white rounded-xl transition-all duration-300 text-[10px] font-black tracking-widest border border-[#E31E24]/20 group"
              type="button"
            >
              <LogOut size={14} className="group-hover:-translate-x-1 transition-transform" />
              SALIR DEL PANEL
            </button>
          </div>
        </div>
      </aside>

      <aside className={`fixed inset-y-0 left-0 w-72 bg-[#0b0f1a] text-white z-[70] transform transition-transform duration-500 ease-in-out lg:hidden ${isMobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}>
        <div className="p-8 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#E31E24] rounded-lg flex items-center justify-center font-bold">T</div>
            <span className="font-black italic tracking-tighter uppercase">Turesma</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors" type="button">
            <X size={20} />
          </button>
        </div>

        <nav className="p-6 space-y-3">
          {menuItems.map((item) => {
            const active = isActive(item.href);
            const pendientes = badges[item.href] || 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`w-full flex items-center justify-between gap-4 px-5 py-4 rounded-2xl transition-all ${active ? "bg-[#E31E24] text-white" : "text-gray-500 hover:bg-white/5"}`}
              >
                <div className="flex items-center gap-4">
                  <item.icon size={20} />
                  <span className="font-bold text-sm uppercase tracking-tight">{item.label}</span>
                </div>
                {pendientes > 0 && (
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                    {pendientes > 99 ? "99+" : pendientes}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/5 p-4">
          <button
            onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
            className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl text-gray-500 hover:bg-white/5 hover:text-red-400 transition-all"
            type="button"
          >
            <LogOut size={20} />
            <span className="font-bold text-sm uppercase tracking-tight">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col lg:ml-72 h-screen relative min-w-0 overflow-hidden">
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2 text-[#E31E24] hover:bg-red-50 rounded-xl transition-all" onClick={() => setIsMobileMenuOpen(true)} type="button" aria-label="Abrir menú">
              <Menu size={24} />
            </button>
            {/* Logo + sección (visible en móvil, donde el sidebar está oculto) */}
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-8 h-8 bg-[#E31E24] rounded-lg flex items-center justify-center">
                <Bus size={18} className="text-white" />
              </div>
              <span className="text-sm font-bold text-gray-900">{currentSection}</span>
            </div>
            <h2 className="hidden lg:block text-sm font-semibold text-gray-500">{currentSection}</h2>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            <NotificationBell userId={user?.id} accent="red" portal="cliente" />

            <div className="flex items-center gap-3 border-l border-gray-200 pl-3 md:pl-6">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{user?.nombre || "Cliente"}</p>
                <p className="text-[11px] text-gray-400">Cliente</p>
              </div>
              {user?.imagen_url ? (
                <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm border border-slate-200">
                  <img src={user.imagen_url} alt={user?.nombre} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-[#E31E24] flex items-center justify-center text-white shadow-sm">
                  <User size={20} strokeWidth={2.2} />
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="p-3 sm:p-6 md:p-10 flex-1 overflow-y-auto">
          <div className="w-full max-w-7xl mx-auto space-y-5 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-l-4 border-[#E31E24] pl-4 sm:pl-6">
              <div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-[#1a1a1a] tracking-tighter uppercase italic">{currentSection}</h1>
              </div>
            </div>

            <div className="bg-white rounded-2xl sm:rounded-[2.5rem] border border-gray-200 shadow-sm sm:shadow-2xl sm:shadow-gray-200/50 min-h-[420px] sm:min-h-[600px] overflow-hidden p-3 sm:p-8 border-b-4 sm:border-b-8 border-[#E31E24]">
              {children}
            </div>
          </div>
        </section>
      </main>

      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/45 z-[60]" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .custom-scrollbar::-webkit-scrollbar { width: 5px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #E31E24; border-radius: 10px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #b3141a; }
          `,
        }}
      />
    </div>
  );
}
