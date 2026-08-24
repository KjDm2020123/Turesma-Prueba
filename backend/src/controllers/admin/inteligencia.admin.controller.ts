export {};

const pool = require("../../config/db");

const safeCount = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return Number(result.rows[0]?.total || 0);
};

// Base para calcular la matriculación de cada vehículo por el último dígito de
// su placa (el mes lo define el calendario editable matricula_calendario).
const CTE_MATRICULA = `
  WITH veh AS (
    SELECT v.placa, v.fecha_matricula,
      (SELECT mc.mes FROM matricula_calendario mc
       WHERE mc.digito = RIGHT(regexp_replace(v.placa, '[^0-9]', '', 'g'), 1)::int) AS mes
    FROM vehiculos v
    WHERE v.placa IS NOT NULL AND v.placa ~ '[0-9]'
  )
`;
// Un vehículo está "matriculado este año" si su última matrícula es de este año.
const MAT_HECHO = "(fecha_matricula IS NOT NULL AND EXTRACT(YEAR FROM fecha_matricula) >= EXTRACT(YEAR FROM CURRENT_DATE))";
// Inicio y fin del mes que le toca según el calendario, en el año actual.
const MAT_INICIO = "make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, mes, 1)";
const MAT_FIN = "(make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date";

// A qué pantalla del admin lo manda cada tipo de alerta, para poder resolverla
// con un clic en vez de solo informarla.
const LINK_POR_TIPO = {
  mantenimiento: "/admin/mantenimiento",
  cumplimiento: "/admin/cumplimiento",
  licencias: "/admin/conductores",
  conductores: "/admin/conductores",
  rutas: "/admin/rutas-analisis",
  pagos: "/admin/pagos",
  asignacion: "/admin/vehiculos",
  flujo: "/admin/reservas",
  flota: "/admin/vehiculos",
};

