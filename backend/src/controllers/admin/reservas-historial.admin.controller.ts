const pool = require("../../config/db");

const historialReservaAdmin = async (req: any, res: any) => {
  const reservaId = Number(req.params.id);
  if (!Number.isInteger(reservaId) || reservaId <= 0) {
    return res.status(400).json({ success: false, error: "ID de reserva inválido" });
  }
  try {
    const result = await pool.query(
      `SELECT h.*, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
       FROM reserva_historial h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.reserva_id = $1
       ORDER BY h.creado_en DESC, h.id DESC`,
      [reservaId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error consultando historial de reserva:", error);
    return res.status(500).json({ success: false, error: "No se pudo consultar el historial de la reserva" });
  }
};

module.exports = { historialReservaAdmin };
