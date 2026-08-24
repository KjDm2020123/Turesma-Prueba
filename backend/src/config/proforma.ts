export {};

const pool = require("./db");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

// Ruta del logo de Turesma. Se busca en varias ubicaciones para que funcione
// tanto en desarrollo (ts-node desde /backend) como compilado (node dist/…).
const LOGO_PATH = (() => {
  const candidates = [
    path.join(process.cwd(), "assets", "logo.png"),
    path.join(__dirname, "..", "..", "assets", "logo.png"),
    path.join(__dirname, "..", "assets", "logo.png"),
  ];
  for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch { /* nada */ } }
  return null;
})();

// Datos fijos de la empresa, tal como aparecen en la proforma física de Turesma.
const EMPRESA = {
  lema: "EL TURISMO ES NUESTRA PASION.",
  sub1: "TRASLADO DE PERSONAL A LOS MEJORES RESORT DEL ECUADOR",
  sub2: "VIAJES Y TURISMO A NIVEL NACIONAL",
  nombre: "TURESMA",
  ruc: "1391763581001",
  razon: "TURISMO ESMERALDA S.A. TURESMA",
  direccion: 'La pradera segunda etapa, manzana "Q" villa 14.',
  telefonos: "0993570061, 0990861287",
  email: "turesmasa@hotmail.com",
  banco: { nombre: "BANCO COMERCIAL DE MANABI", tipo: "de ahorros", numero: "304369002", titular: "TURISMO ESMERALDA S.A TURESMA", ruc: "1391763581001" },
  gerente: "Ing. Kevin Delgado M.",
  cargoGerente: "Gerente Propietario",
};