const buildDashboardData = async () => {
  // ============ MÉTRICAS BASE ============
  const [
    totalUsuarios,
    totalClientes,
    totalConductores,
    totalVehiculos,
    vehiculosActivos,
    vehiculosSinAsignar,
    reservasPendientes,
    reservasPendientePago,
    reservasConfirmadas,
    reservasEnCurso,
    reservasFinalizadas,
    // MANTENIMIENTO (basado en vehiculos.fecha_proximo_mantenimiento / proximo_km_mantenimiento,
    // que es lo que el conductor programa al registrar un servicio — no el estado
    // 'programado' legado, que ya nadie crea)
    mantenimientoVencido,
    mantenimientoPendiente,
    mantenimientoCompletado,
    costomantenimientoMes,
    // CUMPLIMIENTO
    cumplimientoVencido,
    cumplimientoCritico,
    cumplimientoVigente,
    // DESEMPEÑO (conductores.estado real: 'disponible' | 'en_servicio' | 'inactivo')
    conductoresActivos,
    conductoresInactivos,
    ratingPromedioConductores,
    licenciasVencidas,
    // RUTAS (calculado en vivo desde reservas, igual que la página Análisis de Rutas;
    // la tabla rutas_analisis está vacía y no se usa en ningún flujo real)
    rutasActivas,
    tasaCancelacionRutas,
  ] = await Promise.all([
    safeCount("SELECT COUNT(*)::int AS total FROM usuarios"),
    safeCount("SELECT COUNT(*)::int AS total FROM usuarios WHERE LOWER(rol) = 'cliente'"),
    safeCount("SELECT COUNT(*)::int AS total FROM conductores"),
    safeCount("SELECT COUNT(*)::int AS total FROM vehiculos"),
    safeCount("SELECT COUNT(*)::int AS total FROM vehiculos WHERE activo = true"),
    safeCount("SELECT COUNT(*)::int AS total FROM vehiculos WHERE usuario_id IS NULL"),
    safeCount("SELECT COUNT(*)::int AS total FROM reservas WHERE LOWER(estado) = 'pendiente'"),
    safeCount("SELECT COUNT(*)::int AS total FROM reservas WHERE LOWER(estado) = 'pendiente_pago'"),
    safeCount("SELECT COUNT(*)::int AS total FROM reservas WHERE LOWER(estado) = 'confirmada'"),
    safeCount("SELECT COUNT(*)::int AS total FROM reservas WHERE LOWER(estado) = 'en_curso'"),
    safeCount("SELECT COUNT(*)::int AS total FROM reservas WHERE LOWER(estado) = 'finalizada'"),
    // MANTENIMIENTO
    // COALESCE(cond, false) en cada condición atómica evita que "NULL OR FALSE"
    // colapse a NULL (que en un WHERE excluye la fila igual que FALSE): sin esto,
    // un vehículo con seguimiento solo por km (sin fecha) que SÍ está en la
    // ventana de "próximo" se perdía silenciosamente del conteo.
    safeCount(`
      SELECT COUNT(*)::int AS total FROM vehiculos
      WHERE activo = true
        AND (fecha_proximo_mantenimiento IS NOT NULL OR proximo_km_mantenimiento IS NOT NULL)
        AND (COALESCE(fecha_proximo_mantenimiento <= CURRENT_DATE, false)
             OR COALESCE(proximo_km_mantenimiento <= kilometraje, false))
    `),
    safeCount(`
      SELECT COUNT(*)::int AS total FROM vehiculos
      WHERE activo = true
        AND (fecha_proximo_mantenimiento IS NOT NULL OR proximo_km_mantenimiento IS NOT NULL)
        AND NOT (COALESCE(fecha_proximo_mantenimiento <= CURRENT_DATE, false)
                 OR COALESCE(proximo_km_mantenimiento <= kilometraje, false))
        AND (COALESCE(fecha_proximo_mantenimiento <= CURRENT_DATE + INTERVAL '30 days', false)
             OR COALESCE((proximo_km_mantenimiento - COALESCE(kilometraje, 0)) <= 1500, false))
    `),
    safeCount("SELECT COUNT(*)::int AS total FROM mantenimiento_vehiculos WHERE fecha_realizada IS NOT NULL"),
    safeCount("SELECT COALESCE(SUM(costo), 0)::int AS total FROM mantenimiento_vehiculos WHERE fecha_realizada >= CURRENT_DATE - INTERVAL '30 days'"),
    // CUMPLIMIENTO = matriculación por placa (vencido = atrasada, crítico = por vencer ≤30d, vigente = al día)
    safeCount(`${CTE_MATRICULA}
      SELECT COUNT(*)::int AS total FROM veh
      WHERE mes IS NOT NULL AND NOT ${MAT_HECHO} AND ${MAT_FIN} < CURRENT_DATE`),
    safeCount(`${CTE_MATRICULA}
      SELECT COUNT(*)::int AS total FROM veh
      WHERE mes IS NOT NULL AND NOT ${MAT_HECHO}
        AND (${MAT_INICIO} - CURRENT_DATE) <= 30 AND ${MAT_FIN} >= CURRENT_DATE`),
    safeCount(`${CTE_MATRICULA}
      SELECT COUNT(*)::int AS total FROM veh
      WHERE mes IS NOT NULL AND (${MAT_HECHO} OR (${MAT_INICIO} - CURRENT_DATE) > 30)`),
    // DESEMPEÑO
    safeCount("SELECT COUNT(*)::int AS total FROM conductores WHERE estado IN ('disponible', 'en_servicio')"),
    safeCount("SELECT COUNT(*)::int AS total FROM conductores WHERE estado = 'inactivo'"),
    safeCount("SELECT COALESCE(AVG(rating_promedio)::int, 5) AS total FROM conductores WHERE rating_promedio IS NOT NULL"),
    safeCount("SELECT COUNT(*)::int AS total FROM conductores WHERE fecha_licencia_vencimiento IS NOT NULL AND fecha_licencia_vencimiento < CURRENT_DATE"),
    // RUTAS
    safeCount(`
      SELECT COUNT(*)::int AS total FROM (
        SELECT DISTINCT origen, destino FROM reservas
        WHERE origen IS NOT NULL AND destino IS NOT NULL
          AND fecha_reserva >= CURRENT_DATE - INTERVAL '30 days'
      ) t
    `),
    safeCount(`
      SELECT CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(COUNT(*) FILTER (WHERE estado = 'cancelada')::numeric / COUNT(*) * 100)::int END AS total
      FROM reservas WHERE fecha_reserva >= CURRENT_DATE - INTERVAL '30 days'
    `),
  ]);

  const ocupacionVehicular = totalVehiculos > 0 ? Math.round((vehiculosActivos / totalVehiculos) * 100) : 0;
  const actividadReservas = reservasPendientes + reservasPendientePago + reservasConfirmadas + reservasEnCurso + reservasFinalizadas;
  const cargaOperativa = totalVehiculos > 0 ? Math.round((actividadReservas / Math.max(totalVehiculos * 5, 1)) * 100) : 0;

  const [tendenciaSemanalRaw, proximosMantenimiento, proximosCumplimiento] = await Promise.all([
    // Semana calendario actual (lunes a domingo), con los 7 días presentes aunque
    // algún día no tenga reservas. date_trunc('week', ...) en Postgres arranca en
    // lunes; el nombre del día se traduce a español en JS (evita depender del
    // locale del servidor de base de datos).
    pool.query(`
      WITH semana AS (
        SELECT generate_series(
          date_trunc('week', CURRENT_DATE)::date,
          date_trunc('week', CURRENT_DATE)::date + 6,
          '1 day'::interval
        )::date AS dia
      )
      SELECT s.dia, EXTRACT(ISODOW FROM s.dia)::int AS isodow, COUNT(r.id)::int AS total
      FROM semana s
      LEFT JOIN reservas r ON r.fecha_reserva::date = s.dia
      GROUP BY s.dia
      ORDER BY s.dia ASC
    `),
    // Próximos servicios de mantenimiento (por fecha o km), vengan vencidos o no.
    // COALESCE(..., false) evita que un vehículo con solo seguimiento por km (sin
    // fecha) quede como NULL: en Postgres, ORDER BY x DESC pone los NULL primero,
    // lo que lo colaría antes que uno realmente vencido.
    pool.query(`
      SELECT v.placa AS etiqueta, v.fecha_proximo_mantenimiento AS fecha,
             (v.fecha_proximo_mantenimiento - CURRENT_DATE) AS dias_restantes,
             COALESCE(v.fecha_proximo_mantenimiento <= CURRENT_DATE, false)
               OR COALESCE(v.proximo_km_mantenimiento <= v.kilometraje, false) AS vencido
      FROM vehiculos v
      WHERE v.activo = true
        AND (v.fecha_proximo_mantenimiento IS NOT NULL OR v.proximo_km_mantenimiento IS NOT NULL)
      ORDER BY vencido DESC, v.fecha_proximo_mantenimiento ASC NULLS LAST
      LIMIT 5
    `),
    // Próximas matrículas por vencer (o atrasadas), por vehículo según su placa.
    pool.query(`${CTE_MATRICULA}
      SELECT 'Matrícula · ' || placa AS etiqueta,
             ${MAT_FIN} AS fecha,
             (${MAT_FIN} - CURRENT_DATE) AS dias_restantes,
             (${MAT_FIN} < CURRENT_DATE) AS vencido
      FROM veh
      WHERE mes IS NOT NULL AND NOT ${MAT_HECHO}
        AND (${MAT_INICIO} - CURRENT_DATE) <= 30
      ORDER BY vencido DESC, fecha ASC
      LIMIT 5
    `),
  ]);

  const DIAS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const tendenciaSemanal = tendenciaSemanalRaw.rows.map((row) => ({
    etiqueta: DIAS_ES[row.isodow - 1],
    total: row.total,
  }));

  // ============ TIMELINE UNIFICADO DE VENCIMIENTOS ============
  // Junta mantenimiento y cumplimiento (hoy viven en pantallas separadas) en una
  // sola cola ordenada por urgencia, para que el admin no tenga que revisar
  // ambas por separado.
  const proximosVencimientos = [
    ...proximosMantenimiento.rows.map((r) => ({
      tipo: "mantenimiento",
      titulo: `Mantenimiento · ${r.etiqueta}`,
      fecha: r.fecha,
      diasRestantes: r.dias_restantes,
      vencido: r.vencido,
      link: LINK_POR_TIPO.mantenimiento,
    })),
    ...proximosCumplimiento.rows.map((r) => ({
      tipo: "cumplimiento",
      titulo: r.etiqueta,
      fecha: r.fecha,
      diasRestantes: r.dias_restantes,
      vencido: r.vencido,
      link: LINK_POR_TIPO.cumplimiento,
    })),
  ]
    .sort((a, b) => {
      if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
      return (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999);
    })
    .slice(0, 6);

  const alertas: Array<{ tipo: string; prioridad: string; titulo: string; descripcion: string; link: string }> = [];

  // ============ ALERTAS DE MANTENIMIENTO ============
  if (mantenimientoVencido > 0) {
    alertas.push({
      tipo: "mantenimiento",
      prioridad: "alta",
      titulo: "Mantenimiento vencido",
      descripcion: `${mantenimientoVencido} servicio(s) de mantenimiento están vencidos y requieren atención inmediata.`,
      link: LINK_POR_TIPO.mantenimiento,
    });
  }

  if (mantenimientoPendiente > 0) {
    alertas.push({
      tipo: "mantenimiento",
      prioridad: mantenimientoPendiente > 5 ? "media" : "baja",
      titulo: "Mantenimiento próximo",
      descripcion: `${mantenimientoPendiente} servicio(s) de mantenimiento están programados en los próximos 30 días.`,
      link: LINK_POR_TIPO.mantenimiento,
    });
  }

  // ============ ALERTAS DE MATRICULACIÓN ============
  if (cumplimientoVencido > 0) {
    alertas.push({
      tipo: "cumplimiento",
      prioridad: "alta",
      titulo: "Matrículas atrasadas",
      descripcion: `${cumplimientoVencido} vehículo(s) no se matricularon en el mes que les tocaba. Regularización urgente.`,
      link: LINK_POR_TIPO.cumplimiento,
    });
  }

  if (cumplimientoCritico > 0) {
    alertas.push({
      tipo: "cumplimiento",
      prioridad: "media",
      titulo: "Matrículas por vencer",
      descripcion: `${cumplimientoCritico} vehículo(s) deben matricularse pronto (30 días o menos).`,
      link: LINK_POR_TIPO.cumplimiento,
    });
  }

  // ============ ALERTAS DE DESEMPEÑO ============
  if (licenciasVencidas > 0) {
    alertas.push({
      tipo: "licencias",
      prioridad: "alta",
      titulo: "Licencias de conducción vencidas",
      descripcion: `${licenciasVencidas} conductor(es) tiene(n) licencia(s) vencida(s). No pueden operar legalmente.`,
      link: LINK_POR_TIPO.licencias,
    });
  }

  if (conductoresInactivos > 0) {
    alertas.push({
      tipo: "conductores",
      prioridad: "baja",
      titulo: "Conductores inactivos",
      descripcion: `${conductoresInactivos} conductor(es) marcado(s) como inactivo(s) en el sistema.`,
      link: LINK_POR_TIPO.conductores,
    });
  }

  // ============ ALERTAS DE RUTAS ============
  if (tasaCancelacionRutas > 20 && rutasActivas > 0) {
    alertas.push({
      tipo: "rutas",
      prioridad: tasaCancelacionRutas > 40 ? "alta" : "media",
      titulo: "Cancelaciones por encima de lo normal",
      descripcion: `El ${tasaCancelacionRutas}% de las reservas de los últimos 30 días se cancelaron. Revisar causas (precio, disponibilidad, comunicación).`,
      link: LINK_POR_TIPO.rutas,
    });
  }

  // ============ ALERTAS DE PAGOS ============
  if (reservasPendientePago > 0) {
    alertas.push({
      tipo: "pagos",
      prioridad: reservasPendientePago > 5 ? "alta" : "media",
      titulo: "Reservas esperando confirmación de pago",
      descripcion: `${reservasPendientePago} reserva(s) tienen cotización aprobada pero aún no llega el pago mínimo (50%). No quedarán confirmadas ni visibles al conductor hasta entonces.`,
      link: LINK_POR_TIPO.pagos,
    });
  }

  if (vehiculosSinAsignar > 0) {
    alertas.push({
      tipo: "asignacion",
      prioridad: vehiculosSinAsignar > 3 ? "alta" : "media",
      titulo: "Vehículos sin asignar",
      descripcion: `${vehiculosSinAsignar} vehículo(s) no tienen conductor vinculado.`,
      link: LINK_POR_TIPO.asignacion,
    });
  }

  if (reservasPendientes > 0) {
    alertas.push({
      tipo: "flujo",
      prioridad: reservasPendientes > 10 ? "alta" : "media",
      titulo: "Pendientes de revisión",
      descripcion: `${reservasPendientes} reserva(s) aún esperan validación operativa.`,
      link: LINK_POR_TIPO.flujo,
    });
  }

  if (vehiculosActivos < totalVehiculos) {
    alertas.push({
      tipo: "flota",
      prioridad: "media",
      titulo: "Flota parcialmente inactiva",
      descripcion: `${totalVehiculos - vehiculosActivos} vehículo(s) están desactivados en el sistema.`,
      link: LINK_POR_TIPO.flota,
    });
  }

  const PRIORIDAD_ORDEN = { alta: 0, media: 1, baja: 2 };
  alertas.sort((a, b) => PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad]);

  return {
    resumen: {
      totalUsuarios,
      totalClientes,
      totalConductores,
      totalVehiculos,
      vehiculosActivos,
      vehiculosSinAsignar,
      reservasPendientes,
      reservasPendientePago,
      reservasConfirmadas,
      reservasEnCurso,
      reservasFinalizadas,
      ocupacionVehicular,
      cargaOperativa,
      // MANTENIMIENTO
      mantenimientoPendiente,
      mantenimientoVencido,
      mantenimientoCompletado,
      costomantenimientoMes,
      // CUMPLIMIENTO
      cumplimientoVencido,
      cumplimientoCritico,
      cumplimientoVigente,
      // DESEMPEÑO
      conductoresActivos,
      conductoresInactivos,
      ratingPromedioConductores,
      licenciasVencidas,
      // RUTAS
      rutasActivas,
      tasaCancelacionRutas,
    },
    tendenciaSemanal,
    proximosVencimientos,
    alertas,
  };
};

