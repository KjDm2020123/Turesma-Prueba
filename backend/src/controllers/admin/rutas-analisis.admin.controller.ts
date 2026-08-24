export {};

const pool = require("../../config/db");

const getRutasAnalisis = async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        origen,
        destino,
        demanda_promedio_diaria,
        duracion_promedio_minutos,
        costo_combustible_estimado,
        ingresos_promedio,
        tasa_ocupacion,
        viajes_totales,
        estado,
        CASE
          WHEN tasa_ocupacion >= 80 THEN 'excelente'
          WHEN tasa_ocupacion >= 60 THEN 'buena'
          WHEN tasa_ocupacion >= 40 THEN 'regular'
          ELSE 'baja'
        END AS nivel_ocupacion,
        CASE
          WHEN ingresos_promedio IS NOT NULL AND costo_combustible_estimado IS NOT NULL
            THEN ROUND(((ingresos_promedio - costo_combustible_estimado) / NULLIF(ingresos_promedio, 0) * 100)::numeric, 2)
          ELSE NULL
        END AS margen_rentabilidad
      FROM rutas_analisis
      ORDER BY tasa_ocupacion DESC, demanda_promedio_diaria DESC
    `);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Error getting rutas análisis:", error);
    res.status(500).json({ success: false, error: "Error fetching routes analysis" });
  }
};

const getRutasResumen = async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_rutas,
        COUNT(CASE WHEN estado = 'activa' THEN 1 END)::int AS rutas_activas,
        COUNT(CASE WHEN estado = 'inactiva' THEN 1 END)::int AS rutas_inactivas,
        AVG(tasa_ocupacion)::int AS ocupacion_promedio,
        AVG(ingresos_promedio) AS ingreso_promedio_ruta,
        SUM(viajes_totales)::int AS viajes_totales,
        COUNT(CASE WHEN tasa_ocupacion >= 80 THEN 1 END)::int AS rutas_altamente_ocupadas,
        COUNT(CASE WHEN tasa_ocupacion < 40 THEN 1 END)::int AS rutas_subutilizadas
      FROM rutas_analisis
    `);

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error getting rutas resumen:", error);
    res.status(500).json({ success: false, error: "Error fetching routes summary" });
  }
};

const createRuta = async (req: any, res: any) => {
  try {
    const { origen, destino, duracion_promedio_minutos, costo_combustible_estimado, ingresos_promedio } = req.body;

    if (!origen || !destino) {
      return res.status(400).json({ success: false, error: "Origin and destination are required" });
    }

    const result = await pool.query(
      `INSERT INTO rutas_analisis (origen, destino, duracion_promedio_minutos, costo_combustible_estimado, ingresos_promedio, estado)
       VALUES ($1, $2, $3, $4, $5, 'activa')
       ON CONFLICT (origen, destino) DO UPDATE
       SET duracion_promedio_minutos = COALESCE($3, rutas_analisis.duracion_promedio_minutos),
           costo_combustible_estimado = COALESCE($4, rutas_analisis.costo_combustible_estimado),
           ingresos_promedio = COALESCE($5, rutas_analisis.ingresos_promedio),
           ultima_actualizacion = CURRENT_TIMESTAMP
       RETURNING *`,
      [origen, destino, duracion_promedio_minutos, costo_combustible_estimado, ingresos_promedio]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: "Ruta creada o actualizada",
    });
  } catch (error) {
    console.error("Error creating ruta:", error);
    res.status(500).json({ success: false, error: "Error creating route" });
  }
};

