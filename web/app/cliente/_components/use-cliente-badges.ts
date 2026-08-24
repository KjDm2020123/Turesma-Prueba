"use client";

import { useEffect, useState } from "react";
import { getAuthHeaders } from "../../../lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Contadores de pendientes para el cliente: cuántas cotizaciones esperan su
// respuesta (el admin contraofertó) y cuántas reservas le faltan pagar,
// para mostrarlos como badge junto a "Cotizar" y "Historial" del sidebar.
export const useClienteBadges = (enabled: boolean) => {
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [cotRes, resRes] = await Promise.all([
          fetch(`${API_URL}/api/cotizaciones/mias`, { headers: getAuthHeaders() }),
          fetch(`${API_URL}/api/usuarios/mis-reservas`, { headers: getAuthHeaders() }),
        ]);

        const cotizaciones = cotRes.ok ? await cotRes.json() : [];
        const reservas = resRes.ok ? await resRes.json() : [];

        const cotizarPendientes = Array.isArray(cotizaciones)
          ? cotizaciones.filter((c: any) => c.turno === "cliente" && !["aprobada", "rechazada"].includes(c.estado)).length
          : 0;
        const historialPendientes = Array.isArray(reservas)
          ? reservas.filter((r: any) => r.estado === "pendiente_pago").length
          : 0;

        if (!cancelled) {
          setBadges({
            "/cliente/cotizar": cotizarPendientes,
            "/cliente/historial": historialPendientes,
          });
        }
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
