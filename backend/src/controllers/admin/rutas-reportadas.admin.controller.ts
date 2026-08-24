export {};

const pool = require("../../config/db");

const getRutasReportadas = async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT
        r.id,
        r.fecha_viaje,
        r.origen_provincia,
        r.origen_canton,
        r.origen_parroquia,
        r.origen_detalle,
        r.destino_provincia,
        r.destino_canton,
        r.destino_parroquia,
        r.destino_detalle,
        r.duracion_valor,
        r.duracion_unidad,
        r.duracion_minutos_equivalentes,
        r.costo_combustible,
        r.valor_cobrado,
        r.calificacion_cliente,
        r.cliente_nombre,
        r.cliente_telefono,
        r.cliente_email,
        r.observaciones,
        r.creado_en,
        u.nombre AS conductor_nombre,
        u.email AS conductor_email,
        c.rating_promedio AS rating_promedio_conductor,
        v.placa AS vehiculo_placa,
        CONCAT_WS(' / ', r.origen_provincia, r.origen_canton, r.origen_parroquia) AS origen_completo,
        CONCAT_WS(' / ', r.destino_provincia, r.destino_canton, r.destino_parroquia) AS destino_completo,
        CASE
          WHEN r.duracion_unidad = 'dias' THEN CONCAT(COALESCE(r.duracion_valor, 0), ' días')
          ELSE CONCAT(COALESCE(r.duracion_valor, 0), ' horas')
        END AS duracion_texto,
        CASE
          WHEN r.valor_cobrado > 0
            THEN ROUND(((r.valor_cobrado - COALESCE(r.costo_combustible, 0)) / NULLIF(r.valor_cobrado, 0) * 100)::numeric, 2)
          ELSE NULL
        END AS margen_rentabilidad
      FROM rutas_conductor_reportes r
      INNER JOIN usuarios u ON u.id = r.conductor_usuario_id
      LEFT JOIN conductores c ON c.id = r.conductor_id
      LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
      ORDER BY r.creado_en DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Error getting rutas reportadas:", error);
    res.status(500).json({ success: false, error: "Error fetching route reports" });
  }
};

const getRutasReportadasResumen = async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_reportes,
        COUNT(DISTINCT conductor_usuario_id)::int AS conductores_activos,
        AVG(calificacion_cliente)::numeric(3,2) AS rating_promedio,
        AVG(duracion_minutos_equivalentes)::int AS duracion_promedio_minutos,
        SUM(valor_cobrado)::numeric(10,2) AS ingresos_totales,
        SUM(costo_combustible)::numeric(10,2) AS combustible_total,
        AVG(
          CASE
            WHEN valor_cobrado > 0
              THEN ((valor_cobrado - COALESCE(costo_combustible, 0)) / NULLIF(valor_cobrado, 0) * 100)
            ELSE NULL
          END
        )::numeric(5,2) AS margen_promedio
      FROM rutas_conductor_reportes
    `);

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error getting rutas reportadas resumen:", error);
    res.status(500).json({ success: false, error: "Error fetching route reports summary" });
  }
};

module.exports = {
  getRutasReportadas,
  getRutasReportadasResumen,
};
