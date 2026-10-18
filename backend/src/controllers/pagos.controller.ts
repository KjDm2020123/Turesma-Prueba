export {};

const pool = require("../config/db");
const { notificarAdmins } = require("../config/notificaciones");
const { createPayphonePayment, confirmPayphonePayment } = require("../config/payphone");

const METODOS_VALIDOS = ["transferencia", "link_pago", "payphone"];

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

const crearPagoPayphone = async (req: any, res: any) => {
  const userId = req.user?.id;
  const reservaId = Number(req.params.id);
  const monto = Number(String(req.body?.monto ?? "").replace(",", "."));
  if (!userId || !Number.isInteger(reservaId)) return res.status(400).json({ error: "Datos de pago inválidos" });
  if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: "Ingresa un monto válido" });
  try {
    const reserva = await getPaymentInfo(reservaId, userId);
    if (!reserva) return res.status(404).json({ error: "Reserva no encontrada" });
    if (["cancelada", "finalizada"].includes(reserva.estado)) return res.status(400).json({ error: "Esta reserva no admite pagos" });
    validarMonto(reserva, monto);
    const clientTransactionId = `turesma-reserva-${reservaId}-${Date.now()}`.slice(0, 50);
    const webUrl = String(process.env.WEB_URL || "http://localhost:3000").replace(/\/+$/, "");
    const payment = await createPayphonePayment({
      amount: monto,
      clientTransactionId,
      reference: `Pago reserva Turesma #${reservaId}`,
      responseUrl: `${webUrl}/cliente/historial?payphone=ok&reserva_id=${reservaId}`,
      cancellationUrl: `${webUrl}/cliente/historial?payphone=cancelado&reserva_id=${reservaId}`,
    });
    if (!payment.payWithCard || !payment.paymentId) {
      throw new Error("PayPhone no devolvió el enlace de pago con tarjeta");
    }
    return res.json({ payment_id: payment.paymentId, client_transaction_id: clientTransactionId, payment_url: payment.payWithCard });
  } catch (error: any) {
    console.error("Error creando pago PayPhone:", error);
    return res.status(400).json({ error: error.message || "No se pudo iniciar el pago PayPhone" });
  }
};

const confirmarPagoPayphone = async (req: any, res: any) => {
  const userId = req.user?.id;
  const reservaId = Number(req.params.id);
  const paymentId = String(req.body?.payment_id || "");
  const clientTransactionId = String(req.body?.client_transaction_id || "");
  if (!userId || !Number.isInteger(reservaId) || !paymentId || !clientTransactionId) return res.status(400).json({ error: "Datos de confirmación inválidos" });
  if (!clientTransactionId.startsWith(`turesma-reserva-${reservaId}-`)) return res.status(400).json({ error: "La transacción no corresponde a la reserva" });
  try {
    const reserva = await getPaymentInfo(reservaId, userId);
    if (!reserva) return res.status(404).json({ error: "Reserva no encontrada" });
    const payment = await confirmPayphonePayment({ id: paymentId, clientTransactionId });
    const status = String(payment.status || payment.transactionStatus || "").toLowerCase();
    if (status && !["approved", "completed", "success", "3"].includes(status)) {
      return res.status(400).json({ error: "PayPhone no confirmó el pago" });
    }
    const monto = Number(payment.amount || payment.amountWithTax || 0) / 100;
    if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: "PayPhone devolvió un monto inválido" });
    validarMonto(reserva, monto);
    const duplicate = await pool.query("SELECT id FROM pagos_reserva WHERE proveedor_id = $1 LIMIT 1", [paymentId]);
    if (duplicate.rowCount) return res.status(409).json({ error: "Este pago PayPhone ya fue registrado" });
    const saved = await pool.query(
      `INSERT INTO pagos_reserva (reserva_id, usuario_id, monto, metodo, proveedor_id, estado, revisado_en)
       VALUES ($1, $2, $3, 'payphone', $4, 'aprobado', NOW())
       RETURNING id, monto, estado`, [reservaId, userId, monto, paymentId]
    );
    const suma = await pool.query("SELECT COALESCE(SUM(monto), 0) AS total FROM pagos_reserva WHERE reserva_id = $1 AND estado = 'aprobado'", [reservaId]);
    const totalPagado = Number(suma.rows[0].total);
    const estadoPago = totalPagado >= Number(reserva.total) - 0.01
      ? "pagado"
      : totalPagado >= Number(reserva.total) * 0.5
        ? "confirmado"
        : "parcial";
    await pool.query(
      "UPDATE reservas SET monto_pagado = $1, estado_pago = $2 WHERE id = $3",
      [totalPagado, estadoPago, reservaId]
    );
    if (["confirmado", "pagado"].includes(estadoPago)) {
      await pool.query(
        "UPDATE reservas SET estado = 'confirmada' WHERE id = $1 AND estado = 'pendiente_pago'",
        [reservaId]
      );
    }
    await notificarAdmins(userId, `Pago PayPhone confirmado para la reserva #${reservaId} ($${monto.toFixed(2)}).`, "reserva", reservaId);
    return res.json({ message: "Pago PayPhone confirmado", pago: saved.rows[0], estado_pago: estadoPago });
  } catch (error: any) {
    console.error("Error confirmando pago PayPhone:", error);
    return res.status(400).json({ error: error.message || "No se pudo confirmar el pago PayPhone" });
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
  if (metodo !== "payphone" && !comprobanteUrl) return res.status(400).json({ error: "Debes adjuntar una imagen del comprobante" });

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
  crearPagoPayphone,
  confirmarPagoPayphone,
};
