export {};

const pool = require("../../config/db");
const { crearNotificacion, usuarioIdDeConductor } = require("../../config/notificaciones");
const { notificarClienteReserva } = require("../../config/reservaMailer");
const { obtenerPagoAprobado, enviarReciboPago } = require("../../config/reciboPago");

// Recalcula monto_pagado y estado_pago de una reserva a partir de sus pagos
// APROBADOS. estado_pago pasa a 'confirmado' al alcanzar el 50% del total
// (el mínimo exigido para asegurar la reserva). Cuando eso ocurre y la reserva
// todavía está 'pendiente_pago', la reserva misma pasa a 'confirmada': recién
// ahí se vuelve visible para el conductor y se le notifica.
const recalcularEstadoPago = async (reservaId: number, adminId: number | null | undefined) => {
  const reservaRes = await pool.query("SELECT total, estado, conductor_id, origen, destino FROM reservas WHERE id = $1", [reservaId]);
  const reserva = reservaRes.rows[0];
  const total = Number(reserva?.total) || 0;

  const sumaRes = await pool.query(
    "SELECT COALESCE(SUM(monto), 0) AS suma FROM pagos_reserva WHERE reserva_id = $1 AND estado = 'aprobado'",
    [reservaId]
  );
  const montoPagado = Number(sumaRes.rows[0].suma) || 0;
  const estadoPago = montoPagado <= 0
    ? "pendiente"
    : montoPagado >= total - 0.01
      ? "pagado"
      : montoPagado >= total * 0.5
        ? "confirmado"
        : "parcial";

  await pool.query(
    "UPDATE reservas SET monto_pagado = LEAST($1::numeric, total), estado_pago = $2 WHERE id = $3",
    [montoPagado, estadoPago, reservaId]
  );

  let reservaConfirmada = false;
  if (["confirmado", "pagado"].includes(estadoPago) && reserva?.estado === "pendiente_pago") {
    await pool.query("UPDATE reservas SET estado = 'confirmada' WHERE id = $1 AND estado = 'pendiente_pago'", [reservaId]);
    reservaConfirmada = true;
    const condUserId = await usuarioIdDeConductor(reserva.conductor_id);
    if (condUserId) {
      await crearNotificacion(adminId, condUserId, `Nueva reserva confirmada #${reservaId}: ${reserva.origen} → ${reserva.destino}.`, reservaId, "reserva", reservaId);
    }
    // Avisar al cliente (campanita + correo) que su reserva quedó confirmada.
    await notificarClienteReserva(reservaId, "confirmada", adminId);
  }

  return { montoPagado, estadoPago, total, reservaConfirmada };
};

