export {};

const pool = require("../../config/db");

const getMantenimientoVehiculos = async (req: any, res: any) => {
  try {
    const { vehiculo_id, estado, limit = 50, offset = 0 } = req.query;

    let query = "SELECT * FROM mantenimiento_vehiculos WHERE 1=1";
    const params: any[] = [];

    if (vehiculo_id) {
      query += " AND vehiculo_id = $" + (params.length + 1);
      params.push(vehiculo_id);
    }

    if (estado) {
      query += " AND estado = $" + (params.length + 1);
      params.push(estado);
    }

    query += " ORDER BY fecha_programada DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Error getting mantenimiento:", error);
    res.status(500).json({ success: false, error: "Error fetching maintenance records" });
  }
};

// El "próximo mantenimiento" ya no depende de un estado que nadie crea: se
// calcula directamente del vehículo (fecha_proximo_mantenimiento /
// proximo_km_mantenimiento), que el conductor programa al registrar un
// servicio. Se prioriza lo que esté vencido, luego lo más urgente por
// fecha o por kilómetros restantes.
const getMantenimientoProximo = async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT
        v.id AS vehiculo_id,
        v.placa,
        v.modelo,
        v.kilometraje,
        v.fecha_proximo_mantenimiento,
        v.proximo_km_mantenimiento,
        (v.fecha_proximo_mantenimiento - CURRENT_DATE) AS dias_restantes,
        (v.proximo_km_mantenimiento - COALESCE(v.kilometraje, 0)) AS km_restantes,
        CASE
          WHEN v.fecha_proximo_mantenimiento <= CURRENT_DATE
            OR v.proximo_km_mantenimiento <= COALESCE(v.kilometraje, 0) THEN 'vencido'
          WHEN v.fecha_proximo_mantenimiento <= CURRENT_DATE + INTERVAL '7 days'
            OR (v.proximo_km_mantenimiento - COALESCE(v.kilometraje, 0)) <= 500 THEN 'urgente'
          WHEN v.fecha_proximo_mantenimiento <= CURRENT_DATE + INTERVAL '30 days'
            OR (v.proximo_km_mantenimiento - COALESCE(v.kilometraje, 0)) <= 1500 THEN 'proximo'
          ELSE 'programado'
        END AS prioridad
      FROM vehiculos v
      WHERE v.activo = true
        AND (v.fecha_proximo_mantenimiento IS NOT NULL OR v.proximo_km_mantenimiento IS NOT NULL)
      ORDER BY
        CASE
          WHEN v.fecha_proximo_mantenimiento <= CURRENT_DATE
            OR v.proximo_km_mantenimiento <= COALESCE(v.kilometraje, 0) THEN 0
          ELSE 1
        END,
        v.fecha_proximo_mantenimiento ASC NULLS LAST
      LIMIT 10
    `);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Error getting próximo mantenimiento:", error);
    res.status(500).json({ success: false, error: "Error fetching upcoming maintenance" });
  }
};

const getMantenimientoResumen = async (req: any, res: any) => {
  try {
    const registros = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(CASE WHEN estado = 'completado' THEN 1 END)::int AS completados,
        COUNT(CASE WHEN estado = 'cancelado' THEN 1 END)::int AS cancelados,
        COALESCE(SUM(CASE WHEN costo IS NOT NULL THEN costo ELSE 0 END)::int, 0) AS costo_total,
        COUNT(DISTINCT vehiculo_id)::int AS vehiculos_con_mantenimiento
      FROM mantenimiento_vehiculos
      WHERE fecha_programada >= CURRENT_DATE - INTERVAL '90 days'
    `);

    const pendientes = await pool.query(`
      SELECT COUNT(*)::int AS pendientes
      FROM vehiculos
      WHERE activo = true
        AND (fecha_proximo_mantenimiento IS NOT NULL OR proximo_km_mantenimiento IS NOT NULL)
        AND (
          fecha_proximo_mantenimiento <= CURRENT_DATE + INTERVAL '30 days'
          OR (proximo_km_mantenimiento - COALESCE(kilometraje, 0)) <= 1500
        )
    `);

    res.json({
      success: true,
      data: { ...registros.rows[0], pendientes: pendientes.rows[0].pendientes },
    });
  } catch (error) {
    console.error("Error getting mantenimiento resumen:", error);
    res.status(500).json({ success: false, error: "Error fetching maintenance summary" });
  }
};