const fmtFecha = (f: any) => {
  if (!f) return "";
  try { const d = new Date(f); return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`; }
  catch { return String(f); }
};
const fmtUSD = (n: number) => Number(n || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Devuelve el id de la cotización asociada a una reserva (si existe).
const getCotizacionIdDeReserva = async (reservaId: number): Promise<number | null> => {
  try {
    const r = await pool.query("SELECT id FROM cotizaciones WHERE reserva_id = $1 ORDER BY id DESC LIMIT 1", [reservaId]);
    return r.rowCount ? Number(r.rows[0].id) : null;
  } catch { return null; }
};

// Arma los datos de la proforma de una cotización y le asigna número si no tiene
// (continúa la numeración física: 22604 → 22605…).
const buildProformaData = async (cotizacionId: number) => {
  const r = await pool.query(
    `SELECT c.id, c.origen, c.destino, c.fecha_servicio, c.hora_salida, c.num_personas,
            c.notas, c.proforma_numero,
            COALESCE(c.precio_final, c.precio_estimado, 0)::numeric AS precio,
            u.nombre AS cliente_nombre, u.email AS cliente_email,
            u.telefono AS cliente_telefono, u.cedula AS cliente_cedula
     FROM cotizaciones c JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.id = $1 LIMIT 1`,
    [cotizacionId]
  );
  if (r.rowCount === 0) return null;
  const c = r.rows[0];
  if (!c.proforma_numero) {
    const upd = await pool.query(
      `UPDATE cotizaciones SET proforma_numero = (SELECT COALESCE(MAX(proforma_numero), 22604) + 1 FROM cotizaciones)
       WHERE id = $1 AND proforma_numero IS NULL RETURNING proforma_numero`,
      [cotizacionId]
    );
    c.proforma_numero = upd.rows[0]?.proforma_numero
      || (await pool.query("SELECT proforma_numero FROM cotizaciones WHERE id = $1", [cotizacionId])).rows[0]?.proforma_numero;
  }
  return {
    numero: c.proforma_numero,
    fecha: new Date().toISOString().slice(0, 10),
    empresa: EMPRESA,
    cliente: { nombre: c.cliente_nombre, email: c.cliente_email, telefono: c.cliente_telefono, cedula: c.cliente_cedula },
    servicio: { origen: c.origen, destino: c.destino, fecha_servicio: c.fecha_servicio, hora_salida: c.hora_salida, num_personas: c.num_personas, notas: c.notas },
    precio: Number(c.precio) || 0,
  };
};

// Genera el PDF de la proforma (Buffer), replicando el formato de la empresa.
const generarProformaPDF = (d: any): Promise<Buffer> => new Promise((resolve, reject) => {
  try {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: any[] = [];
    doc.on("data", (c: any) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const e = d.empresa;
    const left = 40;
    const right = 555;
    const width = right - left;

    // ── Logo (centrado, tipo membrete) ──
    let headerTop = 44;
    if (LOGO_PATH) {
      try {
        const logoW = 180;
        doc.image(LOGO_PATH, left + (width - logoW) / 2, 30, { width: logoW });
        headerTop = 30 + logoW * (720 / 2183) + 10; // alto proporcional del logo + aire
      } catch { /* si el logo falla, seguimos con solo texto */ }
    }

    // ── Membrete (centrado) ──
    doc.font("Helvetica-Bold").fontSize(12).text(e.lema, left, headerTop, { width, align: "center" });
    doc.font("Helvetica-Oblique").fontSize(9.5);
    doc.text(e.sub1, { width, align: "center" });
    doc.text(e.sub2, { width, align: "center" });
    doc.font("Helvetica-Bold").fontSize(10).text(`${e.nombre}   RUC: ${e.ruc}`, { width, align: "center" });
    doc.font("Helvetica").fontSize(9.5);
    doc.text(`Razón Social: ${e.razon}`, { width, align: "center" });
    doc.text(`Dirección: ${e.direccion}`, { width, align: "center" });
    doc.text(`Teléfono: ${e.telefonos}`, { width, align: "center" });
    doc.fillColor("#2563eb").text(`Email: ${e.email}`, { width, align: "center" });
    doc.fillColor("#000000");

    doc.moveDown(1.2);

    // ── Cliente + N° de proforma ──
    let y = doc.y;
    doc.font("Helvetica-Bold").fontSize(11).text(String(d.cliente.nombre || "").toUpperCase(), left, y, { width: 360 });
    doc.font("Helvetica-Bold").fontSize(11).text(`PROFORMA. ${d.numero}`, 360, y, { width: width - 320, align: "right" });
    doc.moveDown(0.6);
    const esRuc = d.cliente.cedula && String(d.cliente.cedula).length === 13;
    doc.font("Helvetica").fontSize(10);
    doc.text(`${esRuc ? "RUC" : "CÉDULA"}:   ${d.cliente.cedula || "—"}`, left);
    doc.text(`FECHA:   ${fmtFecha(d.fecha)}`, left);
    doc.moveDown(0.8);

    // ── Tabla ──
    const cols = { cant: left, desc: left + 65, uni: left + 350, tot: left + 445 };
    const colW = { cant: 65, desc: 285, uni: 95, tot: 95 };
    const headY = doc.y;
    const headH = 22;
    // Cabecera con fondo oscuro
    doc.rect(left, headY, width, headH).fill("#0b0f1a");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
    doc.text("CANTIDAD", cols.cant, headY + 7, { width: colW.cant, align: "center" });
    doc.text("DESCRIPCION", cols.desc, headY + 7, { width: colW.desc, align: "center" });
    doc.text("P. UNITARIO", cols.uni, headY + 7, { width: colW.uni, align: "center" });
    doc.text("P. TOTAL", cols.tot, headY + 7, { width: colW.tot, align: "center" });
    doc.fillColor("#000000");

    // Fila del ítem (alta)
    const rowY = headY + headH;
    const rowH = 240;
    doc.font("Helvetica").fontSize(10);
    doc.text("1", cols.cant, rowY + 10, { width: colW.cant, align: "center" });
    // Descripción con formato
    let dy = rowY + 10;
    doc.font("Helvetica").fontSize(10).text("Servicio de Transporte", cols.desc + 6, dy, { width: colW.desc - 12 });
    dy = doc.y + 6;
    doc.font("Helvetica-Bold").text("Ruta: ", cols.desc + 6, dy, { continued: true, width: colW.desc - 12 });
    doc.font("Helvetica").text(`${d.servicio.origen} → ${d.servicio.destino}`);
    dy = doc.y + 2;
    doc.font("Helvetica-Bold").text("Salida: ", cols.desc + 6, dy, { continued: true, width: colW.desc - 12 });
    doc.font("Helvetica").text(`${fmtFecha(d.servicio.fecha_servicio)}${d.servicio.hora_salida ? " · " + d.servicio.hora_salida : ""} · ${d.servicio.num_personas} pasajero(s)`);
    dy = doc.y + 10;
    doc.font("Helvetica").text(d.servicio.notas || "Servicio de transporte para traslado de personal.", cols.desc + 6, dy, { width: colW.desc - 12 });
    // Precios
    doc.font("Helvetica").fontSize(10).text(fmtUSD(d.precio), cols.uni, rowY + 10, { width: colW.uni - 6, align: "right" });
    doc.text(fmtUSD(d.precio), cols.tot, rowY + 10, { width: colW.tot - 6, align: "right" });

    // Bordes de la tabla
    doc.lineWidth(1).strokeColor("#000000");
    doc.rect(left, headY, width, headH + rowH).stroke();
    // líneas verticales
    [cols.desc, cols.uni, cols.tot].forEach((x) => doc.moveTo(x, headY).lineTo(x, rowY + rowH).stroke());
    // línea bajo la cabecera
    doc.moveTo(left, rowY).lineTo(right, rowY).stroke();

    // Fila TOTAL
    const totY = rowY + rowH;
    const totH = 24;
    doc.rect(cols.uni, totY, colW.uni + colW.tot, totH).stroke();
    doc.moveTo(cols.tot, totY).lineTo(cols.tot, totY + totH).stroke();
    doc.font("Helvetica-Bold").fontSize(10).text("TOTAL USD", cols.uni, totY + 7, { width: colW.uni, align: "center" });
    doc.text(fmtUSD(d.precio), cols.tot, totY + 7, { width: colW.tot - 6, align: "right" });

    // ── Banco + firma ──
    const footY = totY + totH + 30;
    doc.font("Helvetica-Bold").fontSize(10).text(e.banco.nombre, left, footY);
    doc.font("Helvetica").fontSize(10);
    doc.font("Helvetica-Bold").text("Cuenta: ", { continued: true }).font("Helvetica").text(e.banco.tipo);
    doc.font("Helvetica-Bold").text("Numero: ", { continued: true }).font("Helvetica").text(e.banco.numero);
    doc.font("Helvetica-Bold").text("Nombre: ", { continued: true }).font("Helvetica").text(e.banco.titular);
    doc.font("Helvetica-Bold").text("RUC: ", { continued: true }).font("Helvetica").text(e.banco.ruc);

    // Firma (derecha)
    const firmaX = 340, firmaW = 215;
    const firmaY = footY + 55;
    doc.moveTo(firmaX, firmaY).lineTo(firmaX + firmaW, firmaY).stroke();
    doc.font("Helvetica-Bold").fontSize(10).text(e.gerente, firmaX, firmaY + 6, { width: firmaW, align: "center" });
    doc.font("Helvetica").fontSize(9.5).text(e.cargoGerente, firmaX, doc.y, { width: firmaW, align: "center" });

    doc.end();
  } catch (err) {
    reject(err);
  }
});

module.exports = { EMPRESA, buildProformaData, generarProformaPDF, getCotizacionIdDeReserva };
