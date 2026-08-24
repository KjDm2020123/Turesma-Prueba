export {};

const { enviarCorreo } = require("./mailer");

// Plantilla base con la identidad de Turesma (encabezado oscuro + rojo).
const wrap = (titulo: string, cuerpoHtml: string) => `
  <div style="max-width:520px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="background:#0b0f1a;padding:24px;border-radius:16px 16px 0 0;text-align:center;">
      <span style="color:#E31E24;font-size:22px;font-weight:800;font-style:italic;letter-spacing:-1px;">TURESMA S.A</span>
      <div style="color:#9ca3af;font-size:10px;letter-spacing:3px;margin-top:2px;">TRANSPORTE TURÍSTICO</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:28px;">
      <h2 style="margin:0 0 12px;font-size:20px;">${titulo}</h2>
      ${cuerpoHtml}
      <p style="margin:22px 0 0;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;">Este mensaje se envió de forma automática. Para más información comunícate al correo <a href="mailto:turesmasa@hotmail.com" style="color:#9ca3af;">turesmasa@hotmail.com</a>.</p>
    </div>
  </div>`;

// Correo de bienvenida cuando un cliente crea su cuenta. Best-effort.
const enviarCorreoBienvenida = async ({ email, nombre }: { email?: string | null; nombre?: string | null }) => {
  if (!email) return;
  const html = wrap("¡Bienvenido a Turesma! 🚌", `
    <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">Hola ${nombre || "cliente"}, tu cuenta en <b>Turesma</b> fue creada correctamente. 🎉</p>
    <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">Ya puedes iniciar sesión y solicitar cotizaciones para tus viajes. Para reservar, primero verifica tu identidad subiendo tu cédula desde tu perfil.</p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">¡Gracias por unirte! 🚀</p>
  `);
  await enviarCorreo({
    to: email,
    subject: "Tu cuenta en Turesma fue creada ✅",
    html,
    text: `Hola ${nombre || "cliente"}, tu cuenta en Turesma fue creada correctamente. Ya puedes iniciar sesión.\n\n— Este mensaje se envió de forma automática. Para más información comunícate al correo turesmasa@hotmail.com.`,
  });
};

// Correo cuando el admin aprueba la verificación de identidad del cliente. Best-effort.
const enviarCorreoVerificacionAprobada = async ({ email, nombre }: { email?: string | null; nombre?: string | null }) => {
  if (!email) return;
  const html = wrap("Identidad verificada ✅", `
    <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">Hola ${nombre || "cliente"}, ¡buenas noticias! Tu identidad fue <b>verificada</b> por nuestro equipo.</p>
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">Ya puedes solicitar y confirmar tus servicios en Turesma sin restricciones. 🚗</p>
  `);
  await enviarCorreo({
    to: email,
    subject: "Tu identidad fue verificada en Turesma ✅",
    html,
    text: `Hola ${nombre || "cliente"}, tu identidad fue verificada. Ya puedes solicitar tus servicios en Turesma.\n\n— Este mensaje se envió de forma automática. Para más información comunícate al correo turesmasa@hotmail.com.`,
  });
};

module.exports = { enviarCorreoBienvenida, enviarCorreoVerificacionAprobada };
