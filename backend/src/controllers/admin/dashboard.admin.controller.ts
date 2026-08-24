export {};

const pool = require("../../config/db");

const n = (v: any) => Number(v) || 0;

const getDashboardData = async (req: any, res: any) => {
  try {
    // ── FILTRO DE FECHAS (día / rango / mes) ──────────────────────────
    // ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD  → aplica a KPIs, estados y vehículos.
    const desde = typeof req.query.desde === "string" && req.query.desde ? req.query.desde : null;
    const hasta = typeof req.query.hasta === "string" && req.query.hasta ? req.query.hasta : null;
    const hasRange = Boolean(desde && hasta);
    // Cláusula reutilizable: el llamador pasa el nombre de la columna de fecha.
    const rangeClause = (col: string) => (hasRange ? `AND ${col} BETWEEN $1 AND $2` : "");
    const rangeParams = hasRange ? [desde, hasta] : [];

    // ── KPIs PRINCIPALES ──────────────────────────────────────────────
    const [kpiRes, reservaEstadosRes, mensualRes, vehiculosRes, mantenimientoVehiculosRes, mantenimientoRes] =
      await Promise.all([
        pool.query(`
          SELECT
            COALESCE(SUM(CASE WHEN estado IN ('finalizada','en_curso','confirmada') THEN total ELSE 0 END), 0)::numeric AS ingresos,
            COALESCE(SUM(CASE WHEN estado = 'finalizada' THEN total ELSE 0 END), 0)::numeric AS ingresos_finalizados,
            COUNT(*)::int AS total_reservas,
            COUNT(CASE WHEN estado = 'pendiente' THEN 1 END)::int AS pendientes,
            COUNT(CASE WHEN estado = 'confirmada' THEN 1 END)::int AS confirmadas,
            COUNT(CASE WHEN estado = 'en_curso' THEN 1 END)::int AS en_curso,
            COUNT(CASE WHEN estado = 'finalizada' THEN 1 END)::int AS finalizadas,
            COUNT(CASE WHEN estado = 'cancelada' THEN 1 END)::int AS canceladas,
            COALESCE(SUM(CASE WHEN estado IN ('finalizada','en_curso','confirmada') THEN num_personas ELSE 0 END), 0)::int AS pasajeros
          FROM reservas
          WHERE 1=1 ${rangeClause("fecha_reserva")}
        `, rangeParams),
        pool.query(`
          SELECT estado, COUNT(*)::int AS total
          FROM reservas
          WHERE 1=1 ${rangeClause("fecha_reserva")}
          GROUP BY estado
          ORDER BY total DESC
        `, rangeParams),
        pool.query(`
          SELECT
            TO_CHAR(fecha_reserva, 'Mon') AS mes,
            EXTRACT(MONTH FROM fecha_reserva)::int AS mes_num,
            EXTRACT(YEAR FROM fecha_reserva)::int AS anio,
            COALESCE(SUM(CASE WHEN estado NOT IN ('cancelada') THEN total ELSE 0 END), 0)::numeric AS ingresos,
            COALESCE(SUM(CASE WHEN estado = 'finalizada' THEN total ELSE 0 END), 0)::numeric AS ganancias,
            COUNT(*)::int AS reservas
          FROM reservas
          WHERE fecha_reserva >= CURRENT_DATE - INTERVAL '11 months'
          GROUP BY mes, mes_num, anio
          ORDER BY anio, mes_num
        `),
        pool.query(`
          SELECT
            v.placa,
            v.modelo,
            v.tipo,
            COALESCE(SUM(r.total), 0)::numeric AS ingresos,
            COUNT(r.id)::int AS reservas,
            COALESCE(SUM(r.num_personas), 0)::int AS pasajeros
          FROM vehiculos v
          LEFT JOIN reservas r ON r.vehiculo_id = v.id AND r.estado NOT IN ('cancelada') ${rangeClause("r.fecha_reserva")}
          WHERE v.activo = true
          GROUP BY v.id, v.placa, v.modelo, v.tipo
          ORDER BY reservas DESC, ingresos DESC
          LIMIT 8
        `, rangeParams),
        pool.query(`
          SELECT
            v.placa,
            v.modelo,
            COALESCE(SUM(m.costo), 0)::numeric AS gasto,
            COUNT(m.id)::int AS servicios
          FROM vehiculos v
          JOIN mantenimiento_vehiculos m ON m.vehiculo_id = v.id ${rangeClause("m.fecha_programada")}
          GROUP BY v.id, v.placa, v.modelo
          HAVING COALESCE(SUM(m.costo), 0) > 0
          ORDER BY gasto DESC
          LIMIT 8
        `, rangeParams),
        pool.query(`
          SELECT COALESCE(SUM(costo), 0)::numeric AS total_gastos
          FROM mantenimiento_vehiculos
          WHERE (fecha_realizada IS NOT NULL
             OR (fecha_programada <= CURRENT_DATE AND estado IN ('programado','pendiente')))
             ${hasRange ? `AND fecha_programada BETWEEN $1 AND $2` : ""}
        `, rangeParams),
      ]);

    const kpi = kpiRes.rows[0];
    const ingresos = n(kpi.ingresos);
    const gastos = n(mantenimientoRes.rows[0]?.total_gastos);
    const ganancias = ingresos - gastos;
    const margen = ingresos > 0 ? Math.round((ganancias / ingresos) * 100) : 0;

    // ── ESTADÍSTICAS ADICIONALES ──────────────────────────────────────
    const [totalVehiculosRes, totalConductoresRes, totalClientesRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM vehiculos WHERE activo=true`),
      pool.query(`SELECT COUNT(*)::int AS total FROM conductores WHERE estado='disponible'`),
      pool.query(`SELECT COUNT(*)::int AS total FROM usuarios WHERE rol='cliente'`),
    ]);

    // ── INGRESOS VS GASTOS POR MES (últimos 12 meses) ─────────────────
    const ingresosVsGastosRes = await pool.query(`
      WITH meses AS (
        SELECT
          TO_CHAR(fecha_reserva, 'Mon') AS mes,
          EXTRACT(MONTH FROM fecha_reserva)::int AS mes_num,
          COALESCE(SUM(total), 0)::numeric AS ingresos
        FROM reservas
        WHERE fecha_reserva >= CURRENT_DATE - INTERVAL '11 months'
          AND estado NOT IN ('cancelada')
        GROUP BY mes, mes_num
      ),
      gastos_mes AS (
        SELECT
          TO_CHAR(fecha_programada, 'Mon') AS mes,
          EXTRACT(MONTH FROM fecha_programada)::int AS mes_num,
          COALESCE(SUM(costo), 0)::numeric AS gastos
        FROM mantenimiento_vehiculos
        WHERE fecha_programada >= CURRENT_DATE - INTERVAL '11 months'
        GROUP BY mes, mes_num
      )
      SELECT
        m.mes,
        m.mes_num,
        COALESCE(m.ingresos, 0) AS ingresos,
        COALESCE(g.gastos, 0) AS gastos,
        COALESCE(m.ingresos, 0) - COALESCE(g.gastos, 0) AS ganancias
      FROM meses m
      LEFT JOIN gastos_mes g ON g.mes_num = m.mes_num
      ORDER BY m.mes_num
    `);

    res.json({
      kpi: {
        ingresos,
        ganancias,
        gastos,
        margen,
        total_reservas: n(kpi.total_reservas),
        pasajeros: n(kpi.pasajeros),
        pendientes: n(kpi.pendientes),
        confirmadas: n(kpi.confirmadas),
        en_curso: n(kpi.en_curso),
        finalizadas: n(kpi.finalizadas),
        canceladas: n(kpi.canceladas),
        total_vehiculos: n(totalVehiculosRes.rows[0]?.total),
        total_conductores: n(totalConductoresRes.rows[0]?.total),
        total_clientes: n(totalClientesRes.rows[0]?.total),
      },
      reservaEstados: reservaEstadosRes.rows,
      mensual: mensualRes.rows,
      vehiculos: vehiculosRes.rows,
      mantenimientoVehiculos: mantenimientoVehiculosRes.rows,
      ingresosVsGastos: ingresosVsGastosRes.rows,
      // Destacados del período
      vehiculoMasUsado: vehiculosRes.rows.find((v: any) => n(v.reservas) > 0) || null,
      vehiculoMayorGasto: mantenimientoVehiculosRes.rows[0] || null,
      rango: hasRange ? { desde, hasta } : null,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Error cargando dashboard" });
  }
};

module.exports = { getDashboardData };
