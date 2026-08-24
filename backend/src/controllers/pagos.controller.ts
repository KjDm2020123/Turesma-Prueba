export {};

const pool = require("../config/db");
const { notificarAdmins } = require("../config/notificaciones");

const METODOS_VALIDOS = ["transferencia", "link_pago"];

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
  if (!comprobanteUrl) return res.status(400).json({ error: "Debes adjuntar una imagen del comprobante" });

  try {
    const check = await pool.query(
      "SELECT id, estado FROM reservas WHERE id = $1 AND usuario_id = $2 LIMIT 1",
      [reservaId, userId]
    );
    if (check.rowCount === 0) return res.status(404).json({ error: "Reserva no encontrada" });
    if (check.rows[0].estado === "cancelada") return res.status(400).json({ error: "Esta reserva está cancelada" });

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
};
