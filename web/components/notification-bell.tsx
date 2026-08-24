"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, MessageCircle, X } from "lucide-react";
import { getAuthHeaders } from "../lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type NotificationItem = {
  id: number;
  sender_user_id: number;
  sender_nombre?: string;
  sender_rol?: string;
  mensaje: string;
  creado_en: string;
  leido: boolean;
  link_type?: "cotizacion" | "reserva" | null;
  link_id?: number | null;
};

type Portal = "admin" | "cliente" | "vehiculo";

type Props = {
  userId?: number;
  accent?: "blue" | "emerald" | "red";
  // Portal actual: decide a qué pantalla navega al hacer clic en una notificación
  // con link_type/link_id (cotización o reserva).
  portal?: Portal;
};

// Resuelve a qué ruta debe navegar cada portal según el tipo de recurso enlazado.
// El query ?id= permite que la pantalla destino abra directo ese registro (hoy solo
// admin/cotizaciones lo consume; en las demás pantallas simplemente se ignora).
const resolveLinkPath = (portal: Portal | undefined, linkType?: string | null, linkId?: number | null): string | null => {
  if (!portal || !linkType) return null;
  const withId = (base: string) => (linkId ? `${base}?id=${linkId}` : base);
  if (linkType === "cotizacion") {
    if (portal === "admin") return withId("/admin/cotizaciones");
    if (portal === "cliente") return "/cliente/cotizar";
    return null;
  }
  if (linkType === "reserva") {
    if (portal === "admin") return "/admin/reservas";
    if (portal === "cliente") return "/cliente/historial";
    if (portal === "vehiculo") return "/vehiculo/activas";
  }
  return null;
};

const accentStyles = {
  blue: {
    button: "hover:text-blue-600 hover:bg-blue-50",
    badge: "bg-red-500",
    title: "text-blue-600",
    markAll: "text-blue-600 hover:bg-blue-50",
  },
  emerald: {
    button: "hover:text-emerald-600 hover:bg-emerald-50",
    badge: "bg-red-500",
    title: "text-emerald-600",
    markAll: "text-emerald-600 hover:bg-emerald-50",
  },
  red: {
    button: "hover:text-red-600 hover:bg-red-50",
    badge: "bg-red-500",
    title: "text-red-600",
    markAll: "text-red-600 hover:bg-red-50",
  },
};

const getRelativeTime = (dateText: string) => {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "Ahora";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Hace instantes";
  if (diffMin < 60) return `Hace ${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays} d`;
};

export function NotificationBell({ userId, accent = "blue", portal }: Props) {
  const styles = useMemo(() => accentStyles[accent] ?? accentStyles.blue, [accent]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  // Aviso emergente lateral (toast) que salta cuando llega una notificación nueva.
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const lastSeenIdRef = useRef<number | null>(null);

  const loadNotifications = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/comunicacion/notificaciones?userId=${userId}`);
      const data = await res.json();
      if (!res.ok) return;

      const notifications: NotificationItem[] = Array.isArray(data.notifications) ? data.notifications : [];
      setUnreadCount(Number(data.unread_count || 0));
      setItems(notifications);

      // Detecta notificaciones NUEVAS (id mayor al último visto) para el toast.
      const maxId = notifications.reduce((m, n) => Math.max(m, Number(n.id) || 0), 0);
      if (lastSeenIdRef.current === null) {
        // Primera carga: no saltar toasts de lo que ya existía antes de entrar.
        lastSeenIdRef.current = maxId;
      } else if (maxId > lastSeenIdRef.current) {
        const nuevas = notifications
          .filter((n) => Number(n.id) > (lastSeenIdRef.current as number) && !n.leido)
          .sort((a, b) => Number(b.id) - Number(a.id));
        if (nuevas.length > 0) setToast(nuevas[0]);
        lastSeenIdRef.current = maxId;
      }
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    if (!userId || unreadCount <= 0) return;

    try {
      const res = await fetch(`${API_URL}/api/comunicacion/notificaciones/leidas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) return;

      setUnreadCount(0);
      setItems((prev) => prev.map((item) => ({ ...item, leido: true })));
    } catch {
      // Silencioso para no romper UX
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // El toast lateral se cierra solo a los 7 segundos.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleItemClick = async (item: NotificationItem) => {
    // Marca solo esta notificación como leída (no todas)
    if (!item.leido && userId) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, leido: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      fetch(`${API_URL}/api/comunicacion/notificaciones/${item.id}/leida`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId }),
      }).catch(() => { /* silencio */ });
    }

    const path = resolveLinkPath(portal, item.link_type, item.link_id);
    if (path) {
      setOpen(false);
      router.push(path);
    }
  };

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`p-2.5 text-slate-500 rounded-xl transition-all relative ${styles.button}`}
        type="button"
        aria-label="Abrir notificaciones"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${styles.badge}`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 animate-in zoom-in-95 duration-200 origin-top-right z-50">
          <div className="mb-3 flex items-center justify-between">
            <h3 className={`text-sm font-bold ${styles.title}`}>Notificaciones</h3>
            <button
              type="button"
              onClick={markAllAsRead}
              className={`text-xs font-semibold rounded-lg px-2 py-1 transition-colors disabled:opacity-50 ${styles.markAll}`}
              disabled={unreadCount <= 0}
            >
              <span className="inline-flex items-center gap-1">
                <CheckCheck size={14} />
                Marcar leidas
              </span>
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {loading && items.length === 0 ? (
              <p className="text-xs text-slate-500">Cargando notificaciones...</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-slate-500">No tienes notificaciones.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`w-full text-left rounded-xl border px-3 py-2 transition-colors cursor-pointer hover:bg-blue-50 ${
                    item.leido ? "bg-white border-slate-200" : "bg-slate-50 border-slate-300"
                  }`}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 leading-tight">
                      {item.sender_nombre || "Usuario"}
                      {item.sender_rol ? ` (${item.sender_rol})` : ""}
                    </p>
                    {!item.leido && <span className="mt-0.5 inline-block w-2 h-2 rounded-full bg-red-500" />}
                  </div>
                  <p className="text-xs text-slate-700 line-clamp-2">{item.mensaje}</p>
                  <p className="mt-1 text-[10px] text-slate-500 inline-flex items-center gap-1">
                    <MessageCircle size={12} />
                    {getRelativeTime(item.creado_en)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* TOAST LATERAL: salta al llegar una notificación nueva, mostrando qué es */}
      {toast && (
        <div className="fixed top-20 right-4 left-4 sm:left-auto sm:w-96 z-[200] animate-in slide-in-from-top-4 fade-in duration-300">
          <div
            role="button"
            tabIndex={0}
            onClick={() => { handleItemClick(toast); setToast(null); }}
            className="w-full text-left bg-white rounded-2xl shadow-2xl border border-slate-100 border-l-4 border-l-[#E31E24] p-4 flex items-start gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
          >
            <div className="bg-[#E31E24]/10 p-2 rounded-xl shrink-0">
              <Bell size={18} className="text-[#E31E24]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#E31E24]">Nueva notificación</p>
              <p className="text-sm text-slate-800 leading-snug mt-0.5 line-clamp-3">{toast.mensaje}</p>
              <p className="text-[10px] text-slate-400 mt-1">{getRelativeTime(toast.creado_en)}</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setToast(null); }}
              className="p-1 text-slate-400 hover:text-slate-700 shrink-0"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
