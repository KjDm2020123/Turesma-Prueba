"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bus } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Imagenes de respaldo, solo se usan si aun no hay vehiculos con foto en la BD.
const FALLBACK_IMAGENES = [
  { src: "/bus-hino-40.jpeg", alt: "Bus Hino de la flota Turesma" },
  { src: "/jac-17.png", alt: "Vehiculo Jac de la flota Turesma" },
  { src: "/jac-19.jpeg", alt: "Vehiculo Jac de la flota Turesma" },
];

type ImagenCarrusel = { src: string; alt: string };

export default function AuthCarousel() {
  const [imagenes, setImagenes] = useState<ImagenCarrusel[]>(FALLBACK_IMAGENES);
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
    <div className="relative hidden lg:flex lg:w-[42%] h-screen overflow-hidden bg-black shrink-0 flex-col justify-between p-10">
      {imagenes.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={img.src}
          src={img.src}
          alt={img.alt}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 ease-in-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-black/80" />

      {/* LOGO */}
      <Link href="/" className="relative z-10 flex items-center gap-3 w-fit">
        <div className="bg-white p-2 rounded-full shadow-lg border-2 border-yellow-400">
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

      {/* INDICADORES */}
      <div className="relative z-10 flex gap-2">
        {imagenes.map((img, i) => (
          <span
            key={img.src}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === index ? "w-8 bg-yellow-400" : "w-1.5 bg-white/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