const getInteligenciaDashboard = async (_req, res) => {
  try {
    const data = await buildDashboardData();
    return res.status(200).json(data);
  } catch (error) {
    console.error("Error generando dashboard de inteligencia:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const getAlertasInteligentes = async (_req, res) => {
  try {
    const data = await buildDashboardData();
    return res.status(200).json(data.alertas);
  } catch (error) {
    console.error("Error obteniendo alertas inteligentes:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Contadores livianos para los badges del sidebar del admin: cuántas
// cotizaciones esperan respuesta del admin (turno = 'admin') y cuántos
// comprobantes de pago están sin revisar. Se consulta aparte de
// buildDashboardData() (que hace muchas más queries) porque el sidebar
// lo sondea con frecuencia en todas las pantallas del panel.
const getBadgesSidebar = async (_req, res) => {
  try {
    const [cotizaciones, pagos, verificaciones, matriculas] = await Promise.all([
      safeCount(
        `SELECT COUNT(*) AS total FROM cotizaciones WHERE turno = 'admin' AND estado NOT IN ('aprobada', 'rechazada')`
      ),
      safeCount(`SELECT COUNT(*) AS total FROM pagos_reserva WHERE estado = 'pendiente'`),
      safeCount(`SELECT COUNT(*) AS total FROM usuarios WHERE LOWER(rol) = 'cliente' AND estado_verificacion = 'pendiente'`),
      // Vehículos que necesitan matricularse pronto (≤30 días antes de su mes),
      // están en su mes, o ya se pasaron y no se han matriculado este año.
      safeCount(`
        WITH veh AS (
          SELECT
            v.fecha_matricula,
            (SELECT mc.mes FROM matricula_calendario mc
             WHERE mc.digito = RIGHT(regexp_replace(v.placa, '[^0-9]', '', 'g'), 1)::int) AS mes
          FROM vehiculos v
          WHERE v.placa IS NOT NULL AND v.placa ~ '[0-9]'
        )
        SELECT COUNT(*) AS total FROM veh
        WHERE mes IS NOT NULL
          AND (fecha_matricula IS NULL OR EXTRACT(YEAR FROM fecha_matricula) < EXTRACT(YEAR FROM CURRENT_DATE))
          AND (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, mes, 1) - CURRENT_DATE) <= 30
      `),
    ]);

    return res.status(200).json({
      "/admin/cotizaciones": cotizaciones,
      "/admin/pagos": pagos,
      "/admin/verificaciones": verificaciones,
      "/admin/cumplimiento": matriculas,
    });
  } catch (error) {
    console.error("Error obteniendo badges de sidebar:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ── Analítica inteligente: predicción de demanda, proyección de ingresos,
// tasa de conversión y recomendaciones automáticas (todo con datos reales) ────
const getAnaliticaInteligente = async (_req: any, res: any) => {
  const MES_C = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const MES_L = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const DIA = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]; // ISODOW 1..7

  try {
    const [demMes, demDia, ingMes, promHist, conv, rutaTop, ociosos] = await Promise.all([
      pool.query(`
        SELECT EXTRACT(MONTH FROM fecha_reserva)::int AS mes, COUNT(*)::int AS total
        FROM reservas
        WHERE estado <> 'cancelada' AND fecha_reserva >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY 1 ORDER BY 1
      `),
      pool.query(`
        SELECT EXTRACT(ISODOW FROM fecha_reserva)::int AS dow, COUNT(*)::int AS total
        FROM reservas
        WHERE estado <> 'cancelada' AND fecha_reserva >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY 1 ORDER BY 1
      `),
      pool.query(`
        SELECT COALESCE(SUM(total), 0)::numeric AS total
        FROM reservas
        WHERE estado IN ('confirmada', 'en_curso', 'finalizada')
          AND date_trunc('month', fecha_reserva) = date_trunc('month', CURRENT_DATE)
      `),
      pool.query(`
        SELECT COALESCE(AVG(m.total), 0)::numeric AS prom FROM (
          SELECT date_trunc('month', fecha_reserva) AS mes, SUM(total) AS total
          FROM reservas
          WHERE estado = 'finalizada' AND fecha_reserva >= CURRENT_DATE - INTERVAL '6 months'
          GROUP BY 1
        ) m
      `),
      pool.query(`
        SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE estado = 'aprobada')::int AS aprobadas
        FROM cotizaciones WHERE creado_en >= CURRENT_DATE - INTERVAL '90 days'
      `),
      pool.query(`
        SELECT origen, destino, COUNT(*)::int AS total
        FROM reservas
        WHERE estado <> 'cancelada' AND origen IS NOT NULL AND destino IS NOT NULL
          AND fecha_reserva >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY origen, destino ORDER BY total DESC LIMIT 1
      `),
      pool.query(`
        SELECT v.placa, (CURRENT_DATE - MAX(r.fecha_reserva)::date) AS dias_ocioso
        FROM vehiculos v
        LEFT JOIN reservas r ON r.vehiculo_id = v.id AND r.estado <> 'cancelada'
        WHERE v.activo = true AND v.placa IS NOT NULL
        GROUP BY v.id, v.placa
        HAVING MAX(r.fecha_reserva) IS NULL OR MAX(r.fecha_reserva)::date < CURRENT_DATE - 20
        ORDER BY dias_ocioso DESC NULLS FIRST LIMIT 3
      `),
    ]);

    const demandaMes = demMes.rows.map((r: any) => ({ etiqueta: MES_C[r.mes] || String(r.mes), total: r.total }));
    const mesPico = demMes.rows.length
      ? (() => { const t = demMes.rows.reduce((a: any, b: any) => (b.total > a.total ? b : a)); return { mes: MES_L[t.mes], total: t.total }; })()
      : null;

    const demandaDia = [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const row = demDia.rows.find((x: any) => x.dow === d);
      return { etiqueta: DIA[d], total: row ? row.total : 0 };
    });
    const diaPico = demDia.rows.length
      ? (() => { const t = demDia.rows.reduce((a: any, b: any) => (b.total > a.total ? b : a)); return { dia: DIA[t.dow], total: t.total }; })()
      : null;

    const ingresosMes = Number(ingMes.rows[0]?.total || 0);
    const promedioHistorico = Number(promHist.rows[0]?.prom || 0);
    const hoy = new Date();
    const diaDelMes = hoy.getDate();
    const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const proyeccionMes = diaDelMes > 0 ? Math.round((ingresosMes / diaDelMes) * diasEnMes) : Math.round(ingresosMes);

    const totalCot = Number(conv.rows[0]?.total || 0);
    const aprobadas = Number(conv.rows[0]?.aprobadas || 0);
    const tasa = totalCot > 0 ? Math.round((aprobadas / totalCot) * 100) : 0;

    const rutaMasPedida = rutaTop.rows[0] ? `${rutaTop.rows[0].origen} → ${rutaTop.rows[0].destino}` : null;
    const recomendaciones: string[] = [];
    for (const o of ociosos.rows.slice(0, 2)) {
      const dias = o.dias_ocioso != null ? `${o.dias_ocioso} días` : "un buen tiempo";
      recomendaciones.push(
        `El vehículo ${o.placa} no registra viajes hace ${dias}.` +
        (rutaMasPedida ? ` La ruta más pedida es ${rutaMasPedida} — considera asignarlo ahí.` : " Considera reasignarlo o promocionarlo.")
      );
    }
    if (diaPico) recomendaciones.push(`Los ${diaPico.dia.toLowerCase()} son tu día de mayor demanda — asegura flota disponible.`);
    if (totalCot >= 3 && tasa < 40) recomendaciones.push(`Tu tasa de conversión de cotizaciones es ${tasa}%. Revisa precios y contraofertas para cerrar más viajes.`);
    if (mesPico) recomendaciones.push(`Históricamente, ${mesPico.mes} es tu mes de mayor demanda — prepara la flota con anticipación.`);
    if (recomendaciones.length === 0) recomendaciones.push("Aún no hay suficientes datos para recomendaciones; se generarán a medida que se registren más viajes.");

    return res.json({
      success: true,
      demandaMes,
      demandaDia,
      mesPico,
      diaPico,
      proyeccion: { ingresosMes: Math.round(ingresosMes), proyeccionMes, promedioHistorico: Math.round(promedioHistorico) },
      conversion: { total: totalCot, aprobadas, tasa },
      recomendaciones,
    });
  } catch (error) {
    console.error("Error obteniendo analítica inteligente:", error);
    return res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
};

module.exports = {
  getInteligenciaDashboard,
  getAlertasInteligentes,
  getBadgesSidebar,
  getAnaliticaInteligente,
};