const updateRuta = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { demanda_promedio_diaria, duracion_promedio_minutos, costo_combustible_estimado, ingresos_promedio, tasa_ocupacion, viajes_totales, estado } =
      req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (demanda_promedio_diaria !== undefined) {
      updates.push(`demanda_promedio_diaria = $${paramIndex++}`);
      values.push(demanda_promedio_diaria);
    }

    if (duracion_promedio_minutos !== undefined) {
      updates.push(`duracion_promedio_minutos = $${paramIndex++}`);
      values.push(duracion_promedio_minutos);
    }

    if (costo_combustible_estimado !== undefined) {
      updates.push(`costo_combustible_estimado = $${paramIndex++}`);
      values.push(costo_combustible_estimado);
    }

    if (ingresos_promedio !== undefined) {
      updates.push(`ingresos_promedio = $${paramIndex++}`);
      values.push(ingresos_promedio);
    }

    if (tasa_ocupacion !== undefined) {
      updates.push(`tasa_ocupacion = $${paramIndex++}`);
      values.push(tasa_ocupacion);
    }

    if (viajes_totales !== undefined) {
      updates.push(`viajes_totales = $${paramIndex++}`);
      values.push(viajes_totales);
    }

    if (estado !== undefined) {
      updates.push(`estado = $${paramIndex++}`);
      values.push(estado);
    }

    updates.push(`ultima_actualizacion = CURRENT_TIMESTAMP`);
    values.push(id);

    if (updates.length === 1) {
      return res.status(400).json({ success: false, error: "No fields to update" });
    }

    const query = `UPDATE rutas_analisis SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Route not found" });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Ruta actualizada",
    });
  } catch (error) {
    console.error("Error updating ruta:", error);
    res.status(500).json({ success: false, error: "Error updating route" });
  }
};

const getRecomendacionesRutas = async (req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        origen,
        destino,
        tasa_ocupacion,
        demanda_promedio_diaria,
        CASE
          WHEN tasa_ocupacion >= 85 THEN 'AGREGAR VIAJE: Ruta ' || origen || ' - ' || destino || ' está al ' || tasa_ocupacion || '% ocupación. Demanda promedio: ' || demanda_promedio_diaria || ' viajes/día'
          WHEN tasa_ocupacion < 30 THEN 'REVISAR: Ruta ' || origen || ' - ' || destino || ' tiene baja ocupación (' || tasa_ocupacion || '%). Considerar consolidar con otras rutas'
          WHEN demanda_promedio_diaria > 10 THEN 'OPTIMIZAR: Ruta ' || origen || ' - ' || destino || ' muestra alta demanda (' || demanda_promedio_diaria || ' viajes/día). Revisar horarios'
          ELSE 'MONITOREAR: Ruta ' || origen || ' - ' || destino || ' operando normalmente'
        END AS recomendacion,
        CASE
          WHEN tasa_ocupacion >= 85 THEN 'urgente'
          WHEN tasa_ocupacion < 30 THEN 'critica'
          WHEN demanda_promedio_diaria > 10 THEN 'importante'
          ELSE 'normal'
        END AS prioridad
      FROM rutas_analisis
      WHERE estado = 'activa'
      ORDER BY
        CASE
          WHEN tasa_ocupacion < 30 THEN 1
          WHEN tasa_ocupacion >= 85 THEN 2
          WHEN demanda_promedio_diaria > 10 THEN 3
          ELSE 4
        END,
        demanda_promedio_diaria DESC
    `);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Error getting recomendaciones rutas:", error);
    res.status(500).json({ success: false, error: "Error fetching route recommendations" });
  }
};

// Análisis de rutas calculado en vivo desde las reservas reales (más "inteligente")
const getRutasDesdeReservas = async (_req: any, res: any) => {
  try {
    const rutas = await pool.query(`
      SELECT
        COALESCE(NULLIF(TRIM(origen), ''), 'Sin origen') AS origen,
        COALESCE(NULLIF(TRIM(destino), ''), 'Sin destino') AS destino,
        COUNT(*)::int AS viajes,
        COALESCE(SUM(num_personas), 0)::int AS pasajeros,
        COALESCE(SUM(CASE WHEN estado <> 'cancelada' THEN total ELSE 0 END), 0)::numeric AS ingresos,
        ROUND(AVG(num_personas)::numeric, 1) AS prom_pasajeros,
        COUNT(CASE WHEN estado = 'cancelada' THEN 1 END)::int AS cancelados
      FROM reservas
      WHERE origen IS NOT NULL AND destino IS NOT NULL
      GROUP BY 1, 2
      ORDER BY viajes DESC, ingresos DESC
      LIMIT 30
    `);

    const data = rutas.rows;
    const totalViajes = data.reduce((s: number, r: any) => s + Number(r.viajes || 0), 0);
    const totalIngresos = data.reduce((s: number, r: any) => s + Number(r.ingresos || 0), 0);

    res.json({
      success: true,
      data,
      resumen: {
        total_rutas: data.length,
        total_viajes: totalViajes,
        total_ingresos: totalIngresos,
        ruta_mas_demandada: data[0] || null,
        ruta_mas_rentable: [...data].sort((a: any, b: any) => Number(b.ingresos) - Number(a.ingresos))[0] || null,
      },
    });
  } catch (error) {
    console.error("Error getting rutas desde reservas:", error);
    res.status(500).json({ success: false, error: "Error analizando rutas" });
  }
};

module.exports = {
  getRutasAnalisis,
  getRutasResumen,
  createRuta,
  updateRuta,
  getRecomendacionesRutas,
  getRutasDesdeReservas,
};
