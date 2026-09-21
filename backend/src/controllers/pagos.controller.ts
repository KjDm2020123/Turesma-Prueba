export {};

const pool = require("../config/db");
const { notificarAdmins } = require("../config/notificaciones");
const { createPaypalOrder, capturePaypalOrder } = require("../config/paypal");

const METODOS_VALIDOS = ["transferencia", "link_pago", "paypal"];

const getPaymentInfo = async (reservaId: number, userId: number) => {
  const result = await pool.query(
    `SELECT id, usuario_id, estado, total, COALESCE(monto_pagado, 0) AS monto_pagado
     FROM reservas WHERE id = $1 AND usuario_id = $2 LIMIT 1`, [reservaId, userId]
  );
  return result.rows[0];
};

const validarMonto = (reserva: any, monto: number) => {
  const minimum = Math.max(0, Number(reserva.total) * 0.5 - Number(reserva.monto_pagado));
  const remaining = Math.max(0, Number(reserva.total) - Number(reserva.monto_pagado));
  if (monto < minimum - 0.01) throw new Error(`El pago mínimo es $${minimum.toFixed(2)}`);
  if (monto > remaining + 0.01) throw new Error(`El pago no puede superar el saldo de $${remaining.toFixed(2)}`);
};

const crearOrdenPaypal = async (req: any, res: any) => {
  const userId = req.user?.id;
  const reservaId = Number(req.params.id);
  const monto = Number(req.body?.monto);
  if (!userId || !Number.isInteger(reservaId)) return res.status(400).json({ error: "Datos de pago inválidos" });
  if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: "Ingresa un monto válido" });
  try {
    const reserva = await getPaymentInfo(reservaId, userId);
    if (!reserva) return res.status(404).json({ error: "Reserva no encontrada" });
    if (["cancelada", "finalizada"].includes(reserva.estado)) return res.status(400).json({ error: "Esta reserva no admite pagos" });
    validarMonto(reserva, monto);
    const order = await createPaypalOrder(monto, reservaId);
    const approvalUrl = order.links?.find((link: any) => link.rel === "approve")?.href;
    if (!approvalUrl) throw new Error("PayPal no devolvió el enlace de aprobación");
    return res.json({ order_id: order.id, approval_url: approvalUrl });
  } catch (error: any) {
    console.error("Error creando orden PayPal:", error);
    return res.status(400).json({ error: error.message || "No se pudo iniciar el pago PayPal" });
  }
};

const capturarOrdenPaypal = async (req: any, res: any) => {
  const userId = req.user?.id;
  const reservaId = Number(req.params.id);
  const orderId = String(req.body?.order_id || "");
  if (!userId || !Number.isInteger(reservaId) || !orderId) return res.status(400).json({ error: "Datos de captura inválidos" });
  try {
    const reserva = await getPaymentInfo(reservaId, userId);
    if (!reserva) return res.status(404).json({ error: "Reserva no encontrada" });
    const capture = await capturePaypalOrder(orderId);
    const captureData = capture.purchase_units?.[0]?.payments?.captures?.[0];
    if (capture.status !== "COMPLETED" || captureData?.status !== "COMPLETED") return res.status(400).json({ error: "PayPal no confirmó el pago" });
    const monto = Number(captureData.amount.value);
    validarMonto(reserva, monto);
    const saved = await pool.query(
      `INSERT INTO pagos_reserva (reserva_id, usuario_id, monto, metodo, proveedor_id, estado, revisado_en)
       VALUES ($1, $2, $3, 'paypal', $4, 'aprobado', NOW())
       RETURNING id, monto, estado`, [reservaId, userId, monto, orderId]
    );
    const suma = await pool.query("SELECT COALESCE(SUM(monto), 0) AS total FROM pagos_reserva WHERE reserva_id = $1 AND estado = 'aprobado'", [reservaId]);
    const totalPagado = Number(suma.rows[0].total);
    const estadoPago = totalPagado >= Number(reserva.total) * 0.5 ? "confirmado" : "parcial";
    await pool.query("UPDATE reservas SET monto_pagado = $1, estado_pago = $2, estado = CASE WHEN estado = 'pendiente_pago' AND $2 = 'confirmado' THEN 'confirmada' ELSE estado END WHERE id = $3", [totalPagado, estadoPago, reservaId]);
    await notificarAdmins(userId, `Pago PayPal confirmado para la reserva #${reservaId} ($${monto.toFixed(2)}).`, "reserva", reservaId);
    return res.json({ message: "Pago PayPal confirmado", pago: saved.rows[0], estado_pago: estadoPago });
  } catch (error: any) {
    console.error("Error capturando pago PayPal:", error);
    return res.status(400).json({ error: error.message || "No se pudo confirmar el pago PayPal" });
  }
};

