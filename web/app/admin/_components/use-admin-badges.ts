"use client";

import { useEffect, useState } from "react";
import { getAuthHeaders } from "../../../lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Contadores de pendientes por sección, para mostrar un badge junto al item
// del sidebar que corresponda (ej. cuántas cotizaciones esperan respuesta,
// cuántos pagos faltan por revisar).
export const useAdminBadges = (enabled: boolean) => {
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/badges-sidebar`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setBadges(data || {});
      } catch {
        // silencio
      }
    };

    load();
    const interval = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled]);

  return badges;
};
