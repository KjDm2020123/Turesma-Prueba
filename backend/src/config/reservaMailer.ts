export {};

const pool = require("./db");
const { enviarCorreo } = require("./mailer");
const { crearNotificacion, notificarAdmins } = require("./notificaciones");

type TipoEvento = "confirmada" | "conductor_asignado" | "en_curso" | "finalizada" | "cancelada";

// Texto corto para la campanita (in-app) y asunto/mensaje del correo por evento.
const PLANTILLAS: Record<TipoEvento, { inApp: string; asunto: string; titulo: string; cuerpo: string }> = {
  confirmada: {
    inApp: "✅ Tu reserva #{id} está CONFIRMADA. Prepárate para tu viaje.",
    asunto: "Tu reserva en Turesma está confirmada ✅",
    titulo: "¡Reserva confirmada!",
    cuerpo: "Tu pago fue verificado y tu reserva quedó <b>confirmada</b>. Pronto un conductor te atenderá.",
  },
  conductor_asignado: {
    inApp: "🚗 Un conductor aceptó tu reserva #{id}. ¡Tu viaje está confirmado!",
    asunto: "Un conductor tomó tu viaje 🚗",
    titulo: "Conductor asignado",
    cuerpo: "Un conductor aceptó tu reserva y está listo para tu viaje. Aquí están los datos:",
  },
  en_curso: {
    inApp: "🟢 ¡Tu viaje #{id} ha comenzado! Sigue la ubicación en vivo.",
    asunto: "Tu viaje ha comenzado 🟢",
    titulo: "Viaje en curso",
    cuerpo: "Tu viaje acaba de comenzar. Puedes seguir la ubicación en vivo desde tu portal.",
  },
  finalizada: {
    inApp: "🏁 Tu viaje #{id} ha FINALIZADO. ¡Califica tu experiencia!",
    asunto: "Tu viaje finalizó — cuéntanos cómo te fue 🏁",
    titulo: "Viaje finalizado",
    cuerpo: "Tu viaje ha finalizado. ¡Gracias por viajar con Turesma! Te invitamos a calificar tu experiencia.",
  },
  cancelada: {
    inApp: "❌ Tu reserva #{id} fue cancelada. Contáctanos si necesitas ayuda.",
    asunto: "Tu reserva fue cancelada",
    titulo: "Reserva cancelada",
    cuerpo: "Lamentamos informarte que tu reserva fue cancelada. Si tienes dudas, contáctanos.",
  },
};

const fmtFecha = (f: any) => {
  if (!f) return "—";
  try { return new Date(f).toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return String(f); }
};

// Correo de contacto y pie estándar (mensaje automático) para todos los correos.
const CONTACTO_EMAIL = "turesmasa@hotmail.com";
const PIE_HTML = `<p style="margin:22px 0 0;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;">Este mensaje se envió de forma automática. Para más información comunícate al correo <a href="mailto:${CONTACTO_EMAIL}" style="color:#9ca3af;">${CONTACTO_EMAIL}</a>.</p>`;
const PIE_TEXTO = `\n\n— Este mensaje se envió de forma automática. Para más información comunícate al correo ${CONTACTO_EMAIL}.`;

