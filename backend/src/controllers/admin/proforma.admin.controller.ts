export {};

const { enviarCorreo } = require("../../config/mailer");
const { buildProformaData, generarProformaPDF } = require("../../config/proforma");

const fmtUSD = (n: number) => Number(n || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Admin: datos de la proforma (asigna número la primera vez) ────────────────
// Los usa el navegador para la vista imprimible.
const getProformaCotizacion = async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "ID inválido" });
  try {
    const data = await buildProformaData(id);
    if (!data) return res.status(404).json({ error: "Cotización no encontrada" });
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Error generando proforma:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ── Admin: envía la proforma al cliente por correo, con el PDF adjunto ─────────
const enviarProformaCotizacion = async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "ID inválido" });
  try {
    const d = await buildProformaData(id);
    if (!d) return res.status(404).json({ error: "Cotización no encontrada" });
    if (!d.cliente.email) return res.status(400).json({ error: "El cliente no tiene correo registrado" });

    const pdf = await generarProformaPDF(d);

    const envio = await enviarCorreo({
      to: d.cliente.email,
      subject: `Proforma N° ${d.numero} — Turesma S.A.`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.5;">
        <p>Estimado(a) ${d.cliente.nombre || "cliente"},</p>
        <p>Adjuntamos la <b>proforma N° ${d.numero}</b> por el servicio de transporte
        ${d.servicio.origen} → ${d.servicio.destino}, por un total de <b>USD ${fmtUSD(d.precio)}</b>.</p>
        <p>Gracias por confiar en <b>Turesma S.A.</b></p>
        <p style="color:#9ca3af;font-size:11px;line-height:1.5;">Este mensaje se envió de forma automática. Para más información comunícate al correo <a href="mailto:turesmasa@hotmail.com" style="color:#9ca3af;">turesmasa@hotmail.com</a>.</p>
      </div>`,
      text: `Proforma N° ${d.numero} de Turesma. Servicio ${d.servicio.origen} → ${d.servicio.destino}, total USD ${fmtUSD(d.precio)}. Adjunto el PDF.\n\n— Este mensaje se envió de forma automática. Para más información comunícate al correo turesmasa@hotmail.com.`,
      attachments: [{ filename: `Proforma-${d.numero}.pdf`, content: pdf }],
    });

    if (!envio.sent) {
      return res.status(500).json({ error: "No se pudo enviar el correo (revisa la configuración SMTP)" });
    }
    return res.json({ success: true, message: `Proforma N° ${d.numero} enviada a ${d.cliente.email}` });
  } catch (error) {
    console.error("Error enviando proforma:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = { getProformaCotizacion, enviarProformaCotizacion };
