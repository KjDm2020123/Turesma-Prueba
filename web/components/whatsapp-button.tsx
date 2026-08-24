"use client";

import { MessageCircle } from "lucide-react";

// Normaliza un teléfono ecuatoriano al formato internacional que exige wa.me
// (solo dígitos, con código de país). Ej: "099 123 4567" → "593991234567".
export const toWhatsAppNumber = (raw?: string | null): string | null => {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("593")) return digits;
  if (digits.startsWith("0")) return "593" + digits.slice(1);
  if (digits.length === 9) return "593" + digits;
  return digits;
};

type Props = {
  telefono?: string | null;
  // Mensaje inicial opcional que se precarga en el chat de WhatsApp.
  mensaje?: string;
  // "icon" = botón circular compacto (tablas). "full" = botón ancho con texto.
  variant?: "icon" | "full";
  title?: string;
};

// Botón verde de WhatsApp. Si el teléfono no es válido, no renderiza nada.
export function WhatsAppButton({ telefono, mensaje, variant = "icon", title }: Props) {
  const numero = toWhatsAppNumber(telefono);
  if (!numero) return null;

  const url = `https://wa.me/${numero}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ""}`;

  if (variant === "full") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe5b] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-green-200 transition-all">
        <MessageCircle size={14} className="fill-white/20" />
        WhatsApp
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={title || "Escribir por WhatsApp"}
      aria-label={title || "Escribir por WhatsApp"}
      className="inline-flex items-center justify-center p-2 rounded-xl bg-[#25D366]/10 text-[#1ebe5b] hover:bg-[#25D366] hover:text-white transition-all">
      <MessageCircle size={15} />
    </a>
  );
}
