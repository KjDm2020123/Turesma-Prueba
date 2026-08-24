"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["D", "L", "M", "X", "J", "V", "S"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
// Suma días a una fecha ISO (YYYY-MM-DD) sin problemas de zona horaria.
const addDaysIso = (isoDate: string, n: number) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return iso(dt);
};

// Calendario que muestra los días ya reservados/no disponibles de un vehículo
// (bloqueados) y permite seleccionar una fecha libre. En modo `range` el cliente
// elige un día de inicio y otro de fin (reserva de varios días).
export function VehiculoCalendario({
  vehiculoId, value, onSelect, range = false, endValue = "", onSelectEnd, maxDays = 0,
}: {
  vehiculoId: number | null;
  value: string;
  onSelect: (fecha: string) => void;
  range?: boolean;
  endValue?: string;
  onSelectEnd?: (fecha: string) => void;
  maxDays?: number; // tope de días seguidos en modo rango (0 = sin tope)
}) {
  const [dispo, setDispo] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState("");
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  useEffect(() => {
    if (!vehiculoId) { setDispo({}); return; }
    setLoading(true);
    const desde = iso(new Date());
    const hastaD = new Date(); hastaD.setDate(hastaD.getDate() + 90);
    fetch(`${API}/api/usuarios/vehiculos/${vehiculoId}/disponibilidad?desde=${desde}&hasta=${iso(hastaD)}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const map: Record<string, boolean> = {};
        rows.forEach(r => { map[String(r.fecha).slice(0, 10)] = !!r.disponible; });
        setDispo(map);
      })
      .catch(() => setDispo({}))
      .finally(() => setLoading(false));
  }, [vehiculoId]);

  const hoy = iso(new Date());
  const esLibre = (f: string) => f >= hoy && (dispo[f] === undefined ? true : dispo[f] === true);

  // ¿Están libres TODOS los días entre a y b (inclusive)? Para validar el rango.
  const rangoLibre = (a: string, b: string) => {
    let cur = a;
    while (cur <= b) { if (!esLibre(cur)) return false; cur = addDaysIso(cur, 1); }
    return true;
  };
  // Días que abarca el rango a..b (ambos extremos incluidos).
  const diasRango = (a: string, b: string) => {
    const d1 = new Date(a + "T00:00").getTime(), d2 = new Date(b + "T00:00").getTime();
    return Math.round((d2 - d1) / 86400000) + 1;
  };

  const dias = useMemo(() => {
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startDow = first.getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) cells.push(iso(new Date(year, month, d)));
    return cells;
  }, [cursor]);

  const cambiarMes = (delta: number) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  const clickDia = (f: string) => {
    if (!esLibre(f)) return;
    if (!range) { onSelect(f); return; }
    setAviso("");
    // Modo rango: primer clic = inicio; segundo clic válido = fin.
    if (!value || (value && endValue)) {
      onSelect(f); onSelectEnd?.("");
      return;
    }
    if (f === value) return;
    if (f > value) {
      if (maxDays > 0 && diasRango(value, f) > maxDays) {
        setAviso(`Máximo ${maxDays} días seguidos por reserva.`);
        return;
      }
      if (rangoLibre(value, f)) { onSelectEnd?.(f); return; }
    }
    // clic anterior al inicio o con días ocupados en medio → reinicia el rango
    onSelect(f); onSelectEnd?.("");
  };

  if (!vehiculoId) {
    return <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center text-xs font-bold text-slate-400">Selecciona un vehículo para ver sus días disponibles</div>;
  }

  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => cambiarMes(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft size={18} /></button>
        <p className="text-sm font-black uppercase italic tracking-tighter text-slate-700">{MESES[cursor.getMonth()]} {cursor.getFullYear()}</p>
        <button type="button" onClick={() => cambiarMes(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronRight size={18} /></button>
      </div>

      {range && (
        <p className="text-[10px] font-bold text-slate-400 mb-2 text-center">
          {!value ? "Toca el día de inicio del viaje" : !endValue ? "Ahora toca el último día del viaje" : "Rango seleccionado — toca otro día para cambiarlo"}
          {maxDays > 0 && <span className="text-slate-300"> · máx. {maxDays} días</span>}
        </p>
      )}
      {aviso && <p className="text-[10px] font-bold text-[#E31E24] mb-2 text-center">{aviso}</p>}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#E31E24]" size={24} /></div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS.map((d, i) => <div key={i} className="text-center text-[9px] font-black uppercase text-slate-300">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {dias.map((f, i) => {
              if (!f) return <div key={i} />;
              const dayNum = Number(f.slice(8, 10));
              const past = f < hoy;
              const libre = esLibre(f);
              const reservado = dispo[f] === false && !past;
              const esInicio = value === f;
              const esFin = !!endValue && endValue === f;
              const enRango = range && !!value && !!endValue && f > value && f < endValue;
              const sel = esInicio || esFin;
              return (
                <button key={i} type="button" disabled={!libre}
                  onClick={() => clickDia(f)}
                  title={reservado ? "No disponible" : ""}
                  className={`aspect-square rounded-lg text-xs font-bold transition-all ${
                    sel ? "bg-[#E31E24] text-white shadow" :
                    enRango ? "bg-red-100 text-red-600" :
                    libre ? "bg-slate-50 text-slate-700 hover:bg-emerald-100" :
                    reservado ? "bg-red-50 text-red-300 line-through cursor-not-allowed" :
                    "bg-slate-50 text-slate-200 cursor-not-allowed"
                  }`}>
                  {dayNum}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-3 text-[9px] font-bold text-slate-400 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 inline-block" /> Libre</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> Reservado</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#E31E24] inline-block" /> Tu elección</span>
          </div>
        </>
      )}
    </div>
  );
}
