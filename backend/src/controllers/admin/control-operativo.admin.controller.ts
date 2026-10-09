export {};

const pool = require("../../config/db");

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const scenarioNumber = (value: unknown, fallback: number) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const calculateProjection = (params: { tarifa: number; demanda: number; combustible: number }, current: any, fleetRow: any, dias: number) => {
  const periodFactor = dias / 90;
  const demandFactor = Math.max(0, 1 + params.demanda / 100);
  const priceFactor = Math.max(0, 1 + params.tarifa / 100);
  const fuelFactor = Math.max(0, 1 + params.combustible / 100);
  const capacityFactor = 1;
  const reservations = Math.round(numberValue(current.reservas) * periodFactor * demandFactor * capacityFactor);
  const revenue = Math.round(numberValue(current.ingresos) * periodFactor * demandFactor * priceFactor * capacityFactor * 100) / 100;
  const baselineRevenue = Math.round(numberValue(current.ingresos) * periodFactor * 100) / 100;
  const fuelCost = Math.round(baselineRevenue * 0.22 * fuelFactor * demandFactor * capacityFactor * 100) / 100;
  const operatingCost = Math.round(baselineRevenue * 0.28 * demandFactor * capacityFactor * 100) / 100;
  const costs = Math.round((fuelCost + operatingCost) * 100) / 100;
  const margin = revenue > 0 ? Math.round(((revenue - costs) / revenue) * 10000) / 100 : 0;
  const risk = margin < 20 ? "alto" : demandFactor > 1.25 || fuelFactor > 1.2 ? "medio" : "bajo";
  return {
    reservas_proyectadas: reservations,
    ingresos_proyectados: revenue,
    costos_operativos_estimados: costs,
    margen_estimado_pct: margin,
    diferencia_ingresos: Math.round((revenue - baselineRevenue) * 100) / 100,
    nivel_riesgo: risk,
    parametros: params,
  };
};

