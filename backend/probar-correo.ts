export {};

// Script para PROBAR el envío de correo con la configuración de tu .env.
// Uso:  npx ts-node --transpile-only -r dotenv/config probar-correo.ts  tu-correo@ejemplo.com
// (Puedes borrar este archivo cuando termines de configurar el correo.)

const nodemailer = require("nodemailer");

const destino = process.argv[2];
if (!destino) {
  console.log("\n⚠️  Falta el correo de destino. Uso:");
  console.log("   npx ts-node --transpile-only -r dotenv/config probar-correo.ts  tu-correo@ejemplo.com\n");
  process.exit(1);
}

const service = process.env.SMTP_SERVICE;
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

console.log("\n── Configuración leída del .env ──");
console.log("  SMTP_SERVICE:", service || "(vacío)");
console.log("  SMTP_HOST:   ", host || "(vacío)");
console.log("  SMTP_PORT:   ", port);
console.log("  SMTP_USER:   ", user || "(vacío)");
console.log("  SMTP_PASS:   ", pass ? "(definida, " + pass.length + " caracteres)" : "(VACÍA ❌)");
console.log("  SMTP_FROM:   ", process.env.SMTP_FROM || "(vacío)");
console.log("──────────────────────────────────\n");

const config: any = {
  auth: { user, pass },
  secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465,
  requireTLS: String(process.env.SMTP_REQUIRE_TLS || "").toLowerCase() === "true",
  tls: { rejectUnauthorized: String(process.env.SMTP_REJECT_UNAUTHORIZED || "true").toLowerCase() === "true" },
};
const transporter = service
  ? nodemailer.createTransport({ ...config, service })
  : nodemailer.createTransport({ ...config, host, port });

(async () => {
  try {
    console.log("1) Verificando conexión y autenticación con el servidor...");
    await transporter.verify();
    console.log("   ✅ Conexión y login OK.\n");

    console.log("2) Enviando correo de prueba a:", destino, "...");
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || user,
      to: destino,
      subject: "Prueba de correo — Turesma ✅",
      text: "Si ves este correo, la configuración SMTP funciona correctamente.",
      html: "<p>Si ves este correo, la configuración SMTP de <b>Turesma</b> funciona correctamente. 🎉</p>",
    });
    console.log("   ✅ Correo ENVIADO. Message ID:", info.messageId);
    console.log("\n🎉 TODO BIEN. Revisa la bandeja (y spam) de", destino, "\n");
  } catch (e: any) {
    console.log("\n❌ FALLÓ. Este es el error exacto (cópialo para diagnosticar):");
    console.log("   code:", e.code, "| command:", e.command);
    console.log("   response:", e.response);
    console.log("   message:", e.message, "\n");
  }
})();
