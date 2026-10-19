export {};

const pool = require("../../config/db");

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getControlOperativo = async (_req: any, res: any) => {
  try {
    const [operaciones, reservas, flota, pagos, mantenimiento, ubicaciones, sinAsignar] = await Promise.all([
      pool.query(`
        SELECT o.id, o.fecha_programada, o.hora_inicio, o.hora_fin, o.origen, o.destino,
               o.pasajeros, o.estado, v.placa AS vehiculo_placa,
               COALESCE(u.nombre, 'Sin conductor') AS conductor_nombre
        FROM operaciones o
        LEFT JOIN vehiculos v ON v.id = o.vehiculo_id
        LEFT JOIN conductores c ON c.id = o.conductor_id
        LEFT JOIN usuarios u ON u.id = c.usuario_id
        WHERE o.fecha_programada = CURRENT_DATE
        ORDER BY o.hora_inicio NULLS LAST, o.id
        LIMIT 100
      `),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE estado IN ('pendiente','pendiente_pago'))::int AS pendientes,
               COUNT(*) FILTER (WHERE estado = 'confirmada' AND fecha_reserva = CURRENT_DATE)::int AS confirmadas_hoy,
               COUNT(*) FILTER (WHERE estado = 'en_curso')::int AS en_curso,
               COUNT(*) FILTER (WHERE estado = 'cancelada' AND fecha_reserva >= CURRENT_DATE - 7)::int AS canceladas_7d
        FROM reservas
      `),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE activo = true)::int AS total,
               COUNT(*) FILTER (WHERE activo = true AND estado = 'disponible')::int AS disponibles,
               COUNT(*) FILTER (WHERE activo = true AND estado = 'en_servicio')::int AS en_servicio,
               COUNT(*) FILTER (WHERE activo = true AND estado IN ('mantenimiento','inactivo'))::int AS fuera_servicio
        FROM vehiculos
      `),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
               COALESCE(SUM(monto) FILTER (WHERE estado = 'pendiente'), 0)::numeric AS monto_pendiente
        FROM pagos_reserva
      `),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE activo = true AND (
          fecha_proximo_mantenimiento <= CURRENT_DATE
          OR proximo_km_mantenimiento <= COALESCE(kilometraje, 0)
        ))::int AS vencidos,
        COUNT(*) FILTER (WHERE activo = true AND (
          fecha_proximo_mantenimiento > CURRENT_DATE
          AND fecha_proximo_mantenimiento <= CURRENT_DATE + INTERVAL '30 days'
        ))::int AS proximos
        FROM vehiculos
      `),
      pool.query(`
        SELECT COUNT(DISTINCT vehiculo_id)::int AS vehiculos_con_ubicacion
        FROM vehiculo_ubicacion
        WHERE creado_en >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
      `),
      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM reservas
        WHERE fecha_reserva >= CURRENT_DATE
          AND estado IN ('confirmada','en_curso')
          AND (vehiculo_id IS NULL OR conductor_id IS NULL)
      `),
    ]);

    const row = (query: any) => query.rows[0] || {};
    const alerts = [];
    const summary = {
      reservas: row(reservas),
      flota: row(flota),
      pagos: row(pagos),
      mantenimiento: row(mantenimiento),
      ubicaciones: row(ubicaciones),
      reservas_sin_asignar: numberValue(row(sinAsignar).total),
    };

    if (summary.reservas_sin_asignar > 0) {
      alerts.push({ severity: "alta", type: "asignacion", message: `${summary.reservas_sin_asignar} reserva(s) confirmada(s) sin vehículo o conductor.` });
    }
    if (numberValue(summary.mantenimiento.vencidos) > 0) {
      alerts.push({ severity: "alta", type: "mantenimiento", message: `${summary.mantenimiento.vencidos} vehículo(s) tienen mantenimiento vencido.` });
    }
    if (numberValue(summary.pagos.pendientes) > 0) {
      alerts.push({ severity: "media", type: "pagos", message: `${summary.pagos.pendientes} pago(s) esperan revisión.` });
    }
    if (numberValue(summary.reservas.canceladas_7d) >= 3) {
      alerts.push({ severity: "media", type: "cancelaciones", message: "La cancelación de reservas está elevada en los últimos 7 días." });
    }

    const score = Math.max(0, 100 - alerts.reduce((total: number, alert: any) => total + (alert.severity === "alta" ? 25 : 10), 0));
    return res.json({
      success: true,
      data: {
        estado: score >= 80 ? "verde" : score >= 55 ? "amarillo" : "rojo",
        puntaje: score,
        resumen: summary,
        operaciones_hoy: operaciones.rows,
        alertas: alerts,
      },
    });
  } catch (error) {
    console.error("Error obteniendo control operativo:", error);
    return res.status(500).json({ success: false, error: "No se pudo cargar el control operativo" });
  }
};

const getAnomalias = async (_req: any, res: any) => {
  try {
    const [cancelaciones, pagos, vehiculos, rutas] = await Promise.all([
      pool.query(`
        WITH actual AS (
          SELECT COUNT(*) FILTER (WHERE estado = 'cancelada')::numeric AS canceladas, COUNT(*)::numeric AS total
          FROM reservas WHERE fecha_reserva >= CURRENT_DATE - 30
        ), historico AS (
          SELECT COALESCE(AVG(tasa), 0)::numeric AS tasa
          FROM (
            SELECT DATE_TRUNC('month', fecha_reserva) AS mes,
              COUNT(*) FILTER (WHERE estado = 'cancelada')::numeric / NULLIF(COUNT(*), 0) * 100 AS tasa
            FROM reservas WHERE fecha_reserva >= CURRENT_DATE - INTERVAL '12 months'
            GROUP BY 1
          ) x
        ) SELECT actual.canceladas, actual.total, ROUND((actual.canceladas / NULLIF(actual.total, 0) * 100)::numeric, 2) AS tasa_actual, ROUND(historico.tasa, 2) AS tasa_historica
        FROM actual, historico
      `),
      pool.query(`
        SELECT COUNT(*)::int AS total, COALESCE(SUM(monto), 0)::numeric AS monto
        FROM pagos_reserva WHERE estado = 'pendiente' AND creado_en < CURRENT_TIMESTAMP - INTERVAL '48 hours'
      `),
      pool.query(`
        SELECT v.placa, v.modelo, COUNT(r.id)::int AS viajes,
               COALESCE(SUM(r.total), 0)::numeric AS ingresos
        FROM vehiculos v
        LEFT JOIN reservas r ON r.vehiculo_id = v.id AND r.fecha_reserva >= CURRENT_DATE - 30 AND r.estado <> 'cancelada'
        WHERE v.activo = true
        GROUP BY v.id
        HAVING COUNT(r.id) = 0
        ORDER BY v.placa
        LIMIT 10
      `),
      pool.query(`
        SELECT origen, destino, COUNT(*)::int AS viajes,
               COALESCE(AVG(num_personas), 0)::numeric AS pasajeros_promedio
        FROM reservas
        WHERE fecha_reserva >= CURRENT_DATE - 90 AND estado <> 'cancelada'
        GROUP BY origen, destino
        HAVING COUNT(*) >= 3
        ORDER BY pasajeros_promedio ASC
        LIMIT 10
      `),
    ]);

    const anomalies: any[] = [];
    const cancellation = cancelaciones.rows[0] || {};
    if (numberValue(cancellation.tasa_actual) > numberValue(cancellation.tasa_historica) + 10 && numberValue(cancellation.total) > 0) {
      anomalies.push({ tipo: "cancelaciones", severidad: "alta", titulo: "Cancelaciones fuera de patrón", detalle: `La tasa actual es ${cancellation.tasa_actual}% frente a ${cancellation.tasa_historica}% histórica.` });
    }
    if (numberValue(pagos.rows[0]?.total) > 0) {
      anomalies.push({ tipo: "pagos", severidad: "media", titulo: "Pagos pendientes antiguos", detalle: `${pagos.rows[0].total} pago(s) llevan más de 48 horas pendientes.` });
    }
    for (const vehicle of vehiculos.rows) {
      anomalies.push({ tipo: "flota", severidad: "media", titulo: "Vehículo sin utilización reciente", detalle: `${vehicle.placa} (${vehicle.modelo}) no registra viajes en los últimos 30 días.` });
    }
    for (const route of rutas.rows) {
      if (numberValue(route.pasajeros_promedio) <= 1) {
        anomalies.push({ tipo: "ruta", severidad: "baja", titulo: "Ruta con baja demanda", detalle: `${route.origen} → ${route.destino} promedia ${route.pasajeros_promedio} pasajero(s).` });
      }
    }
    return res.json({ success: true, data: anomalies.slice(0, 30), total: anomalies.length });
  } catch (error) {
    console.error("Error detectando anomalías:", error);
    return res.status(500).json({ success: false, error: "No se pudieron detectar anomalías" });
  }
};

module.exports = { getControlOperativo, getAnomalias };
