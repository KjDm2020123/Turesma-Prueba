"use client";

import { Bot, MessageCircleMore, Send, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const quickSuggestions = [
  "¿Cuánto cuesta un Van?",
  "¿Hay oferta del día?",
  "¿Qué tipo de vehículo me recomienda?",
  "¿Cómo cotizo?",
  "¿Dónde veo mi historial?",
];

const faqAnswers = [
  {
    keywords: ["van", "bus", "suv", "minibus", "sedan", "tipo de vehiculo", "tipo de vehículo", "vehicle"],
    answer:
      "Tenemos tarifas diferenciadas por tipo de vehículo: Van, Bus, SUV, Minibus y Sedan. El precio cambia según capacidad, tipo de ruta y si aplica la oferta del día. Puedes verlo en la cotización antes de enviar tu solicitud.",
  },
  {
    keywords: ["oferta", "descuento", "promo", "dia", "del dia", "oferta del dia"],
    answer:
      "La oferta del día depende de la configuración del administrador. Si está activa, se verá reflejada en el cálculo del total y aparecerá como descuento en la estimación.",
  },
  {
    keywords: ["cotizar", "precio", "presupuesto", "valor", "cuanto cuesta", "costo"],
    answer:
      "Para cotizar, completa origen, destino, fecha, pasajeros y tipo de vehículo. El sistema calcula el costo real con los precios vigentes y te muestra una estimación antes de enviar la solicitud.",
  },
  {
    keywords: ["pago", "tarjeta", "metodo", "cuotas", "abonar", "factura"],
    answer:
      "Los pagos se gestionan desde la reserva o la sección de Pagos del cliente. Si quieres revisar una duda sobre un cobro, revisa el detalle de la reserva y el historial antes de pedir ayuda.",
  },
  {
    keywords: ["historial", "viajes", "reservas", "mis viajes", "anteriores"],
    answer:
      "Puedes ver todas tus reservas y viajes en la sección Historial del cliente, donde aparece el estado actual y los datos del servicio.",
  },
  {
    keywords: ["perfil", "datos", "nombre", "telefono", "editar", "modificar"],
    answer:
      "Tu perfil se administra desde la opción Perfil. Desde ahí puedes revisar tus datos personales, imagen y la información asociada a tus viajes y cotizaciones.",
  },
  {
    keywords: ["cancelar", "reprogramar", "cambiar fecha", "modificar reserva", "anular"],
    answer:
      "Si necesitas cambiar o cancelar una reserva, lo mejor es hacerlo desde la reserva activa o comunicarte con el equipo para revisar la fecha y el estado del servicio.",
  },
  {
    keywords: ["estado", "pendiente", "confirmada", "en curso", "cancelada", "aprobada"],
    answer:
      "Los estados indican el avance del servicio: pendiente está en revisión, aprobada o confirmada quedó listo, en curso ya está activo y cancelada fue anulada.",
  },
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getBotReply(input: string) {
  const cleanInput = normalizeText(input);

  if (!cleanInput) {
    return "Escribe tu consulta y te ayudaré con la información más importante.";
  }

  for (const item of faqAnswers) {
    const hasMatch = item.keywords.some((keyword) => cleanInput.includes(keyword));
    if (hasMatch) {
      return item.answer;
    }
  }

  if (cleanInput.includes("gracias") || cleanInput.includes("hola") || cleanInput.includes("buenas")) {
    return "¡Hola! Puedo ayudarte con cotizaciones, precios por tipo de vehículo, oferta del día, reservas, historial y pagos. ¿Qué quieres revisar?";
  }

  if (cleanInput.includes("cuanto") || cleanInput.includes("precio") || cleanInput.includes("costo")) {
    return "Los precios dependen del tipo de vehículo, la cantidad de pasajeros, la ruta y la fecha. Puedes ver la estimación en la cotización y también consultar los tipos disponibles: Van, Bus, SUV, Minibus y Sedan.";
  }

  return "Puedo ayudarte con cotizaciones, pagos, reservas, historial, tipos de vehículo y oferta del día. Intenta preguntarme algo como: '¿Cuánto cuesta un Van?', '¿Hay oferta?', o '¿Cómo cotizo?'";
}

export function ClienteChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "¡Hola! Soy tu asistente de Turesma. Puedo ayudarte con cotizaciones, pagos, reservas, historial y perfil. ¿En qué te puedo apoyar?",
    },
  ]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sendMessage = (value: string) => {
    const text = value.trim();
    if (!text) return;

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      text,
    };

    const assistantMessage: ChatMessage = {
      id: `${Date.now()}-assistant`,
      role: "assistant",
      text: getBotReply(text),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <div className="w-[360px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
          <div className="flex items-center justify-between border-b border-slate-200 bg-[#111827] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E31E24]">
                <Bot size={18} />
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em]">Asistente</p>
                <p className="text-[10px] text-slate-300">TURESMA</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Cerrar chatbot"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex max-h-[420px] flex-col gap-3 bg-slate-50 p-3">
            <div className="flex flex-wrap gap-2">
              {quickSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendMessage(suggestion)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-[#E31E24] hover:text-[#E31E24]"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="flex max-h-[260px] min-h-[200px] flex-col gap-3 overflow-y-auto pr-1">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                    message.role === "assistant"
                      ? "bg-white text-slate-700 border border-slate-200"
                      : "ml-auto bg-[#E31E24] text-white"
                  }`}
                >
                  {message.text}
                </div>
              ))}
            </div>

            <form
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2"
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage(input);
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Escribe tu duda..."
                className="flex-1 border-0 bg-transparent px-2 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E31E24] text-white transition hover:bg-[#c71a20]"
                aria-label="Enviar mensaje"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-3 rounded-full bg-[#111827] px-4 py-3 text-white shadow-[0_20px_45px_rgba(17,24,39,0.35)] transition hover:scale-[1.02] hover:bg-[#1f2937]"
          aria-label="Abrir chatbot"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E31E24] text-white">
            <MessageCircleMore size={20} />
          </span>
          <span className="hidden sm:flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em]">
            <Sparkles size={14} className="text-yellow-300" />
            Ayuda
          </span>
        </button>
      )}
    </div>
  );
}
