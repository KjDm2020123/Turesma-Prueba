"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Flag, Loader2 } from "lucide-react";
import { ensureLeaflet, reverseGeocode } from "../lib/leaflet";

export type Punto = { lat: number; lng: number; label: string };

// Selector de origen y destino en un mapa. El usuario hace clic para colocar
// los puntos (sin escribir). Hace geocodificación inversa para mostrar el nombre.
export function MapPicker({
  origin, destination, onChange, focusDestinationSignal = 0,
}: {
  origin: Punto | null;
  destination: Punto | null;
  onChange: (which: "origin" | "destination", val: Punto) => void;
  // Al incrementar este número (p.ej. tras autocompletar el origen por GPS),
  // el mapa cambia el foco a "destino" para que el usuario solo tenga que
  // seleccionar ese punto. Ignorado si no se usa.
  focusDestinationSignal?: number;
}) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markers = useRef<{ origin: any; destination: any }>({ origin: null, destination: null });
  const modeRef = useRef<"origin" | "destination">("origin");
  const [mode, setMode] = useState<"origin" | "destination">("origin");
  const [geocoding, setGeocoding] = useState(false);
  const [ready, setReady] = useState(false);
  const firstFocusRun = useRef(true);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (firstFocusRun.current) { firstFocusRun.current = false; return; }
    setMode("destination");
  }, [focusDestinationSignal]);

  const setMarker = (L: any, map: any, which: "origin" | "destination", lat: number, lng: number) => {
    const color = which === "origin" ? "#16a34a" : "#E31E24";
    const icon = L.divIcon({
      className: "",
      html: `<div style="background:${color};width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
      iconSize: [22, 22], iconAnchor: [11, 22],
    });
    if (markers.current[which]) { markers.current[which].setLatLng([lat, lng]); }
    else { markers.current[which] = L.marker([lat, lng], { icon }).addTo(map); }
  };

  useEffect(() => {
    let cancelled = false;
    ensureLeaflet().then((L) => {
      if (cancelled || !mapEl.current || mapRef.current) return;
      const map = L.map(mapEl.current).setView([-1.8312, -78.1834], 6); // Ecuador
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      setReady(true);

      map.on("click", async (e: any) => {
        const { lat, lng } = e.latlng;
        const which = modeRef.current;
        setMarker(L, map, which, lat, lng);
        setGeocoding(true);
        const label = await reverseGeocode(lat, lng);
        setGeocoding(false);
        onChange(which, { lat, lng, label });
        // alternar automáticamente al siguiente punto
        setMode((m) => (m === "origin" ? "destination" : "origin"));
      });
    }).catch(() => setReady(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pintar marcadores iniciales si vienen por props
  useEffect(() => {
    const L = (window as any).L; const map = mapRef.current;
    if (!L || !map) return;
    if (origin) setMarker(L, map, "origin", origin.lat, origin.lng);
    if (destination) setMarker(L, map, "destination", destination.lat, destination.lng);
  }, [ready, origin, destination]);

  return (
    <div className="space-y-2">
      {/* Selector de qué punto se está marcando */}
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("origin")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === "origin" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
          <MapPin size={14} /> Marcar salida
        </button>
        <button type="button" onClick={() => setMode("destination")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === "destination" ? "bg-[#E31E24] text-white" : "bg-slate-100 text-slate-500"}`}>
          <Flag size={14} /> Marcar destino
        </button>
      </div>

      <div ref={mapEl} className="w-full h-64 sm:h-72 rounded-2xl border-2 border-slate-200 overflow-hidden z-0" />

      <p className="text-[10px] text-slate-400 font-bold text-center">
        {geocoding ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Obteniendo dirección…</span>
          : `Haz clic en el mapa para fijar ${mode === "origin" ? "el punto de salida" : "el destino"}`}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1"><MapPin size={9} /> Salida</p>
          <p className="text-[11px] font-bold text-slate-700 truncate">{origin?.label || "Sin marcar"}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-2.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-[#E31E24] flex items-center gap-1"><Flag size={9} /> Destino</p>
          <p className="text-[11px] font-bold text-slate-700 truncate">{destination?.label || "Sin marcar"}</p>
        </div>
      </div>
    </div>
  );
}
