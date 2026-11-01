// Carga Leaflet (CSS + JS) desde CDN una sola vez y resuelve con window.L.
export const ensureLeaflet = (): Promise<any> =>
  new Promise((resolve, reject) => {
    if (typeof window === "undefined") { reject(new Error("SSR")); return; }
    const w = window as any;
    if (w.L) { resolve(w.L); return; }
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).L));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.id = "leaflet-js";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = reject;
    document.body.appendChild(script);
  });

export type Coord = { lat: number; lng: number };

export type GeocodingResult = Coord & { label: string };

let locationSearchQueue: Promise<void> = Promise.resolve();
let lastLocationSearchAt = 0;

export type RutaCalculada = {
  coords: [number, number][]; // lista de puntos [lat, lng] para dibujar la línea
  distanciaKm: number;
  duracionMin: number;
};

// Búsqueda bajo demanda para evitar solicitudes de geocodificación en cada tecla.
export const searchLocations = async (query: string): Promise<GeocodingResult[]> => {
  const searchSlot = locationSearchQueue.then(async () => {
    const wait = Math.max(0, lastLocationSearchAt + 1000 - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastLocationSearchAt = Date.now();
  });
  locationSearchQueue = searchSlot.catch(() => undefined);
  await searchSlot;

  const params = new URLSearchParams({
    format: "jsonv2",
    q: query.trim(),
    countrycodes: "ec",
    addressdetails: "1",
    limit: "5",
    "accept-language": "es",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("No se pudo buscar la dirección. Inténtalo de nuevo.");
  }

  const data: Array<{ lat: string; lon: string; display_name: string }> = await response.json();
  return data.map((item) => ({
    lat: Number(item.lat),
    lng: Number(item.lon),
    label: item.display_name,
  })).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng) && item.label);
};

// Calcula la ruta real por carretera entre dos puntos usando OSRM (servicio
// público de OpenStreetMap). Devuelve la geometría para trazar la línea, la
// distancia y la duración estimada (para el tiempo de llegada). Best-effort:
// si falla, devuelve null y el mapa simplemente no dibuja la ruta.
export const calcularRuta = async (origen: Coord, destino: Coord): Promise<RutaCalculada | null> => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const route = d?.routes?.[0];
    if (!route?.geometry?.coordinates) return null;
    const coords: [number, number][] = route.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]] // OSRM devuelve [lng, lat] → Leaflet usa [lat, lng]
    );
    return {
      coords,
      distanciaKm: Number(route.distance) / 1000,
      duracionMin: Number(route.duration) / 60,
    };
  } catch {
    return null;
  }
};

// Formatea minutos a un texto legible: "45 min", "1 h 20 min".
export const formatDuracion = (min: number): string => {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
};

// Geocodificación inversa con Nominatim (OpenStreetMap). Best-effort.
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&accept-language=es`,
      { headers: { "Accept": "application/json" } }
    );
    if (!r.ok) throw new Error();
    const d = await r.json();
    return d.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
};