// ── Admin: lista todos los comprobantes de pago (filtrable por estado) ───────
const listarPagosAdmin = async (req: any, res: any) => {
  try {
    const { estado } = req.query;
    const cond = estado && estado !== "todos" ? "WHERE p.estado = $1" : "";
    const params = estado && estado !== "todos" ? [estado] : [];

    const result = await pool.query(
      `SELECT p.*,
              r.total AS reserva_total, r.origen, r.destino, r.estado AS reserva_estado,
              r.monto_pagado AS reserva_monto_pagado, r.estado_pago AS reserva_estado_pago,
              u.nombre AS cliente_nombre, u.email AS cliente_email
       FROM pagos_reserva p
       JOIN reservas r ON r.id = p.reserva_id
       JOIN usuarios u ON u.id = p.usuario_id
       ${cond}
       ORDER BY p.creado_en DESC`,
      params
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando pagos (admin):", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const descargarReciboPagoAdmin = async (req: any, res: any) => {
  const pagoId = Number(req.params.id);
  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    return res.status(400).json({ error: "ID de pago inválido" });
  }

  try {
    const pago = await obtenerPagoAprobado(pagoId);
    if (!pago) return res.status(404).json({ error: "Recibo no encontrado o pago aún no aprobado" });
    return await enviarReciboPago(res, pago);
  } catch (error) {
    console.error("Error generando recibo de pago para administración:", error);
    return res.status(500).json({ error: "No se pudo generar el recibo de pago" });
  }
};

// ── Admin: aprueba un comprobante de pago ────────────────────────────────────
const aprobarPago = async (req: any, res: any) => {
  const pagoId = Number(req.params.id);
  if (!Number.isInteger(pagoId) || pagoId <= 0) return res.status(400).json({ error: "ID de pago inválido" });

  try {
    const pago = await pool.query("SELECT * FROM pagos_reserva WHERE id = $1 LIMIT 1", [pagoId]);
    if (pago.rowCount === 0) return res.status(404).json({ error: "Pago no encontrado" });
    if (pago.rows[0].estado !== "pendiente") return res.status(400).json({ error: "Este pago ya fue revisado" });

    await pool.query("UPDATE pagos_reserva SET estado = 'aprobado', revisado_en = NOW() WHERE id = $1", [pagoId]);
    const { montoPagado, estadoPago, reservaConfirmada } = await recalcularEstadoPago(pago.rows[0].reserva_id, req.user?.id);

    const monto = Number(pago.rows[0].monto).toFixed(2);
    const mensaje = reservaConfirmada
      ? `Tu pago de $${monto} fue APROBADO. ¡Tu reserva #${pago.rows[0].reserva_id} quedó CONFIRMADA!`
      : estadoPago === "pagado"
        ? `Tu pago de $${monto} fue APROBADO. La reserva #${pago.rows[0].reserva_id} está pagada completamente.`
        : estadoPago === "confirmado"
          ? `Tu pago de $${monto} fue APROBADO. Tu reserva #${pago.rows[0].reserva_id} ya cubre el mínimo requerido (50%); revisa el saldo pendiente.`
          : `Tu pago de $${monto} fue APROBADO para la reserva #${pago.rows[0].reserva_id}. Aún falta completar el mínimo del 50%.`;
    await crearNotificacion(req.user?.id, pago.rows[0].usuario_id, mensaje, pago.rows[0].reserva_id, "reserva", pago.rows[0].reserva_id);

    return res.status(200).json({ message: "Pago aprobado", monto_pagado: montoPagado, estado_pago: estadoPago, reserva_confirmada: reservaConfirmada });
  } catch (error) {
    console.error("Error aprobando pago:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ── Admin: rechaza un comprobante de pago (con nota opcional) ────────────────
const rechazarPago = async (req: any, res: any) => {
  const pagoId = Number(req.params.id);
  const notas = typeof req.body.notas === "string" ? req.body.notas.trim().slice(0, 500) : null;
  if (!Number.isInteger(pagoId) || pagoId <= 0) return res.status(400).json({ error: "ID de pago inválido" });

  try {
    const pago = await pool.query("SELECT * FROM pagos_reserva WHERE id = $1 LIMIT 1", [pagoId]);
    if (pago.rowCount === 0) return res.status(404).json({ error: "Pago no encontrado" });
    if (pago.rows[0].estado !== "pendiente") return res.status(400).json({ error: "Este pago ya fue revisado" });

    await pool.query(
      "UPDATE pagos_reserva SET estado = 'rechazado', notas_admin = $1, revisado_en = NOW() WHERE id = $2",
      [notas, pagoId]
    );
    await crearNotificacion(
      req.user?.id,
      pago.rows[0].usuario_id,
      `Tu comprobante de pago para la reserva #${pago.rows[0].reserva_id} fue RECHAZADO${notas ? ": " + notas : ""}. Puedes volver a intentarlo.`,
      pago.rows[0].reserva_id,
      "reserva",
      pago.rows[0].reserva_id
    );

    return res.status(200).json({ message: "Pago rechazado" });
  } catch (error) {
    console.error("Error rechazando pago:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ── Admin: asigna/edita el link de pago de una reserva ───────────────────────
const actualizarLinkPago = async (req: any, res: any) => {
  const reservaId = Number(req.params.id);
  const linkPago = typeof req.body.link_pago === "string" ? req.body.link_pago.trim().slice(0, 500) : null;
  if (!Number.isInteger(reservaId) || reservaId <= 0) return res.status(400).json({ error: "ID de reserva inválido" });

  try {
    const result = await pool.query(
      "UPDATE reservas SET link_pago = $1 WHERE id = $2 RETURNING id, usuario_id",
      [linkPago || null, reservaId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Reserva no encontrada" });

    if (linkPago) {
      await crearNotificacion(
        req.user?.id,
        result.rows[0].usuario_id,
        `El administrador envió un link de pago para tu reserva #${reservaId}.`,
        reservaId,
        "reserva",
        reservaId
      );
    }

    return res.status(200).json({ message: "Link de pago actualizado" });
  } catch (error) {
    console.error("Error actualizando link de pago:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ── Admin: registra manualmente un saldo recibido ───────────────────────────
const registrarPagoManual = async (req: any, res: any) => {
  const reservaId = Number(req.params.id);
  const montoSolicitado = Number(req.body?.monto);
  const nota = typeof req.body?.nota === "string" ? req.body.nota.trim().slice(0, 500) : null;

  if (!Number.isInteger(reservaId) || reservaId <= 0 || !Number.isFinite(montoSolicitado) || montoSolicitado <= 0) {
    return res.status(400).json({ error: "Indica un monto válido para el pago" });
  }

  try {
    const reservaRes = await pool.query(
      "SELECT id, usuario_id, total, estado, COALESCE(monto_pagado, 0) AS monto_pagado FROM reservas WHERE id = $1 LIMIT 1",
      [reservaId]
    );
    if (reservaRes.rowCount === 0) return res.status(404).json({ error: "Reserva no encontrada" });

    const reserva = reservaRes.rows[0];
    const total = Number(reserva.total) || 0;
    const pagado = Number(reserva.monto_pagado) || 0;
    const monto = Math.min(montoSolicitado, Math.max(0, total - pagado));
    if (monto <= 0) return res.status(400).json({ error: "La reserva ya tiene el valor total pagado" });

    await pool.query(
      `INSERT INTO pagos_reserva
        (reserva_id, usuario_id, monto, metodo, estado, notas_admin, revisado_en)
       VALUES ($1, $2, $3, 'ajuste_admin', 'aprobado', $4, NOW())`,
      [reservaId, reserva.usuario_id, monto, nota || "Pago confirmado manualmente por el administrador"]
    );

    const resultado = await recalcularEstadoPago(reservaId, req.user?.id);
    await crearNotificacion(
      req.user?.id,
      reserva.usuario_id,
      `El administrador registró un pago de $${monto.toFixed(2)} para la reserva #${reservaId}.`,
      reservaId,
      "reserva",
      reservaId
    );

    return res.status(200).json({
      message: "Pago registrado correctamente",
      ...resultado,
      saldo_pendiente: Math.max(0, resultado.total - resultado.montoPagado),
    });
  } catch (error) {
    console.error("Error registrando pago manual:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = {
  listarPagosAdmin,
  descargarReciboPagoAdmin,
  aprobarPago,
  rechazarPago,
  actualizarLinkPago,
  registrarPagoManual,
};
