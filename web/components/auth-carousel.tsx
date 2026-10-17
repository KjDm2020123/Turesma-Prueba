"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Bus } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ImagenCarrusel = { src: string; alt: string };

export default function AuthCarousel() {
  const [imagenes, setImagenes] = useState<ImagenCarrusel[]>([]);
  const [index, setIndex] = useState(0);

  // Usa la misma fuente publica que el carrusel "Nuestra Flota" de la pagina
  // de inicio, para que cualquier vehiculo que el admin agregue, edite o
  // desactive se refleje automaticamente aqui tambien.
  useEffect(() => {
    fetch(`${API_URL}/api/usuarios/vehiculos`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) return;
        const conFoto: ImagenCarrusel[] = (data as Array<Record<string, unknown>>)
          .filter((v) => typeof v?.imagen_url === "string" && v.imagen_url)
          .map((v) => ({
            src: v.imagen_url as string,
            alt: `${(v.tipo as string) || "Vehiculo"} ${(v.placa as string) || ""} de la flota Turesma`,
          }));
        if (conFoto.length > 0) {
          setImagenes(conFoto);
          setIndex(0);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (imagenes.length < 2) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % imagenes.length);
    }, 5000);
    return () => clearInterval(id);
  }, [imagenes.length]);

  return (
    <aside className="relative hidden h-screen w-[42%] shrink-0 overflow-hidden bg-[#081126] lg:block">
      {imagenes.map((img, i) => (
        <Image
          key={img.src}
          src={img.src}
          alt={img.alt}
          fill
          sizes="42vw"
          unoptimized
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {imagenes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[radial-gradient(ellipse_at_top_right,#263b60,#081126_70%)] text-white/70">
          <Bus size={64} strokeWidth={1.2} className="text-yellow-400" />
          <p className="text-sm font-bold uppercase tracking-[0.2em]">Nuestra flota</p>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-[#071126]/85 via-[#071126]/20 to-[#071126]/90" />

      <Link href="/" className="absolute left-10 top-10 z-10 flex items-center gap-3 rounded-full border border-white/15 bg-[#071126]/35 px-4 py-3 backdrop-blur-md transition-colors hover:bg-[#071126]/60">
        <div className="rounded-full border border-yellow-400/70 bg-white p-2 shadow-lg">
          <Bus size={22} className="text-[#E31E24]" />
        </div>
        <div>
          <p className="text-white font-black italic tracking-tighter leading-none">
            TURESMA <span className="text-[10px] not-italic align-top">S.A</span>
          </p>
          <p className="text-[9px] font-bold text-yellow-400 uppercase tracking-[0.3em]">
            Transporte Turistico
          </p>
        </div>
      </Link>

      <div className="absolute bottom-24 left-10 right-10 z-10">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.25em] text-yellow-400">Turesma S.A.</p>
        <h2 className="max-w-lg text-4xl font-black italic leading-tight tracking-tight text-white xl:text-5xl">
          Tu próximo viaje empieza aquí.
        </h2>
        <p className="mt-4 max-w-md text-sm font-medium leading-relaxed text-white/75">
          Transporte turístico y ejecutivo con comodidad, puntualidad y seguridad en cada recorrido.
        </p>
      </div>

      <div className="absolute bottom-10 left-10 z-10 flex items-center gap-2" aria-label="Imágenes de la flota">
        {imagenes.map((img, i) => (
          <span
            key={img.src}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === index ? "w-8 bg-yellow-400" : "w-1.5 bg-white/40"
            }`}
          />
        ))}
      </div>
    </aside>
  );
}