// ── Cliente: sube un comprobante de pago (transferencia o link de pago) ──────
const crearPagoReserva = async (req: any, res: any) => {
  const userId = req.user?.id;
  const reservaId = Number(req.params.id);
  const monto = Number(req.body.monto);
  const metodo = String(req.body.metodo || "transferencia").toLowerCase();
  const comprobanteUrl = typeof req.body.comprobante_url === "string" ? req.body.comprobante_url.trim() : "";

  if (!userId) return res.status(401).json({ error: "No autenticado" });
  if (!Number.isInteger(reservaId) || reservaId <= 0) return res.status(400).json({ error: "ID de reserva inválido" });
  if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: "Ingresa un monto válido" });
  if (!METODOS_VALIDOS.includes(metodo)) return res.status(400).json({ error: "Método de pago inválido" });
  if (metodo !== "paypal" && !comprobanteUrl) return res.status(400).json({ error: "Debes adjuntar una imagen del comprobante" });

  try {
    const check = await getPaymentInfo(reservaId, userId);
    if (!check) return res.status(404).json({ error: "Reserva no encontrada" });
    if (check.estado === "cancelada") return res.status(400).json({ error: "Esta reserva está cancelada" });
    validarMonto(check, monto);

    const result = await pool.query(
      `INSERT INTO pagos_reserva (reserva_id, usuario_id, monto, metodo, comprobante_url, estado)
       VALUES ($1, $2, $3, $4, $5, 'pendiente')
       RETURNING *`,
      [reservaId, userId, monto, metodo, comprobanteUrl]
    );

    await notificarAdmins(
      userId,
      `Nuevo comprobante de pago recibido para la reserva #${reservaId} ($${monto.toFixed(2)}). Pendiente de revisión.`,
      "reserva",
      reservaId
    );

    return res.status(201).json({ message: "Comprobante enviado. El administrador lo revisará pronto.", data: result.rows[0] });
  } catch (error) {
    console.error("Error registrando pago:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ── Cliente: ve los pagos que ha subido para UNA de sus reservas ─────────────
const listarPagosDeReserva = async (req: any, res: any) => {
  const userId = req.user?.id;
  const reservaId = Number(req.params.id);

  if (!userId) return res.status(401).json({ error: "No autenticado" });
  if (!Number.isInteger(reservaId) || reservaId <= 0) return res.status(400).json({ error: "ID de reserva inválido" });

  try {
    const check = await pool.query("SELECT id FROM reservas WHERE id = $1 AND usuario_id = $2 LIMIT 1", [reservaId, userId]);
    if (check.rowCount === 0) return res.status(404).json({ error: "Reserva no encontrada" });

    const result = await pool.query(
      `SELECT id, monto, metodo, comprobante_url, estado, notas_admin, creado_en, revisado_en
       FROM pagos_reserva
       WHERE reserva_id = $1
       ORDER BY creado_en DESC`,
      [reservaId]
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando pagos de la reserva:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = {
  crearPagoReserva,
  listarPagosDeReserva,
  crearOrdenPaypal,
  capturarOrdenPaypal,
};
