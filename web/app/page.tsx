"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useRef, type MouseEvent } from "react";
import {
  BriefcaseBusiness,
  BadgeCheck,
  Clock3,
  Activity,
  Bus,
  ChevronRight,
  ChevronLeft,
  X,
  Menu as MenuIcon,
  Phone,
  Mail,
  MapPin,
  ShieldCheck
} from "lucide-react";

type VehiculoPublico = {
  id: number;
  placa: string;
  tipo: string | null;
  modelo: string | null;
  capacidad: number | null;
  color: string | null;
  imagen_url: string | null;
  descripcion: string | null;
  estado: string;
};

type GaleriaFoto = {
  id: number;
  imagen_url: string;
  titulo: string | null;
  descripcion: string | null;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Número oficial de la empresa (formato internacional sin +). Cambiarlo aquí
// actualiza el botón flotante, el CTA del hero y el pie de página a la vez.
const TELEFONO_EMPRESA = "593993570061";
const TELEFONO_EMPRESA_DISPLAY = "+593 99 357 0061";

const IMAGEN_FALLBACK = "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=800&auto=format&fit=crop";
const PUBLIC_DATA_CACHE_KEY = "turesma_public_data";

type PublicDataCache = {
  vehiculos: VehiculoPublico[];
  galeria: GaleriaFoto[];
};

export default function RootPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [vehiculos, setVehiculos] = useState<VehiculoPublico[]>([]);
  const [loadingVehiculos, setLoadingVehiculos] = useState(true);
  const [galeria, setGaleria] = useState<GaleriaFoto[]>([]);
  const flotaRef = useRef<HTMLDivElement | null>(null);

  // Desplaza el carrusel de flota una "tarjeta" a izq/der. Si ya está al final,
  // vuelve al inicio (loop infinito) para que el auto-avance no se detenga.
  const scrollFlota = (dir: "left" | "right") => {
    const el = flotaRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-flota-card]");
    const amount = card ? card.offsetWidth + 24 : el.clientWidth * 0.8;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    const atStart = el.scrollLeft <= 4;

    if (dir === "right" && atEnd) {
      el.scrollTo({ left: 0, behavior: "smooth" });
    } else if (dir === "left" && atStart) {
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    } else {
      el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    }
  };

  useEffect(() => {
    let cachedVehicles: VehiculoPublico[] = [];
    let cachedGallery: GaleriaFoto[] = [];

    try {
      const cached = localStorage.getItem(PUBLIC_DATA_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached) as Partial<PublicDataCache>;
        if (Array.isArray(data.vehiculos)) {
          cachedVehicles = data.vehiculos;
          setVehiculos(cachedVehicles);
        }
        if (Array.isArray(data.galeria)) {
          cachedGallery = data.galeria;
          setGaleria(cachedGallery);
        }
        if (Array.isArray(data.vehiculos) || Array.isArray(data.galeria)) setLoadingVehiculos(false);
      }
    } catch {
      localStorage.removeItem(PUBLIC_DATA_CACHE_KEY);
    }

    // Flota y galería se actualizan en paralelo; la caché permite pintar antes
    // de que el backend termine de despertar.
    Promise.all([
      fetch(`${API_URL}/api/usuarios/vehiculos`).then((r) => r.json()),
      fetch(`${API_URL}/api/usuarios/galeria`).then((r) => r.json()),
    ])
      .then(([vehiclesData, galleryData]) => {
        let nextVehicles = cachedVehicles;
        let nextGallery = cachedGallery;

        if (Array.isArray(vehiclesData)) {
          const conFoto = vehiclesData.filter((v: VehiculoPublico) => v.imagen_url);
          nextVehicles = conFoto.length >= 3 ? conFoto : vehiclesData;
          setVehiculos(nextVehicles);
        }
        if (Array.isArray(galleryData)) {
          nextGallery = galleryData.filter((g: GaleriaFoto) => g.imagen_url);
          setGaleria(nextGallery);
        }
        localStorage.setItem(PUBLIC_DATA_CACHE_KEY, JSON.stringify({ vehiculos: nextVehicles, galeria: nextGallery }));
      })
      .catch(() => {})
      .finally(() => setLoadingVehiculos(false));
  }, []);

  useEffect(() => {
    let ticking = false;
    const updateScrollButton = () => {
      const shouldShow = window.scrollY > 300;
      setShowScrollTop((current) => (current === shouldShow ? current : shouldShow));
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollButton);
        ticking = true;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMenu = () => setMobileMenuOpen(false);

  const scrollToSection = (event: MouseEvent<HTMLAnchorElement>, sectionId: string, shouldCloseMenu = false) => {
    event.preventDefault();
    const section = document.getElementById(sectionId);
    if (!section) return;

    const navOffset = 96;
    const top = section.getBoundingClientRect().top + window.scrollY - navOffset;
    window.scrollTo({ top, behavior: "smooth" });
    window.history.replaceState(null, "", `#${sectionId}`);

    if (shouldCloseMenu) closeMenu();
  };

  return (
    <main className="bg-white text-[#1a1a1a] antialiased selection:bg-[#E31E24] selection:text-white font-sans scroll-smooth">
      
      {/* NAVBAR */}
      <nav className="fixed z-50 w-full border-b border-gray-100 bg-white shadow-sm">
        <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex h-full items-center bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Turesma S.A · Transporte Turístico" className="h-16 sm:h-20 w-auto" />
          </div>

          {/* Menú Escritorio */}
          <div className="hidden items-center gap-8 md:flex">
            <a href="#nosotros" onClick={(event) => scrollToSection(event, "nosotros")} className="text-sm font-bold uppercase tracking-widest text-gray-600 transition-colors hover:text-[#E31E24]">Nosotros</a>
            <a href="#flota" onClick={(event) => scrollToSection(event, "flota")} className="text-sm font-bold uppercase tracking-widest text-gray-600 transition-colors hover:text-[#E31E24]">Flota</a>
            <a href="#servicios" onClick={(event) => scrollToSection(event, "servicios")} className="text-sm font-bold uppercase tracking-widest text-gray-600 transition-colors hover:text-[#E31E24]">Servicios</a>
            <a href="#contacto" onClick={(event) => scrollToSection(event, "contacto")} className="text-sm font-bold uppercase tracking-widest text-gray-600 transition-colors hover:text-[#E31E24]">Contacto</a>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Link href="/login" className="rounded-xl border-2 border-gray-100 px-6 py-2.5 text-sm font-bold text-gray-700 transition-all hover:border-[#E31E24] hover:text-[#E31E24]">
              Ingresar
            </Link>
            <Link href="/registro" className="rounded-xl bg-[#E31E24] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-200 transition-all hover:bg-black">
              Registrarse
            </Link>
          </div>

          <button type="button" className="text-[#E31E24] md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={32} /> : <MenuIcon size={32} />}
          </button>
        </div>

        {/* Menú Móvil */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-gray-100 p-6 space-y-4 shadow-xl animate-in slide-in-from-top duration-300">
            <a href="#nosotros" onClick={(event) => scrollToSection(event, "nosotros", true)} className="block text-lg font-bold text-gray-700 hover:text-[#E31E24]">Nosotros</a>
            <a href="#flota" onClick={(event) => scrollToSection(event, "flota", true)} className="block text-lg font-bold text-gray-700 hover:text-[#E31E24]">Flota</a>
            <a href="#servicios" onClick={(event) => scrollToSection(event, "servicios", true)} className="block text-lg font-bold text-gray-700 hover:text-[#E31E24]">Servicios</a>
            <a href="#contacto" onClick={(event) => scrollToSection(event, "contacto", true)} className="block text-lg font-bold text-gray-700 hover:text-[#E31E24]">Contacto</a>
            <div className="pt-4 flex flex-col gap-3">
              <Link href="/login" className="text-center rounded-xl border-2 border-gray-100 py-3 font-bold text-gray-700">Ingresar</Link>
              <Link href="/registro" className="text-center rounded-xl bg-[#E31E24] py-3 font-bold text-white">Registrarse</Link>
            </div>
          </div>
        )}
      </nav>

      {/* HERO SECTION */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">
        <div className="absolute inset-0 z-0 bg-[#0a0a0a]">
          <img
            src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=2069&auto=format&fit=crop"
            alt="Bus de turismo"
            className="h-full w-full object-cover opacity-40 transition-transform duration-[10s] hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent" />
        </div>
        
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:flex lg:items-center">
          <div className="lg:w-2/3">
            <h1 className="mb-6 text-5xl font-black leading-[1.1] tracking-tight text-white md:text-8xl italic">
              VIAJA CON <span className="text-yellow-400">EXCELENCIA.</span>
            </h1>
            <p className="mb-10 max-w-2xl text-xl font-medium leading-relaxed text-gray-300 md:text-2xl">
              Soluciones de transporte de alta gama en Manta. Puntualidad, confort y seguridad en cada kilómetro del Ecuador.
            </p>
            <div className="flex flex-wrap gap-4">
              <a href="#flota" onClick={(event) => scrollToSection(event, "flota")} className="group flex items-center gap-3 rounded-2xl bg-white px-8 py-4 font-black uppercase tracking-widest text-black transition-all hover:bg-yellow-400">
                Ver Flota <ChevronRight className="transition-transform group-hover:translate-x-1" />
              </a>
              <a href={`https://wa.me/${TELEFONO_EMPRESA}`} target="_blank" className="rounded-2xl border-2 border-white/20 bg-white/5 px-8 py-4 font-black uppercase tracking-widest text-white backdrop-blur-md transition-all hover:bg-white/10">
                Contactar Asesor
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN NOSOTROS */}
      <section id="nosotros" className="relative py-24 bg-white border-b border-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black italic tracking-tighter text-[#E31E24] md:text-6xl uppercase">Sobre Nosotros</h2>
            <div className="h-1.5 w-32 bg-yellow-400 rounded-full mt-2 mx-auto"></div>
            <p className="mt-6 text-xl text-gray-600 max-w-3xl mx-auto font-medium">
              En TURESMA S.A. redefinimos el transporte turístico con un compromiso inquebrantable con la seguridad y la elegancia. Desde Manta, servimos a todo el Ecuador.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
            {[
              { label: "Turismo VIP", icon: BriefcaseBusiness, color: "text-[#E31E24]", bg: "bg-red-50" },
              { label: "Seguridad 24/7", icon: BadgeCheck, color: "text-green-600", bg: "bg-green-50" },
              { label: "Puntualidad", icon: Clock3, color: "text-orange-500", bg: "bg-orange-50" },
              { label: "Logística", icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
            ].map((f, i) => (
              <div key={i} className="group text-center">
                <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[2rem] ${f.bg} transition-all group-hover:rotate-6 group-hover:scale-110`}>
                  <f.icon className={f.color} size={32} />
                </div>
                <h3 className="text-lg font-black uppercase tracking-tighter text-gray-800">{f.label}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECCIÓN FLOTA */}
      <section id="flota" className="bg-[#fcfcfc] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-black italic tracking-tighter text-[#E31E24] md:text-6xl uppercase">Nuestra Flota</h2>
            <div className="h-1.5 w-32 bg-yellow-400 rounded-full mt-2 mx-auto"></div>
            <p className="mt-4 text-gray-500 font-medium">Unidades disponibles para su servicio</p>
          </div>

          {loadingVehiculos ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#E31E24]" />
            </div>
          ) : vehiculos.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Bus size={48} className="mx-auto mb-4 opacity-30" />
              <p className="font-bold text-lg">Pronto agregaremos nuestra flota</p>
            </div>
          ) : (
            <div
              className="relative"
            >
              {/* Botón izquierda */}
              <button
                type="button"
                onClick={() => scrollFlota("left")}
                aria-label="Anterior"
                className="absolute left-0 top-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white p-3 text-[#E31E24] shadow-xl ring-1 ring-gray-200 transition-all hover:bg-[#E31E24] hover:text-white md:flex"
              >
                <ChevronLeft size={24} />
              </button>
              {/* Botón derecha */}
              <button
                type="button"
                onClick={() => scrollFlota("right")}
                aria-label="Siguiente"
                className="absolute right-0 top-1/2 z-20 hidden translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white p-3 text-[#E31E24] shadow-xl ring-1 ring-gray-200 transition-all hover:bg-[#E31E24] hover:text-white md:flex"
              >
                <ChevronRight size={24} />
              </button>

              {/* Carrusel horizontal */}
              <div
                ref={flotaRef}
                className="flota-carousel flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-4"
              >
                {vehiculos.map((v, index) => {
                  const estadoColor = v.estado === "disponible" ? "text-green-600" : v.estado === "en_servicio" ? "text-blue-600" : "text-amber-600";
                  const estadoLabel = v.estado === "disponible" ? "Disponible" : v.estado === "en_servicio" ? "En Servicio" : v.estado === "mantenimiento" ? "Mantenimiento" : "Inactivo";
                  return (
                    <div
                      key={v.id}
                      data-flota-card
                      className="flex w-[85%] flex-none snap-center flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xl transition-all hover:shadow-2xl hover:-translate-y-1 sm:w-[360px]"
                    >
                      <Image
                        src={v.imagen_url || IMAGEN_FALLBACK}
                        alt={`${v.tipo || "Vehículo"} ${v.placa}`}
                        width={720}
                        height={512}
                        sizes="(max-width: 640px) 85vw, 360px"
                        priority={index === 0}
                        className="h-56 w-full object-cover sm:h-64"
                      />
                      <div className="p-7 flex flex-col flex-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-green-600">
                          {v.capacidad ? `${v.capacidad} Pasajeros` : "Transporte"}
                        </span>
                        <h4 className="mt-2 text-2xl font-black italic text-gray-900">
                          {v.modelo || v.tipo || "Vehículo"}
                        </h4>
                        {v.descripcion && (
                          <p className="mt-2 text-sm text-gray-500 leading-relaxed flex-1">{v.descripcion}</p>
                        )}
                        <div className="mt-6 flex items-center justify-between border-t pt-6">
                          <span className={`text-xs font-bold uppercase ${estadoColor}`}>Estado: {estadoLabel}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400 uppercase bg-gray-50 px-2 py-1 rounded-lg">{v.placa}</span>
                            <Bus size={20} className="text-[#E31E24]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Controles móviles + hint */}
              <div className="mt-4 flex items-center justify-center gap-4 md:hidden">
                <button type="button" onClick={() => scrollFlota("left")} aria-label="Anterior" className="flex items-center justify-center rounded-full bg-white p-3 text-[#E31E24] shadow-lg ring-1 ring-gray-200 active:scale-95">
                  <ChevronLeft size={22} />
                </button>
                <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Desliza</span>
                <button type="button" onClick={() => scrollFlota("right")} aria-label="Siguiente" className="flex items-center justify-center rounded-full bg-white p-3 text-[#E31E24] shadow-lg ring-1 ring-gray-200 active:scale-95">
                  <ChevronRight size={22} />
                </button>
              </div>

              <style dangerouslySetInnerHTML={{ __html: `.flota-carousel::-webkit-scrollbar{height:8px}.flota-carousel::-webkit-scrollbar-thumb{background:#E31E24;border-radius:9999px}.flota-carousel::-webkit-scrollbar-track{background:transparent}` }} />
            </div>
          )}

          <div className="mt-12 text-center">
            <Link href="/login" className="inline-flex items-center gap-3 rounded-2xl bg-[#E31E24] px-8 py-4 font-black uppercase tracking-widest text-white shadow-lg shadow-red-200 transition-all hover:bg-black">
              Reservar un vehículo <ChevronRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* SECCIÓN GALERÍA DE VIAJES (fotos publicadas por el admin) */}
      {galeria.length > 0 && (
        <section id="galeria" className="py-24 bg-white border-t border-gray-50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-16 text-center">
              <h2 className="text-4xl font-black italic tracking-tighter text-[#E31E24] md:text-6xl uppercase">Nuestros Viajes</h2>
              <div className="h-1.5 w-32 bg-yellow-400 rounded-full mt-2 mx-auto"></div>
              <p className="mt-4 text-gray-500 font-medium">Momentos reales de nuestros recorridos por Manabí y todo el Ecuador</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {galeria.map((foto) => (
                <figure
                  key={foto.id}
                  className="group relative overflow-hidden rounded-3xl shadow-xl aspect-[4/3] bg-gray-100"
                >
                  <Image
                    src={foto.imagen_url}
                    alt={foto.titulo || "Viaje realizado por Turesma"}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    priority={foto.id === galeria[0]?.id}
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  {(foto.titulo || foto.descripcion) && (
                    <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-6 pt-16 translate-y-2 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                      {foto.titulo && (
                        <h3 className="text-lg font-black italic text-white uppercase tracking-tight">{foto.titulo}</h3>
                      )}
                      {foto.descripcion && (
                        <p className="mt-1 text-sm font-medium text-white/80 leading-snug">{foto.descripcion}</p>
                      )}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SECCIÓN SERVICIOS */}
      <section id="servicios" className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
           <div className="mb-16 text-center">
             <h2 className="text-4xl font-black italic tracking-tighter text-[#E31E24] md:text-6xl uppercase">Servicios Premium</h2>
             <div className="h-1.5 w-32 bg-yellow-400 rounded-full mt-2 mx-auto"></div>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-[2rem] bg-gray-50 border-b-4 border-[#E31E24] hover:bg-gray-100 transition-all">
              <h3 className="text-2xl font-black italic text-gray-900 mb-4 uppercase">Traslados Ejecutivos</h3>
              <p className="text-gray-600 font-medium leading-relaxed">Puntualidad absoluta para viajes de negocios, traslados al aeropuerto y logística corporativa.</p>
            </div>
            <div className="p-8 rounded-[2rem] bg-gray-50 border-b-4 border-yellow-400 hover:bg-gray-100 transition-all">
              <h3 className="text-2xl font-black italic text-gray-900 mb-4 uppercase">Tours Turísticos</h3>
              <p className="text-gray-600 font-medium leading-relaxed">Guías certificados y rutas personalizadas por la costa manabita y todo el Ecuador.</p>
            </div>
            <div className="p-8 rounded-[2rem] bg-gray-50 border-b-4 border-green-600 hover:bg-gray-100 transition-all">
              <h3 className="text-2xl font-black italic text-gray-900 mb-4 uppercase">Logística de Eventos</h3>
              <p className="text-gray-600 font-medium leading-relaxed">Coordinación de transporte para congresos, bodas y eventos institucionales masivos.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN MISIÓN - FRASE PRINCIPAL */}
      <section className="relative py-32 overflow-hidden bg-gradient-to-r from-[#0a0a1a] via-[#0f1a2e] to-[#0a0a1a]">
        {/* Efectos de fondo */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-[#E31E24]/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-yellow-400/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center min-h-[500px] text-center">
          {/* Frase principal con comillas pegadas al texto */}
          <div className="max-w-4xl mb-8">
            <p className="text-2xl md:text-4xl font-black italic text-white leading-tight tracking-tight drop-shadow-lg">
              <span className="text-yellow-400">&ldquo;</span>Cada viaje es una oportunidad para llegar más lejos, no solo en distancia, sino en confianza<span className="text-yellow-400">&rdquo;</span>
            </p>
          </div>

          {/* Frase secundaria */}
          <div className="mb-8">
            <p className="text-lg md:text-2xl font-bold italic text-yellow-400 leading-tight tracking-tight drop-shadow-lg">
              Impulsamos caminos, conectamos sueños.
            </p>
          </div>

          {/* Subtítulo con gerencia */}
          <div>
            <p className="text-sm md:text-lg font-black uppercase text-yellow-400 tracking-[0.3em]">
              GERENCIA, TURESMA MANTA
            </p>
          </div>
        </div>
      </section>

      {/* SECCIÓN INFORMATIVA (REEMPLAZO DE FORMULARIO) */}
      <section id="contacto" className="py-24 bg-[#fcfcfc]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[3rem] bg-gray-900 shadow-2xl lg:flex min-h-[500px]">
            
            {/* LADO IZQUIERDO: MARCA */}
            <div className="bg-[#E31E24] p-8 sm:p-12 lg:w-1/2 flex flex-col justify-center text-white relative">
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-yellow-400/20 blur-3xl" />

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black italic tracking-tighter mb-6 uppercase leading-none">
                VIAJA SEGURO,<br />
                <span className="text-yellow-400">VIAJA CON TURESMA.</span>
              </h2>
              <p className="text-xl font-medium opacity-90 mb-10 leading-relaxed max-w-md">
                Líderes en transporte turístico en Manta. Calidad garantizada para cada pasajero.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4 bg-black/10 p-4 rounded-2xl border border-white/10 hover:bg-black/20 transition-all">
                  <div className="bg-yellow-400 p-3 rounded-xl text-black shadow-lg"><MapPin size={24} /></div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Ubicación</p>
                    <p className="font-bold">Manta, Manabí, Ecuador</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 bg-black/10 p-4 rounded-2xl border border-white/10 hover:bg-black/20 transition-all">
                  <div className="bg-white p-3 rounded-xl text-[#E31E24] shadow-lg"><Mail size={24} /></div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Email Oficial</p>
                    <p className="font-bold">turesmasa@hotmail.com</p>
                  </div>
                </div>
              </div>
            </div>

            {/* LADO DERECHO: VITRINA INFORMATIVA */}
            <div className="p-12 lg:w-1/2 bg-white flex flex-col justify-center">
              <h3 className="text-3xl font-black italic text-gray-900 mb-8 uppercase tracking-tighter border-l-4 border-[#E31E24] pl-4">
                ¿Por qué elegirnos?
              </h3>
              
              <div className="grid gap-6">
                {[
                  { title: "Rastreo Satelital GPS", desc: "Seguridad total en tiempo real para todas nuestras unidades.", icon: <ShieldCheck className="text-[#E31E24]" /> },
                  { title: "Seguros de Pasajeros", desc: "Cobertura completa y cumplimiento de toda la normativa legal.", icon: <BadgeCheck className="text-green-600" /> },
                  { title: "Atención 24 Horas", desc: "Soporte y coordinación logística los 365 días del año.", icon: <Activity className="text-blue-600" /> }
                ].map((item, index) => (
                  <div key={index} className="flex gap-4 p-5 rounded-2xl border border-gray-100 hover:shadow-xl transition-all duration-300">
                    <div className="mt-1 shrink-0">{item.icon}</div>
                    <div>
                      <h4 className="font-black text-gray-800 uppercase text-sm tracking-tight">{item.title}</h4>
                      <p className="text-gray-500 text-sm font-medium leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10">
                <a 
                  href={`https://wa.me/${TELEFONO_EMPRESA}`} 
                  target="_blank"
                  className="flex items-center justify-center gap-3 w-full bg-black text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-[#E31E24] transition-all shadow-xl shadow-gray-200"
                >
                  Conocer más servicios
                  <ChevronRight size={20} className="text-yellow-400" />
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* SECCIÓN FAQ */}
      <section className="bg-[#f1f3f6] py-12 md:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 text-center md:mb-8">
            <h2 className="text-2xl font-black italic uppercase tracking-tighter text-[#E31E24] md:text-4xl">
              Preguntas Frecuentes
            </h2>
            <div className="mx-auto mt-2 h-1.5 w-32 rounded-full bg-yellow-400" />
            <p className="mx-auto mt-3 max-w-2xl text-sm font-medium text-gray-700 md:text-base">
              Resolvemos las dudas más comunes para que reserves con más rapidez y confianza.
            </p>
          </div>

          <div className="mx-auto grid w-full max-w-4xl gap-2.5">
            {[
              {
                question: "¿Cómo hago una reserva?",
                answer:
                  "Puedes reservar por medio de nuestro sistema web o  WhatsApp o con un asesor. Solo necesitamos fecha, hora, origen, destino y cantidad de pasajeros para confirmar tu unidad.",
              },
              {
                question: "¿Atienden viajes dentro y fuera de Manta?",
                answer:
                  "Sí. Operamos en Manta y realizamos traslados a nivel provincial y nacional, según disponibilidad y planificación de ruta.",
              },
              {
                question: "¿Qué tipo de vehículos ofrecen?",
                answer:
                  "Contamos con sedanes ejecutivos, SUVs y furgonetas para grupos. Te recomendamos la opción ideal según el número de pasajeros y el tipo de viaje.",
              },
              {
                question: "¿Puedo pedir una cotización antes de reservar?",
                answer:
                  "Claro. Te enviamos una cotización previa sin compromiso para que conozcas tarifas, condiciones y tiempos estimados.",
              },
            ].map((faq, index) => {
              const isOpen = openFaqIndex === index;

              return (
                <article
                  key={index}
                  className={`rounded-xl border bg-white px-4 py-5 shadow-sm transition-all duration-500 ${
                    isOpen ? "border-[#E31E24]/30 shadow-md" : "border-gray-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex((current) => (current === index ? null : index))}
                    aria-expanded={isOpen}
                    className="relative flex w-full items-center pr-7 text-[#0b1220] focus-visible:outline-none"
                  >
                    <span className="block w-full text-left text-base font-black italic uppercase tracking-tight md:text-[1.1rem]">
                      {faq.question}
                    </span>
                    <ChevronRight
                      className={`absolute right-0 top-1/2 shrink-0 -translate-y-1/2 text-gray-500 transition-transform duration-500 ${isOpen ? "rotate-90" : "rotate-0"}`}
                      size={20}
                    />
                  </button>

                  <div
                    className={`grid overflow-hidden transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)] ${
                      isOpen ? "mt-4 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="translate-y-0 text-xs font-medium leading-relaxed text-gray-600 transition-transform duration-500 md:text-sm">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#1a2a49] bg-[#030f26] text-white">
        <div className="mx-auto grid max-w-7xl gap-7 px-6 py-9 md:grid-cols-[1.15fr_1fr_0.8fr] md:gap-9 md:px-8">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-[#E31E24] p-1.5 shadow-lg shadow-red-700/30">
                <Bus size={16} className="text-white" />
              </div>
              <span className="text-3xl font-black italic tracking-tight text-[#ff2f35] md:text-4xl">TURESMA S.A</span>
            </div>
            <p className="max-w-sm text-sm font-medium leading-relaxed text-white/90 md:text-[1.2rem]">
              Transporte turístico premium con base en Manta, sirviendo todo el Ecuador.
            </p>
          </div>

          <div className="md:pl-7">
            <h4 className="mb-4 text-2xl font-black italic uppercase tracking-tight text-yellow-400 md:text-3xl">Contacto</h4>
            <ul className="space-y-2.5 text-sm text-white/95 md:text-[1.1rem]">
              <li className="flex items-center gap-3">
                <Phone size={16} className="text-white/80" />
                <span>{TELEFONO_EMPRESA_DISPLAY}</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail size={16} className="text-white/80" />
                <span>turesmasa@hotmail.com</span>
              </li>
              <li className="flex items-center gap-3">
                <MapPin size={16} className="text-white/80" />
                <span>Manta, Manabí, Ecuador</span>
              </li>
            </ul>
          </div>

          <div className="md:justify-self-end">
            <h4 className="mb-4 text-2xl font-black italic uppercase tracking-tight text-yellow-400 md:text-3xl">Enlaces</h4>
            <div className="flex flex-col gap-2 text-sm font-medium uppercase md:text-[1.1rem]">
              <a href="#nosotros" onClick={(event) => scrollToSection(event, "nosotros")} className="text-white/95 transition-colors hover:text-[#ff2f35]">Nosotros</a>
              <a href="#flota" onClick={(event) => scrollToSection(event, "flota")} className="text-white/95 transition-colors hover:text-[#ff2f35]">Flota</a>
              <a href="#servicios" onClick={(event) => scrollToSection(event, "servicios")} className="text-white/95 transition-colors hover:text-[#ff2f35]">Servicios</a>
              <a href="#contacto" onClick={(event) => scrollToSection(event, "contacto")} className="text-white/95 transition-colors hover:text-[#ff2f35]">Contacto</a>
            </div>
          </div>
        </div>

      </footer>

      {/* BOTONES FLOTANTES */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-8 right-8 z-50 rounded-2xl bg-black p-4 text-white shadow-2xl transition-all hover:bg-[#E31E24] ${showScrollTop ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0"}`}
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
      </button>

      <a
        href={`https://wa.me/${TELEFONO_EMPRESA}`}
        target="_blank"
        className="fixed bottom-8 left-8 z-50 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#25D366] text-white shadow-2xl transition-transform hover:scale-110 active:scale-95"
      >
        <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24"><path d="M20.52 3.48A11.86 11.86 0 0 0 12.04 0C5.4 0 .01 5.39 0 12.02c0 2.1.55 4.16 1.6 5.98L0 24l6.16-1.58a11.95 11.95 0 0 0 5.85 1.49h.01c6.63 0 12.02-5.39 12.03-12.02 0-3.22-1.25-6.24-3.53-8.41ZM12.02 21.4h-.01a9.4 9.4 0 0 1-4.78-1.3l-.34-.2-3.66.94.98-3.57-.22-.37a9.42 9.42 0 0 1-1.45-5.03c.01-5.21 4.25-9.45 9.47-9.45 2.53 0 4.9.99 6.68 2.77a9.36 9.36 0 0 1 2.77 6.68c-.01 5.22-4.25 9.46-9.44 9.46Zm5.47-7.46c-.3-.15-1.78-.88-2.06-.98-.28-.1-.48-.15-.68.15-.2.3-.78.98-.95 1.18-.17.2-.35.23-.65.08-.3-.15-1.26-.46-2.4-1.48-.89-.8-1.49-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.08-.15-.68-1.64-.93-2.24-.24-.58-.49-.5-.68-.51h-.58c-.2 0-.53.07-.81.37-.28.3-1.05 1.02-1.05 2.49 0 1.47 1.08 2.89 1.23 3.09.15.2 2.11 3.23 5.11 4.53.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.11.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.3.18-1.43-.07-.13-.27-.2-.57-.35Z" /></svg>
      </a>
    </main>
  );
}