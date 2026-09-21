export {};

const pool = require("../../config/db");

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const formatNumber = (value: unknown) => Number(value || 0).toLocaleString("es-EC");
const formatMoney = (value: unknown) => `$${Number(value || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const answerFromDatabase = async (question: string) => {
  const text = normalize(question);
  const sources: string[] = [];

  if (/(cuantos|cuantas|total|numero|cantidad).*(usuario|usuarios)/.test(text) || /(usuario|usuarios).*(cuantos|cuantas|total|numero|cantidad)/.test(text)) {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE activo = true)::int AS activos,
             COUNT(*) FILTER (WHERE rol = 'admin')::int AS administradores,
             COUNT(*) FILTER (WHERE rol = 'operativo')::int AS operativos,
             COUNT(*) FILTER (WHERE rol = 'cliente')::int AS clientes,
             COUNT(*) FILTER (WHERE rol = 'vehiculo')::int AS conductores
      FROM usuarios
    `);
    const row = result.rows[0];
    sources.push("usuarios");
    return {
      answer: `Hay ${formatNumber(row.total)} usuario(s) registrados, de los cuales ${formatNumber(row.activos)} están activos: ${formatNumber(row.administradores)} administrador(es), ${formatNumber(row.operativos)} operativo(s), ${formatNumber(row.clientes)} cliente(s) y ${formatNumber(row.conductores)} conductor(es).`,
      recommendation: "",
      sources,
    };
  }

  if (/(cuantos|cuantas|total|numero|cantidad).*(vehiculo|vehiculos|carro|carros)/.test(text) || /(vehiculo|vehiculos|carro|carros).*(cuantos|cuantas|total|numero|cantidad)/.test(text)) {
    const result = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE activo = true)::int AS total,
             COUNT(*) FILTER (WHERE activo = true AND estado = 'disponible')::int AS disponibles,
             COUNT(*) FILTER (WHERE activo = true AND estado = 'en_servicio')::int AS en_servicio,
             COUNT(*) FILTER (WHERE activo = true AND estado = 'mantenimiento')::int AS mantenimiento
      FROM vehiculos
    `);
    const row = result.rows[0];
    sources.push("vehiculos");
    return {
      answer: `Hay ${formatNumber(row.total)} vehículo(s) activo(s): ${formatNumber(row.disponibles)} disponible(s), ${formatNumber(row.en_servicio)} en servicio y ${formatNumber(row.mantenimiento)} en mantenimiento.`,
      recommendation: "",
      sources,
    };
  }

  if (/(cuantos|cuantas|total|numero|cantidad).*(conductor|conductores|chofer|choferes)/.test(text) || /(conductor|conductores|chofer|choferes).*(cuantos|cuantas|total|numero|cantidad)/.test(text)) {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE estado = 'disponible')::int AS disponibles,
             COUNT(*) FILTER (WHERE estado = 'en_servicio')::int AS en_servicio
      FROM conductores
    `);
    const row = result.rows[0];
    sources.push("conductores");
    return {
      answer: `Hay ${formatNumber(row.total)} conductor(es): ${formatNumber(row.disponibles)} disponible(s) y ${formatNumber(row.en_servicio)} en servicio.`,
      recommendation: "",
      sources,
    };
  }

  const plateMatch = question.toUpperCase().match(/[A-Z]{2,4}[- ]?\d{3,4}/);
  if (plateMatch && /(vehiculo|carro|auto|placa|estado|kilometraje|mantenimiento)/.test(text)) {
    const plate = plateMatch[0].replace(/[ -]/g, "");
    const result = await pool.query(`
      SELECT v.placa, v.marca, v.modelo, v.tipo, v.capacidad, v.estado, v.activo,
             v.kilometraje, v.fecha_proximo_mantenimiento, v.proximo_km_mantenimiento,
             COUNT(DISTINCT r.id) FILTER (WHERE r.estado <> 'cancelada')::int AS servicios
      FROM vehiculos v
      LEFT JOIN reservas r ON r.vehiculo_id = v.id
      WHERE regexp_replace(UPPER(v.placa), '[^A-Z0-9]', '', 'g') = $1
      GROUP BY v.id
    `, [plate]);
    sources.push("vehiculos", "reservas.vehiculo_id");
    if (!result.rowCount) return { answer: `No encontré un vehículo con la placa ${plate}.`, recommendation: "Verifica la placa escrita o consulta la lista de vehículos registrados.", sources };
    const vehicle = result.rows[0];
    return {
      answer: `${vehicle.placa}: ${vehicle.marca || ""} ${vehicle.modelo || ""}. Estado: ${vehicle.estado}; capacidad: ${formatNumber(vehicle.capacidad)} pasajeros; kilometraje: ${formatNumber(vehicle.kilometraje)} km; servicios registrados: ${formatNumber(vehicle.servicios)}.`,
      recommendation: vehicle.fecha_proximo_mantenimiento || vehicle.proximo_km_mantenimiento ? `Próximo mantenimiento: ${vehicle.fecha_proximo_mantenimiento || "sin fecha"}${vehicle.proximo_km_mantenimiento ? ` o a ${formatNumber(vehicle.proximo_km_mantenimiento)} km` : ""}.` : "Este vehículo no tiene próximo mantenimiento configurado.",
      sources,
    };
  }

  if (/(mas utiliz|mas usado|mayor utilizacion|mayor uso|que carro|cual carro|que vehiculo|cual vehiculo)/.test(text) && /(vehiculo|carro|auto|flota|uso|utiliz)/.test(text)) {
    const result = await pool.query(`
      WITH uso AS (
        SELECT v.id, v.placa, v.modelo,
          COUNT(DISTINCT r.id) FILTER (WHERE r.estado <> 'cancelada')::int AS reservas,
          COUNT(DISTINCT o.id) FILTER (WHERE o.reserva_id IS NULL AND o.estado <> 'cancelada')::int AS operaciones_directas
        FROM vehiculos v
        LEFT JOIN reservas r ON r.vehiculo_id = v.id
        LEFT JOIN operaciones o ON o.vehiculo_id = v.id
        WHERE v.activo = true
        GROUP BY v.id, v.placa, v.modelo
      )
      SELECT *, (reservas + operaciones_directas)::int AS usos
      FROM uso
      ORDER BY usos DESC, placa ASC
      LIMIT 1
    `);
    const vehicle = result.rows[0];
    sources.push("reservas.vehiculo_id", "operaciones.vehiculo_id", "vehiculos.placa");
    if (!vehicle || Number(vehicle.usos) === 0) {
      return {
        answer: "No puedo identificar todavía el vehículo más utilizado porque no hay reservas ni operaciones asociadas a la flota activa.",
        recommendation: "Registra o asigna operaciones para que el indicador de utilización tenga datos reales.",
        sources,
      };
    }
    return {
      answer: `El vehículo más utilizado es ${vehicle.placa} (${vehicle.modelo}), con ${formatNumber(vehicle.usos)} servicio(s) registrado(s): ${formatNumber(vehicle.reservas)} reserva(s) y ${formatNumber(vehicle.operaciones_directas)} operación(es) independiente(s).`,
      recommendation: "Antes de asignarle otro servicio, revisa su mantenimiento y su agenda para evitar sobreutilización o conflictos.",
      sources,
    };
  }

  if (/(menos utilizado|menos usado|subutilizado|menor utilizacion|menor uso)/.test(text) && /(vehiculo|carro|auto|flota|uso|utiliz)/.test(text)) {
    const result = await pool.query(`
      WITH uso AS (
        SELECT v.id, v.placa, v.modelo,
          COUNT(DISTINCT r.id) FILTER (WHERE r.estado <> 'cancelada')::int AS reservas,
          COUNT(DISTINCT o.id) FILTER (WHERE o.reserva_id IS NULL AND o.estado <> 'cancelada')::int AS operaciones_directas
        FROM vehiculos v
        LEFT JOIN reservas r ON r.vehiculo_id = v.id
        LEFT JOIN operaciones o ON o.vehiculo_id = v.id
        WHERE v.activo = true
        GROUP BY v.id, v.placa, v.modelo
      )
      SELECT *, (reservas + operaciones_directas)::int AS usos
      FROM uso
      ORDER BY usos ASC, placa ASC
      LIMIT 1
    `);
    const vehicle = result.rows[0];
    sources.push("reservas.vehiculo_id", "operaciones.vehiculo_id", "vehiculos.placa");
    return {
      answer: vehicle ? `El vehículo menos utilizado es ${vehicle.placa} (${vehicle.modelo}), con ${formatNumber(vehicle.usos)} servicio(s) registrado(s).` : "No hay vehículos activos para analizar.",
      recommendation: vehicle && Number(vehicle.usos) === 0 ? "Revisar si está disponible, correctamente asignado y habilitado para recibir operaciones." : "Comparar su disponibilidad, capacidad y ubicación antes de redistribuir operaciones.",
      sources,
    };
  }

  if (/(vehiculo|carro|auto|flota)/.test(text) && /(disponible|libre|list|cuales|cuales hay|cuantos hay)/.test(text)) {
    const result = await pool.query(`
      SELECT placa, modelo, capacidad
      FROM vehiculos
      WHERE activo = true AND estado = 'disponible'
      ORDER BY placa
      LIMIT 20
    `);
    sources.push("vehiculos.estado", "vehiculos.activo");
    const vehicles = result.rows;
    return {
      answer: vehicles.length ? `Hay ${formatNumber(vehicles.length)} vehículo(s) disponible(s): ${vehicles.map((vehicle: any) => `${vehicle.placa} (${vehicle.modelo}, ${formatNumber(vehicle.capacidad)} pasajeros)`).join("; ")}.` : "No hay vehículos disponibles registrados en este momento.",
      recommendation: vehicles.length ? "Antes de asignar, confirmar horario, capacidad y mantenimiento." : "Revisar operaciones activas y vehículos en mantenimiento.",
      sources,
    };
  }

  if (/(operacion|servicio|viaje|reserva)/.test(text) && /(pendiente|proxima|proximo|hoy|lista|cuales|sin asignar)/.test(text)) {
    const result = await pool.query(`
      SELECT o.id, o.fecha_programada, o.hora_inicio, o.origen, o.destino, o.estado,
             v.placa, u.nombre AS conductor
      FROM operaciones o
      LEFT JOIN vehiculos v ON v.id = o.vehiculo_id
      LEFT JOIN conductores c ON c.id = o.conductor_id
      LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE o.estado IN ('programada', 'asignada', 'en_curso', 'incidencia')
      ORDER BY o.fecha_programada, o.hora_inicio NULLS LAST, o.id
      LIMIT 10
    `);
    sources.push("operaciones", "operaciones.estado", "operaciones.fecha_programada");
    return {
      answer: result.rows.length ? `Encontré ${formatNumber(result.rows.length)} operación(es) que requieren seguimiento: ${result.rows.map((operation: any) => `#${operation.id} ${operation.fecha_programada} ${operation.origen} → ${operation.destino} (${operation.estado}${operation.placa ? `, ${operation.placa}` : ", sin vehículo"})`).join("; ")}.` : "No hay operaciones pendientes o activas registradas.",
      recommendation: result.rows.length ? "Revisar primero las operaciones con incidencia o sin vehículo asignado." : "La agenda operativa no requiere atención inmediata.",
      sources,
    };
  }

  if (/(mantenimiento|taller|revis|kilometraje|vencid)/.test(text)) {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE v.activo = true)::int AS flota,
        COUNT(*) FILTER (WHERE v.activo = true AND v.estado = 'mantenimiento')::int AS en_taller,
        COUNT(*) FILTER (WHERE v.activo = true AND (
          (v.fecha_proximo_mantenimiento IS NOT NULL AND v.fecha_proximo_mantenimiento <= CURRENT_DATE)
          OR (v.proximo_km_mantenimiento IS NOT NULL AND v.proximo_km_mantenimiento <= COALESCE(v.kilometraje, 0))
        ))::int AS vencidos,
        COUNT(*) FILTER (WHERE v.activo = true AND (
          (v.fecha_proximo_mantenimiento > CURRENT_DATE AND v.fecha_proximo_mantenimiento <= CURRENT_DATE + INTERVAL '30 days')
          OR (v.proximo_km_mantenimiento > COALESCE(v.kilometraje, 0) AND v.proximo_km_mantenimiento - COALESCE(v.kilometraje, 0) <= 1500)
        ))::int AS proximos
      FROM vehiculos v
    `);
    const row = result.rows[0];
    sources.push("vehiculos.fecha_proximo_mantenimiento", "vehiculos.proximo_km_mantenimiento", "mantenimiento_vehiculos");
    return {
      answer: `La flota tiene ${formatNumber(row.flota)} vehículo(s): ${formatNumber(row.en_taller)} en mantenimiento, ${formatNumber(row.vencidos)} con mantenimiento vencido y ${formatNumber(row.proximos)} próximo(s) a revisión.`,
      recommendation: Number(row.vencidos) > 0 ? "Prioridad alta: revisar los vehículos vencidos antes de asignarlos a una operación." : Number(row.proximos) > 0 ? "Prioridad preventiva: programar las revisiones próximas para evitar indisponibilidad." : "No se detecta una alerta de mantenimiento con los umbrales configurados.",
      sources,
    };
  }

  if (/(operacion|servicio|viaje|agenda|pendiente|conflicto)/.test(text)) {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE estado = 'programada')::int AS programadas,
        COUNT(*) FILTER (WHERE estado = 'asignada')::int AS asignadas,
        COUNT(*) FILTER (WHERE estado = 'en_curso')::int AS en_curso,
        COUNT(*) FILTER (WHERE estado = 'completada')::int AS completadas,
        COUNT(*) FILTER (WHERE estado = 'incidencia')::int AS incidencias,
        COUNT(*) FILTER (WHERE estado = 'cancelada')::int AS canceladas
      FROM operaciones
      WHERE fecha_programada >= CURRENT_DATE - INTERVAL '30 days'
    `);
    const row = result.rows[0];
    sources.push("operaciones.estado", "operaciones.fecha_programada");
    return {
      answer: `En los últimos 30 días hay ${formatNumber(row.total)} operación(es): ${formatNumber(row.programadas)} programada(s), ${formatNumber(row.asignadas)} asignada(s), ${formatNumber(row.en_curso)} en curso, ${formatNumber(row.completadas)} completada(s), ${formatNumber(row.incidencias)} con incidencia y ${formatNumber(row.canceladas)} cancelada(s).`,
      recommendation: Number(row.incidencias) > 0 ? "Revisar primero las operaciones con incidencia y consultar su historial antes de reasignar recursos." : Number(row.programadas) > 0 ? "Revisar las operaciones programadas que todavía no tienen asignación." : "La agenda no presenta operaciones pendientes de atención inmediata.",
      sources,
    };
  }

  if (/(vehiculo|flota|disponible|utiliz|placa)/.test(text)) {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE activo = true)::int AS total,
        COUNT(*) FILTER (WHERE activo = true AND estado = 'disponible')::int AS disponibles,
        COUNT(*) FILTER (WHERE activo = true AND estado = 'en_servicio')::int AS en_servicio,
        COUNT(*) FILTER (WHERE activo = true AND estado = 'mantenimiento')::int AS mantenimiento,
        COUNT(*) FILTER (WHERE activo = true AND estado = 'inactivo')::int AS inactivos
      FROM vehiculos
    `);
    const row = result.rows[0];
    sources.push("vehiculos.estado", "vehiculos.activo");
    return {
      answer: `La flota activa tiene ${formatNumber(row.total)} vehículo(s): ${formatNumber(row.disponibles)} disponible(s), ${formatNumber(row.en_servicio)} en servicio, ${formatNumber(row.mantenimiento)} en mantenimiento y ${formatNumber(row.inactivos)} inactivo(s).`,
      recommendation: Number(row.disponibles) === 0 ? "No hay vehículos disponibles; revisar operaciones próximas y mantenimiento." : "Para asignar un vehículo, confirmar capacidad, mantenimiento y conflictos de horario.",
      sources,
    };
  }

  if (/(conductor|chofer|licencia|personal)/.test(text)) {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.estado = 'disponible')::int AS disponibles,
        COUNT(*) FILTER (WHERE c.estado = 'en_servicio')::int AS en_servicio,
        COUNT(*) FILTER (WHERE c.estado = 'inactivo')::int AS inactivos,
        COUNT(*) FILTER (WHERE c.fecha_licencia_vencimiento IS NOT NULL AND c.fecha_licencia_vencimiento < CURRENT_DATE)::int AS licencias_vencidas
      FROM conductores c
    `);
    const row = result.rows[0];
    sources.push("conductores.estado", "conductores.fecha_licencia_vencimiento");
    return {
      answer: `Hay ${formatNumber(row.total)} conductor(es): ${formatNumber(row.disponibles)} disponible(s), ${formatNumber(row.en_servicio)} en servicio y ${formatNumber(row.inactivos)} inactivo(s). Se detectan ${formatNumber(row.licencias_vencidas)} licencia(s) vencida(s).`,
      recommendation: Number(row.licencias_vencidas) > 0 ? "No asignar los conductores con licencia vencida hasta actualizar su documentación." : "La disponibilidad de conductores no presenta vencimientos detectados.",
      sources,
    };
  }

  if (/(pago|ingreso|ganancia|venta|dinero|factur)/.test(text)) {
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN estado IN ('confirmada', 'en_curso', 'finalizada') THEN total ELSE 0 END), 0)::numeric AS ingresos,
        COALESCE(SUM(CASE WHEN estado = 'finalizada' THEN total ELSE 0 END), 0)::numeric AS finalizados,
        COUNT(*) FILTER (WHERE estado_pago = 'pendiente')::int AS pagos_pendientes
      FROM reservas
      WHERE fecha_reserva >= date_trunc('month', CURRENT_DATE)
    `);
    const row = result.rows[0];
    sources.push("reservas.total", "reservas.estado", "reservas.estado_pago");
    return {
      answer: `En el mes actual se registran ${formatMoney(row.ingresos)} en reservas confirmadas, en curso o finalizadas; ${formatMoney(row.finalizados)} corresponde a reservas finalizadas y hay ${formatNumber(row.pagos_pendientes)} pago(s) pendiente(s).`,
      recommendation: Number(row.pagos_pendientes) > 0 ? "Revisar los pagos pendientes antes de confirmar servicios relacionados." : "No hay pagos pendientes registrados para el mes actual.",
      sources,
    };
  }

  if (/(cliente|usuario|reserva|cotizacion|cotizac)/.test(text)) {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM usuarios WHERE rol = 'cliente' AND activo = true) AS clientes,
        (SELECT COUNT(*)::int FROM reservas WHERE estado NOT IN ('cancelada', 'finalizada')) AS reservas_activas,
        (SELECT COUNT(*)::int FROM cotizaciones WHERE estado NOT IN ('aprobada', 'rechazada')) AS cotizaciones_pendientes
    `);
    const row = result.rows[0];
    sources.push("usuarios.rol", "reservas.estado", "cotizaciones.estado");
    return {
      answer: `Actualmente hay ${formatNumber(row.clientes)} cliente(s) activos, ${formatNumber(row.reservas_activas)} reserva(s) activas y ${formatNumber(row.cotizaciones_pendientes)} cotización(es) pendientes.`,
      recommendation: Number(row.cotizaciones_pendientes) > 0 ? "Revisar las cotizaciones pendientes para evitar retrasos comerciales y operativos." : "No hay cotizaciones pendientes de respuesta.",
      sources,
    };
  }

  if (!/(resumen|situacion|situacion actual|empresa|sistema|como esta|estado general)/.test(text)) {
    return {
      answer: "No identifiqué una consulta sobre los datos de TURESMA. Puedes preguntarme por vehículos, placas, operaciones, mantenimiento, conductores, pagos, ingresos, clientes o cotizaciones.",
      recommendation: "Formula la pregunta indicando qué información necesitas consultar.",
      sources: [],
    };
  }

  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM vehiculos WHERE activo = true) AS vehiculos,
      (SELECT COUNT(*)::int FROM conductores WHERE estado IN ('disponible', 'en_servicio')) AS conductores,
      (SELECT COUNT(*)::int FROM operaciones WHERE estado IN ('programada', 'asignada', 'en_curso')) AS operaciones_activas,
      (SELECT COUNT(*)::int FROM mantenimiento_vehiculos WHERE fecha_realizada IS NULL AND fecha_programada <= CURRENT_DATE + INTERVAL '30 days') AS mantenimientos_proximos
  `);
  const row = result.rows[0];
  sources.push("vehiculos", "conductores", "operaciones", "mantenimiento_vehiculos");
  return {
    answer: `Resumen actual: ${formatNumber(row.vehiculos)} vehículo(s) activos, ${formatNumber(row.conductores)} conductor(es) disponibles o en servicio, ${formatNumber(row.operaciones_activas)} operación(es) activas y ${formatNumber(row.mantenimientos_proximos)} mantenimiento(s) próximo(s).`,
    recommendation: "Puedes preguntarme por operaciones, vehículos, conductores, mantenimiento, pagos, ingresos, clientes o cotizaciones.",
    sources,
  };
};

const consultarChatbotAdmin = async (req: any, res: any) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim().slice(0, 500) : "";
  if (!question) return res.status(400).json({ success: false, error: "Escribe una pregunta" });

  try {
    const result = await answerFromDatabase(question);
    return res.json({ success: true, question, ...result, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Error consultando chatbot administrativo:", error);
    return res.status(500).json({ success: false, error: "No se pudo consultar la información operativa" });
  }
};

module.exports = { consultarChatbotAdmin };