// Plantilla de correo con la identidad de Turesma (rojo + datos del viaje).
const construirHtml = (tipo: TipoEvento, d: any) => {
  const p = PLANTILLAS[tipo];
  const fila = (label: string, valor: string) =>
    valor ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">${label}</td><td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;text-align:right;">${valor}</td></tr>` : "";
  return `
  <div style="max-width:520px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="background:#0b0f1a;padding:24px;border-radius:16px 16px 0 0;text-align:center;">
      <span style="color:#E31E24;font-size:22px;font-weight:800;font-style:italic;letter-spacing:-1px;">TURESMA S.A</span>
      <div style="color:#9ca3af;font-size:10px;letter-spacing:3px;margin-top:2px;">TRANSPORTE TURÍSTICO</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:28px;">
      <h2 style="margin:0 0 8px;font-size:20px;">${p.titulo}</h2>
      <p style="margin:0 0 18px;color:#374151;font-size:14px;line-height:1.5;">Hola ${d.cliente_nombre || "cliente"}, ${p.cuerpo}</p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #f3f4f6;">
        ${fila("Reserva", "#" + d.id)}
        ${fila("Origen", d.origen)}
        ${fila("Destino", d.destino)}
        ${fila("Fecha", fmtFecha(d.fecha_reserva))}
        ${fila("Vehículo", d.vehiculo_placa ? `${d.vehiculo_placa}${d.vehiculo_modelo ? " · " + d.vehiculo_modelo : ""}` : "")}
        ${fila("Conductor", d.conductor_nombre)}
        ${fila("Total", d.total != null ? "$" + Number(d.total).toFixed(2) : "")}
      </table>
      ${PIE_HTML}
    </div>
  </div>`;
};

// Notifica al CLIENTE de un cambio de estado de su reserva: crea la notificación
// in-app (campanita) y envía el correo. Todo best-effort: si algo falla, se
// registra pero NO se interrumpe la operación que la disparó.
const notificarClienteReserva = async (reservaId: number, tipo: TipoEvento, senderId: number | null | undefined) => {
  try {
    const r = await pool.query(
      `SELECT r.id, r.origen, r.destino, r.fecha_reserva, r.total, r.usuario_id,
              u.nombre AS cliente_nombre, u.email AS cliente_email,
              v.placa AS vehiculo_placa, v.modelo AS vehiculo_modelo,
              c.nombre AS conductor_nombre
       FROM reservas r
       JOIN usuarios u ON u.id = r.usuario_id
       LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
       LEFT JOIN usuarios c ON c.id = r.conductor_id
       WHERE r.id = $1
       LIMIT 1`,
      [reservaId]
    );
    if (r.rowCount === 0) return;
    const d = r.rows[0];
    const p = PLANTILLAS[tipo];
    if (!p) return;

    // 1) Notificación in-app (campanita del cliente)
    await crearNotificacion(senderId, d.usuario_id, p.inApp.replace("{id}", String(reservaId)), reservaId, "reserva", reservaId);

    // 2) Correo (si el cliente tiene email y el SMTP está configurado).
    //    Cuando la reserva queda CONFIRMADA, se adjunta el PDF de la proforma.
    if (d.cliente_email) {
      let attachments: any[] | undefined;
      if (tipo === "confirmada") {
        try {
          const { getCotizacionIdDeReserva, buildProformaData, generarProformaPDF } = require("./proforma");
          const cotId = await getCotizacionIdDeReserva(reservaId);
          if (cotId) {
            const prof = await buildProformaData(cotId);
            if (prof) {
              const pdf = await generarProformaPDF(prof);
              attachments = [{ filename: `Proforma-${prof.numero}.pdf`, content: pdf }];
            }
          }
        } catch (err: any) {
          console.error("No se pudo adjuntar la proforma:", err?.message || err);
        }
      }
      await enviarCorreo({
        to: d.cliente_email,
        subject: p.asunto,
        html: construirHtml(tipo, d),
        text: p.inApp.replace("{id}", String(reservaId)) + PIE_TEXTO,
        attachments,
      });
    }
  } catch (e: any) {
    console.error("Error notificando al cliente (reserva " + reservaId + "):", e?.message || e);
  }
};

// El cliente reprogramó su reserva: correo de confirmación al cliente + aviso
// in-app al admin y al conductor con la nueva fecha/hora. Todo best-effort.
const notificarReprogramacion = async (reservaId: number, senderId: number | null | undefined) => {
  try {
    const r = await pool.query(
      `SELECT r.id, r.origen, r.destino, r.fecha_reserva, r.usuario_id, r.conductor_id,
              u.nombre AS cliente_nombre, u.email AS cliente_email,
              co.hora_salida
       FROM reservas r
       JOIN usuarios u ON u.id = r.usuario_id
       LEFT JOIN cotizaciones co ON co.reserva_id = r.id
       WHERE r.id = $1 LIMIT 1`,
      [reservaId]
    );
    if (r.rowCount === 0) return;
    const d = r.rows[0];
    const cuando = `${fmtFecha(d.fecha_reserva)}${d.hora_salida ? " · " + d.hora_salida : ""}`;

    // 1) Correo al cliente (confirmando su cambio)
    if (d.cliente_email) {
      const html = `
        <div style="max-width:520px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#111827;">
          <div style="background:#0b0f1a;padding:24px;border-radius:16px 16px 0 0;text-align:center;">
            <span style="color:#E31E24;font-size:22px;font-weight:800;font-style:italic;letter-spacing:-1px;">TURESMA S.A</span>
            <div style="color:#9ca3af;font-size:10px;letter-spacing:3px;margin-top:2px;">TRANSPORTE TURÍSTICO</div>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:28px;">
            <h2 style="margin:0 0 12px;font-size:20px;">Cambio en tu reserva 🗓️</h2>
            <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">Hola ${d.cliente_nombre || "cliente"}, registramos el cambio en tu reserva <b>#${reservaId}</b> (${d.origen} → ${d.destino}).</p>
            <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">Tu nueva <b>fecha y hora de salida</b> es:</p>
            <p style="margin:0 0 12px;font-size:18px;font-weight:800;color:#0b0f1a;">${cuando}</p>
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">Ya avisamos al conductor y al equipo de Turesma. ¡Buen viaje! 🚐</p>
            ${PIE_HTML}
          </div>
        </div>`;
      await enviarCorreo({
        to: d.cliente_email,
        subject: "Cambiaste la fecha/hora de tu reserva — Turesma",
        html,
        text: `Cambiaste tu reserva #${reservaId}. Nueva salida: ${cuando}.` + PIE_TEXTO,
      });
    }

    // 2) Aviso in-app al admin
    await notificarAdmins(
      senderId,
      `${d.cliente_nombre || "Un cliente"} reprogramó la reserva #${reservaId} (${d.origen} → ${d.destino}). Nueva salida: ${cuando}.`,
      "reserva",
      reservaId
    );

    // 3) Aviso in-app al conductor (reservas.conductor_id → usuarios.id)
    if (d.conductor_id) {
      await crearNotificacion(
        senderId,
        d.conductor_id,
        `La reserva #${reservaId} fue reprogramada. Nueva salida: ${cuando}. Revisa tu agenda.`,
        reservaId,
        "reserva",
        reservaId
      );
    }
  } catch (e: any) {
    console.error("Error notificando reprogramación (reserva " + reservaId + "):", e?.message || e);
  }
};

module.exports = { notificarClienteReserva, notificarReprogramacion };