// ── Admin: marca el mantenimiento programado como REALIZADO ──────────────────
// Lo registra en el historial y reprograma el aviso a la nueva fecha/km, o lo
// quita si no se indica otra (queda sin próximo mantenimiento pendiente).
const completarMantenimientoProgramado = async (req: any, res: any) => {
  const vehiculoId = Number(req.params.vehiculoId);
  if (!Number.isInteger(vehiculoId) || vehiculoId <= 0) {
    return res.status(400).json({ success: false, error: "ID inválido" });
  }
  try {
    const veh = await pool.query("SELECT id, kilometraje FROM vehiculos WHERE id = $1 LIMIT 1", [vehiculoId]);
    if (veh.rowCount === 0) return res.status(404).json({ success: false, error: "Vehículo no encontrado" });

    const proximaFecha = typeof req.body?.proxima_fecha === "string" && req.body.proxima_fecha ? req.body.proxima_fecha : null;
    const proximoKm = req.body?.proximo_km != null && req.body?.proximo_km !== "" && Number.isFinite(Number(req.body.proximo_km)) ? Number(req.body.proximo_km) : null;
    const observaciones = typeof req.body?.observaciones === "string" ? req.body.observaciones.trim().slice(0, 500) : null;
    const km = Number(veh.rows[0].kilometraje) || 0;
    const hoy = new Date().toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO mantenimiento_vehiculos
         (vehiculo_id, tipo, descripcion, fecha_programada, fecha_realizada, costo, estado, tecnico, observaciones, kilometraje)
       VALUES ($1, 'Programado', 'Mantenimiento programado marcado como realizado', $2::date, $2::date, 0, 'completado', 'Administrador', $3, $4)`,
      [vehiculoId, hoy, observaciones, km]
    );

    await pool.query(
      "UPDATE vehiculos SET fecha_proximo_mantenimiento = $1::date, proximo_km_mantenimiento = $2 WHERE id = $3",
      [proximaFecha, proximoKm, vehiculoId]
    );

    return res.json({ success: true, message: "Mantenimiento marcado como realizado" });
  } catch (error) {
    console.error("Error completando mantenimiento:", error);
    return res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
};

// ── Admin: reprograma el próximo mantenimiento a otra fecha/km ────────────────
const reprogramarMantenimiento = async (req: any, res: any) => {
  const vehiculoId = Number(req.params.vehiculoId);
  if (!Number.isInteger(vehiculoId) || vehiculoId <= 0) {
    return res.status(400).json({ success: false, error: "ID inválido" });
  }
  const proximaFecha = typeof req.body?.proxima_fecha === "string" && req.body.proxima_fecha ? req.body.proxima_fecha : null;
  const proximoKm = req.body?.proximo_km != null && req.body?.proximo_km !== "" && Number.isFinite(Number(req.body.proximo_km)) ? Number(req.body.proximo_km) : null;
  if (!proximaFecha && proximoKm == null) {
    return res.status(400).json({ success: false, error: "Indica la nueva fecha o el próximo kilometraje" });
  }
  try {
    const r = await pool.query(
      `UPDATE vehiculos
       SET fecha_proximo_mantenimiento = COALESCE($1::date, fecha_proximo_mantenimiento),
           proximo_km_mantenimiento = COALESCE($2, proximo_km_mantenimiento)
       WHERE id = $3 RETURNING id`,
      [proximaFecha, proximoKm, vehiculoId]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, error: "Vehículo no encontrado" });
    return res.json({ success: true, message: "Próximo mantenimiento reprogramado" });
  } catch (error) {
    console.error("Error reprogramando mantenimiento:", error);
    return res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
};

module.exports = {
  getMantenimientoVehiculos,
  getMantenimientoProximo,
  getMantenimientoResumen,
  completarMantenimientoProgramado,
  reprogramarMantenimiento,
};
