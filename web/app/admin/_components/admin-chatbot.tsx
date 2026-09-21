"use client";

import { Bot, Send, Sparkles, X } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { getAuthHeaders } from "../../../lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Message = { id: string; role: "assistant" | "user"; text: string };

const suggestions = ["¿Cómo está la flota?", "¿Qué mantenimientos requieren atención?", "¿Qué operaciones están pendientes?", "¿Cómo están los pagos del mes?"];

export function AdminChatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", text: "Soy el asistente operativo de TURESMA. Puedo consultar flota, operaciones, conductores, mantenimiento, pagos, clientes y cotizaciones con datos actuales del sistema." },
  ]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sendMessage = async (eventOrValue: FormEvent | string) => {
    if (typeof eventOrValue !== "string") eventOrValue.preventDefault();
    const question = (typeof eventOrValue === "string" ? eventOrValue : input).trim();
    if (!question || loading) return;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setMessages((previous) => [...previous, { id: `${id}-user`, role: "user", text: question }]);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/admin/chatbot`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo consultar al asistente");
      setMessages((previous) => [...previous, {
        id: `${id}-assistant`,
        role: "assistant",
        text: data.answer,
      }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo consultar al asistente");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <section className="w-[390px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]" aria-label="Asistente operativo administrativo">
          <header className="flex items-center justify-between bg-slate-950 px-4 py-3 text-white">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 text-slate-950"><Bot size={20} /></span><div><p className="text-sm font-black">Asistente operativo</p></div></div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Cerrar asistente"><X size={17} /></button>
          </header>
          <div className="max-h-[510px] space-y-3 overflow-y-auto bg-slate-50 p-3">
            <div className="flex flex-wrap gap-2">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void sendMessage(suggestion)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:border-cyan-400 hover:text-cyan-700">{suggestion}</button>)}</div>
            <div className="space-y-3">{messages.map((message) => <div key={message.id} className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed shadow-sm ${message.role === "assistant" ? "border border-slate-200 bg-white text-slate-700" : "ml-auto bg-slate-950 text-white"}`}><p>{message.text}</p></div>)}</div>
            {loading && <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Sparkles size={14} className="text-cyan-500" /> Consultando datos operativos...</div>}
            {error && <p className="rounded-xl bg-red-50 p-2 text-xs font-semibold text-red-700">{error}</p>}
            <form onSubmit={(event) => void sendMessage(event)} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2"><input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Pregunta sobre la operación..." className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400" /><button type="submit" disabled={loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-slate-950 hover:bg-cyan-300 disabled:opacity-50" aria-label="Enviar pregunta"><Send size={16} /></button></form>
          </div>
        </section>
      ) : <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-3 rounded-full bg-slate-950 px-4 py-3 text-white shadow-xl hover:bg-slate-800" aria-label="Abrir asistente operativo"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-400 text-slate-950"><Bot size={21} /></span><span className="hidden text-xs font-black uppercase tracking-widest sm:block">Asistente</span></button>}
    </div>
  );
}
