export {};

const crypto = require("crypto");
const pool = require("./db");
const { enviarCorreo } = require("./mailer");

const VERIFICATION_TTL_HOURS = 24;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const getVerificationUrl = (token: string) => {
  const webUrl = String(process.env.WEB_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${webUrl}/verificar-correo?token=${encodeURIComponent(token)}`;
};

const createEmailVerification = async (userId: number, email: string, nombre: string) => {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000);
  await pool.query(
    `UPDATE usuarios
     SET email_verification_token_hash = $1,
         email_verification_expires_at = $2,
         email_verified_at = NULL,
         estado_verificacion = 'pendiente'
     WHERE id = $3`,
    [hashToken(token), expiresAt, userId]
  );

  const url = getVerificationUrl(token);
  await enviarCorreo({
    to: email,
    subject: "Verifica tu correo electrónico - Turesma",
    text: `Hola ${nombre || "usuario"}, confirma tu correo abriendo este enlace: ${url}. El enlace expira en ${VERIFICATION_TTL_HOURS} horas.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:auto">
        <h2>Verifica tu correo electrónico</h2>
        <p>Hola ${nombre || "usuario"}, confirma tu correo para activar la verificación de identidad de tu cuenta Turesma.</p>
        <p><a href="${url}" style="display:inline-block;background:#E31E24;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Verificar mi correo</a></p>
        <p style="font-size:12px;color:#6b7280">Este enlace expira en ${VERIFICATION_TTL_HOURS} horas.</p>
      </div>
    `,
  });
};

const verifyEmailToken = async (token: string) => {
  if (!token || token.length < 32) return false;
  const result = await pool.query(
    `UPDATE usuarios
     SET email_verified_at = NOW(),
         email_verification_token_hash = NULL,
         email_verification_expires_at = NULL,
         estado_verificacion = 'verificado',
         fecha_verificacion = NOW(),
         notas_verificacion = NULL
     WHERE email_verification_token_hash = $1
       AND email_verification_expires_at > NOW()
     RETURNING id`,
    [hashToken(token)]
  );
  return result.rowCount > 0;
};

module.exports = { createEmailVerification, verifyEmailToken };
