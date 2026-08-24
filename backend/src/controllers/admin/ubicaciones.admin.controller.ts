export {};

const pool = require("../../config/db");

// Devuelve la última ubicación de cada vehículo reportada en los últimos 30
// minutos, junto con el origen/destino (coordenadas) de su viaje en curso para
// que el administrador pueda ver la ruta trazada y el tiempo estimado de llegada.
const obtenerUbicacionesActuales = async (_req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (vu.vehiculo_id)
        vu.vehiculo_id,
        vu.lat,
        vu.lng,
        vu.creado_en,
        v.placa,
        v.modelo,
        v.tipo,
        u.nombre AS conductor_nombre,
        r.reserva_id,
        r.origen AS origen_texto,
        r.destino AS destino_texto,
        co.origen_lat, co.origen_lng, co.destino_lat, co.destino_lng
      FROM vehiculo_ubicacion vu
      JOIN vehiculos v ON v.id = vu.vehiculo_id
      LEFT JOIN usuarios u ON u.id = vu.conductor_usuario_id
      LEFT JOIN LATERAL (
        SELECT re.id AS reserva_id, re.origen, re.destino
        FROM reservas re
        WHERE re.vehiculo_id = vu.vehiculo_id AND re.estado = 'en_curso'
        ORDER BY re.id DESC
        LIMIT 1
      ) r ON true
      LEFT JOIN cotizaciones co ON co.reserva_id = r.reserva_id
      WHERE vu.creado_en > NOW() - INTERVAL '30 minutes'
      ORDER BY vu.vehiculo_id, vu.creado_en DESC
    `);

    const rows = result.rows.map((row: any) => ({
      vehiculo_id: row.vehiculo_id,
      lat: row.lat,
      lng: row.lng,
      creado_en: row.creado_en,
      placa: row.placa,
      modelo: row.modelo,
      tipo: row.tipo,
      conductor_nombre: row.conductor_nombre,
      reserva_id: row.reserva_id || null,
      origen_texto: row.origen_texto || null,
      destino_texto: row.destino_texto || null,
      origen: row.origen_lat != null ? { lat: Number(row.origen_lat), lng: Number(row.origen_lng) } : null,
      destino: row.destino_lat != null ? { lat: Number(row.destino_lat), lng: Number(row.destino_lng) } : null,
    }));

    return res.json(rows);
  } catch (error) {
    console.error("Error obteniendo ubicaciones:", error);
    return res.status(500).json({ error: "Error al obtener ubicaciones" });
  }
};

module.exports = { obtenerUbicacionesActuales };