const getScenarioContext = async (_req: any, res: any) => {
  try {
    const [summary, routes, fleet, cancellations] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS reservas,
               COALESCE(SUM(total), 0)::numeric AS ingresos,
               COALESCE(AVG(total), 0)::numeric AS ticket_promedio,
               COALESCE(AVG(num_personas), 0)::numeric AS pasajeros_promedio
        FROM reservas
        WHERE estado <> 'cancelada' AND fecha_reserva >= CURRENT_DATE - INTERVAL '90 days'
      `),
      pool.query(`
        SELECT origen, destino, COUNT(*)::int AS reservas,
               COALESCE(AVG(num_personas), 0)::numeric AS pasajeros_promedio,
               COALESCE(AVG(total), 0)::numeric AS ingreso_promedio
        FROM reservas
        WHERE estado <> 'cancelada' AND fecha_reserva >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY origen, destino
        HAVING COUNT(*) >= 2
        ORDER BY reservas DESC
        LIMIT 8
      `),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE activo = true)::int AS total,
               COUNT(*) FILTER (WHERE activo = true AND estado NOT IN ('mantenimiento','inactivo'))::int AS operativos,
               COUNT(*) FILTER (WHERE activo = true AND estado IN ('mantenimiento','inactivo'))::int AS fuera_servicio
        FROM vehiculos
      `),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE estado = 'cancelada')::int AS canceladas,
               COUNT(*)::int AS total
        FROM reservas
        WHERE fecha_reserva >= CURRENT_DATE - INTERVAL '30 days'
      `),
    ]);

    const current = summary.rows[0] || {};
    const fleetRow = fleet.rows[0] || {};
    const cancellationRow = cancellations.rows[0] || {};
    const reservations = numberValue(current.reservas);
    const operationalVehicles = numberValue(fleetRow.operativos);
    const cancellationRate = numberValue(cancellationRow.total)
      ? Math.round((numberValue(cancellationRow.canceladas) / numberValue(cancellationRow.total)) * 10000) / 100
      : 0;
    const routeRows = routes.rows.map((route: any) => ({
      ...route,
      reservas: numberValue(route.reservas),
      pasajeros_promedio: Math.round(numberValue(route.pasajeros_promedio) * 10) / 10,
      ingreso_promedio: Math.round(numberValue(route.ingreso_promedio) * 100) / 100,
    }));
    const topRoute = routeRows[0] || null;
    const suggestions = [];

    if (topRoute && reservations > 0 && topRoute.reservas / reservations >= 0.25) {
      suggestions.push({
        id: "capacidad-demanda",
        title: "Revisar capacidad en la ruta principal",
        description: `${topRoute.origen} → ${topRoute.destino} concentra ${Math.round((topRoute.reservas / reservations) * 100)}% de las reservas.`,
        reason: "La demanda está concentrada y puede requerir más capacidad o una tarifa optimizada.",
        priority: "alta",
        objective: "capacidad",
        defaults: { aumento_tarifa_pct: "5", aumento_demanda_pct: "10", costo_combustible_pct: "0", dias: "30" },
      });
    }
    if (cancellationRate >= 8) {
      suggestions.push({
        id: "reducir-cancelaciones",
        title: "Evaluar una estrategia para reducir cancelaciones",
        description: `La tasa de cancelación de los últimos 30 días es ${cancellationRate}%.`,
        reason: "Una promoción o ajuste de condiciones podría recuperar demanda efectiva.",
        priority: "alta",
        objective: "demanda",
        defaults: { aumento_tarifa_pct: "-10", aumento_demanda_pct: "15", costo_combustible_pct: "0", dias: "30" },
      });
    }
    if (numberValue(fleetRow.fuera_servicio) > 0) {
      suggestions.push({
        id: "flota-limitada",
        title: "Medir el impacto de la flota fuera de servicio",
        description: `${numberValue(fleetRow.fuera_servicio)} vehículo(s) no están disponibles actualmente.`,
        reason: "Retirar capacidad puede afectar reservas, ingresos y nivel de servicio.",
        priority: "media",
        objective: "operacion",
        defaults: { aumento_tarifa_pct: "0", aumento_demanda_pct: "10", costo_combustible_pct: "0", dias: "30" },
      });
    }
    suggestions.push({
      id: "costo-combustible",
      title: "Preparar un escenario de combustible más caro",
      description: `La operación cuenta con ${operationalVehicles} vehículo(s) operativo(s).`,
      reason: "Permite conocer el margen mínimo antes de ajustar tarifas o frecuencias.",
      priority: "media",
      objective: "costos",
      defaults: { aumento_tarifa_pct: "5", aumento_demanda_pct: "0", costo_combustible_pct: "15", dias: "30" },
    });

    return res.json({
      success: true,
      data: {
        indicadores: {
          reservas_90d: reservations,
          ingresos_90d: numberValue(current.ingresos),
          ticket_promedio: numberValue(current.ticket_promedio),
          pasajeros_promedio: numberValue(current.pasajeros_promedio),
          flota_operativa: operationalVehicles,
          flota_fuera_servicio: numberValue(fleetRow.fuera_servicio),
          tasa_cancelacion_30d: cancellationRate,
        },
        rutas: routeRows,
        situaciones: suggestions,
        confianza: reservations >= 30 ? "alta" : reservations >= 10 ? "media" : "baja",
      },
    });
  } catch (error) {
    console.error("Error obteniendo contexto de escenarios:", error);
    return res.status(500).json({ success: false, error: "No se pudo analizar el contexto de la empresa" });
  }
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

const simularEscenario = async (req: any, res: any) => {
  const body = req.body || {};
  const aumentoTarifaPct = scenarioNumber(body.aumento_tarifa_pct, 0);
  const aumentoDemandaPct = scenarioNumber(body.aumento_demanda_pct, 0);
  const diasValue = scenarioNumber(body.dias, 30);
  const costoCombustiblePct = scenarioNumber(body.costo_combustible_pct, 0);
  const vehiculoRetiradoId = body.vehiculo_retirado_id ? Number(body.vehiculo_retirado_id) : null;

  if ([aumentoTarifaPct, aumentoDemandaPct, costoCombustiblePct, diasValue].some((value) => value === null)
    || aumentoTarifaPct < -100 || aumentoDemandaPct < -100 || costoCombustiblePct < -100
    || diasValue < 1 || diasValue > 365) {
    return res.status(400).json({ success: false, error: "Los porcentajes del escenario no son válidos" });
  }
  const dias = Math.floor(diasValue);

  try {
    const base = await pool.query(`
      SELECT
        COUNT(*)::int AS reservas,
        COALESCE(SUM(total), 0)::numeric AS ingresos,
        COALESCE(SUM(num_personas), 0)::int AS pasajeros,
        COALESCE(AVG(total), 0)::numeric AS ticket_promedio
      FROM reservas
      WHERE estado NOT IN ('cancelada') AND fecha_reserva >= CURRENT_DATE - INTERVAL '90 days'
    `);
    const fleet = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE activo = true)::int AS total,
             COUNT(*) FILTER (WHERE activo = true AND estado NOT IN ('mantenimiento','inactivo'))::int AS operativos
      FROM vehiculos
    `);
    const current = base.rows[0] || {};
    const fleetRow = fleet.rows[0] || {};
    const periodFactor = dias / 90;
    const demandFactor = Math.max(0, 1 + aumentoDemandaPct / 100);
    const priceFactor = Math.max(0, 1 + aumentoTarifaPct / 100);
    const fuelFactor = Math.max(0, 1 + costoCombustiblePct / 100);
    const capacityFactor = vehiculoRetiradoId ? Math.max(0, (numberValue(fleetRow.operativos) - 1) / Math.max(numberValue(fleetRow.operativos), 1)) : 1;
    const projectedReservations = Math.round(numberValue(current.reservas) * periodFactor * demandFactor * capacityFactor);
    const projectedRevenue = Math.round(numberValue(current.ingresos) * periodFactor * demandFactor * priceFactor * capacityFactor * 100) / 100;
    const baselineRevenue = Math.round(numberValue(current.ingresos) * periodFactor * 100) / 100;
    const estimatedFuelCost = Math.round(baselineRevenue * 0.22 * fuelFactor * demandFactor * capacityFactor * 100) / 100;
    const estimatedOperatingCost = Math.round(baselineRevenue * 0.28 * demandFactor * capacityFactor * 100) / 100;
    const projectedCosts = Math.round((estimatedFuelCost + estimatedOperatingCost) * 100) / 100;
    const margin = projectedRevenue > 0 ? Math.round(((projectedRevenue - projectedCosts) / projectedRevenue) * 10000) / 100 : 0;
    const risk = capacityFactor < 0.8 || margin < 20 ? "alto" : demandFactor > 1.25 || fuelFactor > 1.2 ? "medio" : "bajo";
    const confidence = numberValue(current.reservas) >= 30 ? "alta" : numberValue(current.reservas) >= 10 ? "media" : "baja";
    const recommendation = confidence === "baja"
      ? "La proyección es preliminar porque hay pocos registros. Se recomienda ejecutar una prueba piloto de 7 días en una sola ruta antes de aplicar cambios generales."
      : risk === "alto"
      ? "No se recomienda este escenario: el margen o la capacidad operativa presentan un riesgo elevado."
      : risk === "medio"
        ? "Se recomienda revisar este escenario antes de aplicarlo porque presenta factores de riesgo moderados."
        : projectedRevenue >= baselineRevenue
          ? "El escenario es favorable: incrementa o mantiene los ingresos con un riesgo bajo."
          : "El escenario reduce los ingresos proyectados; se recomienda conservar la configuración actual.";

    const sensitivity = [
      { factor: "Demanda", impacto_pct: Math.round((demandFactor - 1) * 10000) / 100 },
      { factor: "Tarifa", impacto_pct: Math.round((priceFactor - 1) * 10000) / 100 },
      { factor: "Combustible", impacto_pct: Math.round((fuelFactor - 1) * 10000) / 100 },
    ].sort((a, b) => Math.abs(b.impacto_pct) - Math.abs(a.impacto_pct));
    const conservative = calculateProjection({ tarifa: 0, demanda: 0, combustible: 10 }, current, fleetRow, dias);
    const currentAlternative = calculateProjection({ tarifa: aumentoTarifaPct, demanda: aumentoDemandaPct, combustible: costoCombustiblePct }, current, fleetRow, dias);
    const expansion = calculateProjection({ tarifa: aumentoTarifaPct, demanda: aumentoDemandaPct + 10, combustible: costoCombustiblePct }, current, fleetRow, dias);
    const result = {
      parametros: { aumento_tarifa_pct: aumentoTarifaPct, aumento_demanda_pct: aumentoDemandaPct, costo_combustible_pct: costoCombustiblePct, dias, vehiculo_retirado_id: vehiculoRetiradoId },
      base: { reservas: numberValue(current.reservas), ingresos: numberValue(current.ingresos), pasajeros: numberValue(current.pasajeros), flota_operativa: numberValue(fleetRow.operativos) },
      escenario: { reservas_proyectadas: projectedReservations, ingresos_proyectados: projectedRevenue, costo_combustible_estimado: estimatedFuelCost, costos_operativos_estimados: projectedCosts, margen_estimado_pct: margin, diferencia_ingresos: Math.round((projectedRevenue - baselineRevenue) * 100) / 100, nivel_riesgo: risk, recomendacion: recommendation },
      alternativas: [
        { nombre: "Conservador", descripcion: "Demanda sin crecimiento y combustible 10% más caro.", ...conservative },
        { nombre: "Escenario actual", descripcion: "Aplicar los parámetros configurados.", ...currentAlternative },
        { nombre: "Expansión", descripcion: "Aumentar demanda 10% adicional manteniendo los costos actuales.", ...expansion },
      ],
      confianza_datos: confidence,
      sensibilidad: sensitivity,
      supuestos: ["La tendencia histórica de los últimos 90 días representa el periodo simulado.", "El combustible representa aproximadamente el 22% de los ingresos base.", "La capacidad se reduce proporcionalmente cuando se retira un vehículo."],
    };

    await pool.query(
      `INSERT INTO decisiones_sistema (tipo_decision, entidad_id, recomendacion, factores)
       VALUES ('simulacion_escenario', $1, $2::jsonb, $3::jsonb)`,
      [vehiculoRetiradoId, JSON.stringify(result), JSON.stringify(result.parametros)]
    );
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error simulando escenario:", error);
    return res.status(500).json({ success: false, error: "No se pudo simular el escenario" });
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

module.exports = { getControlOperativo, getScenarioContext, simularEscenario, getAnomalias };
