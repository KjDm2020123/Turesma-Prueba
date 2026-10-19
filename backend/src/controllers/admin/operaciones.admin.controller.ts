export {};

const pool = require("../../config/db");

const ACTIVE_STATES = ["programada", "asignada", "en_curso", "incidencia"];
const VALID_STATES = ["programada", "asignada", "en_curso", "completada", "cancelada", "incidencia"];

const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const dateOrNull = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
};

const timeOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value) ? value : null;
};

const recordHistory = async (client: any, operationId: number, userId: number | null, action: string, oldState: string | null, newState: string | null, detail: Record<string, unknown> = {}) => {
  await client.query(
    `INSERT INTO operacion_historial (operacion_id, usuario_id, accion, estado_anterior, estado_nuevo, detalle)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [operationId, userId, action, oldState, newState, JSON.stringify(detail)]
  );
};

const findScheduleConflict = async (client: any, operationId: number, date: string, start: string | null, end: string | null, vehicleId: number | null, driverId: number | null) => {
  if (!vehicleId && !driverId) return null;

  const result = await client.query(
    `SELECT o.id, o.vehiculo_id, o.conductor_id, v.placa, u.nombre AS conductor_nombre
     FROM operaciones o
     LEFT JOIN vehiculos v ON v.id = o.vehiculo_id
     LEFT JOIN conductores c ON c.id = o.conductor_id
     LEFT JOIN usuarios u ON u.id = c.usuario_id
     WHERE o.id <> $1
       AND o.fecha_programada = $2::date
       AND o.estado = ANY($5::text[])
       AND (o.vehiculo_id = $6 OR o.conductor_id = $7)
       AND (
         $3::time IS NULL OR o.hora_inicio IS NULL OR $4::time IS NULL OR o.hora_fin IS NULL
         OR (o.hora_inicio < $4::time AND $3::time < o.hora_fin)
       )
     LIMIT 1`,
    [operationId, date, start, end, ACTIVE_STATES, vehicleId, driverId]
  );

  return result.rows[0] || null;
};

const getOperation = async (client: any, id: number) => {
  const result = await client.query(
    `SELECT o.*, v.placa AS vehiculo_placa, v.modelo AS vehiculo_modelo,
            u.id AS conductor_usuario_id,
            u.nombre AS conductor_nombre, u.apellido AS conductor_apellido
     FROM operaciones o
     LEFT JOIN vehiculos v ON v.id = o.vehiculo_id
     LEFT JOIN conductores c ON c.id = o.conductor_id
     LEFT JOIN usuarios u ON u.id = c.usuario_id
     WHERE o.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const listarOperaciones = async (req: any, res: any) => {
  try {
    const { desde, hasta, estado } = req.query;
    const params: unknown[] = [];
    const filters = ["1=1"];

    if (desde) {
      params.push(desde);
      filters.push(`o.fecha_programada >= $${params.length}::date`);
    }
    if (hasta) {
      params.push(hasta);
      filters.push(`o.fecha_programada <= $${params.length}::date`);
    }
    if (estado && VALID_STATES.includes(String(estado))) {
      params.push(estado);
      filters.push(`o.estado = $${params.length}`);
    }

    const result = await pool.query(
      `SELECT o.*, v.placa AS vehiculo_placa, v.modelo AS vehiculo_modelo,
              u.id AS conductor_usuario_id,
              u.nombre AS conductor_nombre, u.apellido AS conductor_apellido
       FROM operaciones o
       LEFT JOIN vehiculos v ON v.id = o.vehiculo_id
       LEFT JOIN conductores c ON c.id = o.conductor_id
       LEFT JOIN usuarios u ON u.id = c.usuario_id
       WHERE ${filters.join(" AND ")}
       ORDER BY o.fecha_programada ASC, o.hora_inicio ASC NULLS LAST, o.id DESC
       LIMIT 500`,
      params
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error listando operaciones:", error);
    return res.status(500).json({ success: false, error: "No se pudieron cargar las operaciones" });
  }
};

const listarReservasPorDespachar = async (_req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.fecha_reserva, r.fecha_servicio, r.fecha_salida, r.fecha_llegada,
              r.origen, r.destino, r.num_personas, r.total, r.vehiculo_id, r.conductor_id,
              u.nombre AS cliente_nombre, v.placa AS vehiculo_placa,
              (SELECT o.id FROM operaciones o
               WHERE o.reserva_id = r.id AND o.estado = 'cancelada'
               ORDER BY o.id DESC LIMIT 1) AS operacion_cancelada_id
       FROM reservas r
       LEFT JOIN usuarios u ON u.id = r.usuario_id
       LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
       WHERE r.estado = 'confirmada'
         AND (
           r.vehiculo_id IS NULL OR r.conductor_id IS NULL
           OR EXISTS (SELECT 1 FROM operaciones o WHERE o.reserva_id = r.id AND o.estado = 'cancelada')
         )
         AND NOT EXISTS (
           SELECT 1 FROM operaciones o
           WHERE o.reserva_id = r.id AND o.estado <> 'cancelada'
         )
       ORDER BY COALESCE(r.fecha_salida::date, r.fecha_servicio::date, r.fecha_reserva) ASC, r.id ASC
       LIMIT 200`
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error listando reservas pendientes de despacho:", error);
    return res.status(500).json({ success: false, error: "No se pudieron cargar las reservas por despachar" });
  }
};

const crearOperacionDesdeReserva = async (req: any, res: any) => {
  const reservationId = Number(req.params.id);
  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    return res.status(400).json({ success: false, error: "ID de reserva inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reservation = await client.query(
      `SELECT id, fecha_reserva, fecha_servicio, fecha_salida, fecha_llegada,
              origen, destino, num_personas, estado, vehiculo_id, conductor_id
       FROM reservas WHERE id = $1 FOR UPDATE`,
      [reservationId]
    );
    if (!reservation.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Reserva no encontrada" });
    }

    const current = reservation.rows[0];
    if (current.estado !== "confirmada" || (current.vehiculo_id && current.conductor_id)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, error: "La reserva ya no está pendiente de despacho" });
    }

    const existing = await client.query("SELECT id FROM operaciones WHERE reserva_id = $1 LIMIT 1", [reservationId]);
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, error: "La reserva ya tiene una operación de despacho" });
    }

    const created = await client.query(
      `INSERT INTO operaciones
       (reserva_id, tipo_servicio, fecha_programada, hora_inicio, hora_fin, origen, destino, pasajeros, creado_por)
       VALUES (
         $1, 'reserva',
         COALESCE($2::timestamp::date, $3::timestamp::date, $4::date),
         $2::timestamp::time,
         CASE WHEN $5::timestamp::date = COALESCE($2::timestamp::date, $3::timestamp::date, $4::date)
              THEN $5::timestamp::time ELSE NULL END,
         $6, $7, $8, $9
       )
       RETURNING id`,
      [
        reservationId,
        current.fecha_salida,
        current.fecha_servicio,
        current.fecha_reserva,
        current.fecha_llegada,
        String(current.origen || "Origen pendiente").trim(),
        String(current.destino || "Destino pendiente").trim(),
        Number(current.num_personas) || 1,
        req.user?.id || null,
      ]
    );

    const operationId = Number(created.rows[0].id);
    await recordHistory(client, operationId, req.user?.id || null, "creacion_desde_reserva", null, "programada", { reserva_id: reservationId });
    const operation = await getOperation(client, operationId);
    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: operation });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creando despacho desde reserva:", error);
    return res.status(500).json({ success: false, error: "No se pudo preparar la reserva para despacho" });
  } finally {
    client.release();
  }
};

const crearOperacion = async (req: any, res: any) => {
  const body = req.body || {};
  const date = dateOrNull(body.fecha_programada);
  const start = timeOrNull(body.hora_inicio);
  const end = timeOrNull(body.hora_fin);
  const passengers = Number(body.pasajeros);
  const estimatedKm = numberOrNull(body.kilometros_estimados);

  if (!date || !body.origen || !body.destino || !Number.isInteger(passengers) || passengers <= 0) {
    return res.status(400).json({ success: false, error: "Fecha, origen, destino y pasajeros válidos son obligatorios" });
  }
  if (body.hora_inicio && !start || body.hora_fin && !end || start && end && end <= start) {
    return res.status(400).json({ success: false, error: "El horario de la operación no es válido" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO operaciones
       (reserva_id, tipo_servicio, fecha_programada, hora_inicio, hora_fin, origen, destino, pasajeros, kilometros_estimados, observaciones, creado_por)
       VALUES ($1, $2, $3::date, $4::time, $5::time, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [numberOrNull(body.reserva_id), String(body.tipo_servicio || "viaje").trim().slice(0, 80), date, start, end, String(body.origen).trim(), String(body.destino).trim(), passengers, estimatedKm, body.observaciones || null, req.user?.id || null]
    );

    await recordHistory(pool, result.rows[0].id, req.user?.id || null, "creacion", null, "programada", { origen: body.origen, destino: body.destino });
    const operation = await getOperation(pool, result.rows[0].id);
    return res.status(201).json({ success: true, data: operation });
  } catch (error) {
    console.error("Error creando operación:", error);
    return res.status(500).json({ success: false, error: "No se pudo crear la operación" });
  }
};

const asignarOperacion = async (req: any, res: any) => {
  const operationId = Number(req.params.id);
  const vehicleId = Number(req.body?.vehiculo_id);
  const driverUserId = Number(req.body?.conductor_id);
  const decisionId = req.body?.decision_id === undefined ? null : Number(req.body.decision_id);
  const decisionReason = typeof req.body?.decision_reason === "string" ? req.body.decision_reason.trim() : "";
  if (!Number.isInteger(operationId) || operationId <= 0
    || !Number.isInteger(vehicleId) || vehicleId <= 0
    || !Number.isInteger(driverUserId) || driverUserId <= 0) {
    return res.status(400).json({ success: false, error: "Operación, vehículo y conductor son obligatorios" });
  }
  if ((decisionId !== null && (!Number.isInteger(decisionId) || decisionId <= 0)) || decisionReason.length > 500) {
    return res.status(400).json({ success: false, error: "La decisión de recomendación o su motivo no son válidos" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reject = async (status: number, body: Record<string, unknown>) => {
      await client.query("ROLLBACK");
      return res.status(status).json(body);
    };
    const operation = await client.query("SELECT * FROM operaciones WHERE id = $1 FOR UPDATE", [operationId]);
    if (!operation.rowCount) return reject(404, { success: false, error: "Operación no encontrada" });
    const current = operation.rows[0];
    if (!["programada", "asignada", "incidencia"].includes(current.estado)) {
      return reject(409, { success: false, error: "La operación no permite cambiar la asignación en su estado actual" });
    }

    const vehicle = await client.query(
      `SELECT id, placa, capacidad, estado, activo,
              (fecha_proximo_mantenimiento IS NOT NULL AND fecha_proximo_mantenimiento <= CURRENT_DATE)
              OR (proximo_km_mantenimiento IS NOT NULL AND proximo_km_mantenimiento <= COALESCE(kilometraje, 0)) AS mantenimiento_vencido
       FROM vehiculos WHERE id = $1 FOR UPDATE`,
      [vehicleId]
    );
    if (!vehicle.rowCount) return reject(404, { success: false, error: "Vehículo no encontrado" });
    const vehicleData = vehicle.rows[0];
    if (!vehicleData.activo || ["mantenimiento", "inactivo"].includes(vehicleData.estado)) {
      return reject(409, { success: false, error: "El vehículo no está operativo" });
    }
    if (Number(vehicleData.capacidad) < Number(current.pasajeros)) {
      return reject(409, { success: false, error: "La capacidad del vehículo es insuficiente" });
    }
    if (vehicleData.mantenimiento_vencido) {
      return reject(409, { success: false, error: "El vehículo tiene mantenimiento vencido" });
    }

    const driver = await client.query(
      `SELECT c.id, c.usuario_id, c.estado, c.fecha_licencia_vencimiento, u.activo
       FROM conductores c JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.usuario_id = $1 FOR UPDATE`,
      [driverUserId]
    );
    if (!driver.rowCount) return reject(404, { success: false, error: "El usuario no tiene un perfil de conductor configurado" });
    const driverData = driver.rows[0];
    const driverId = Number(driverData.id);
    if (!driverData.activo || ["inactivo", "mantenimiento"].includes(driverData.estado)) {
      return reject(409, { success: false, error: "El conductor no está disponible" });
    }
    if (driverData.fecha_licencia_vencimiento && new Date(driverData.fecha_licencia_vencimiento) < new Date()) {
      return reject(409, { success: false, error: "La licencia del conductor está vencida" });
    }

    const conflict = await findScheduleConflict(client, operationId, current.fecha_programada, current.hora_inicio, current.hora_fin, vehicleId, driverId);
    if (conflict) {
      const resource = conflict.vehiculo_id === vehicleId ? `vehículo ${conflict.placa || vehicleId}` : `conductor ${conflict.conductor_nombre || driverId}`;
      return reject(409, { success: false, error: `Existe un conflicto de horario con el ${resource}`, conflicto: conflict });
    }

    await client.query(
      `UPDATE operaciones SET vehiculo_id = $1, conductor_id = $2, estado = 'asignada', actualizado_en = CURRENT_TIMESTAMP WHERE id = $3`,
      [vehicleId, driverId, operationId]
    );
    if (current.reserva_id) {
      const reservation = await client.query(
        "SELECT id, estado FROM reservas WHERE id = $1 FOR UPDATE",
        [current.reserva_id]
      );
      if (!reservation.rowCount || ["cancelada", "finalizada"].includes(String(reservation.rows[0]?.estado))) {
        return reject(409, { success: false, error: "La reserva vinculada ya no permite asignar recursos" });
      }

      const target = await client.query(
        `SELECT ccu.table_name AS referenced_table
         FROM information_schema.table_constraints tc
         INNER JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         INNER JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
         WHERE tc.table_schema = 'public' AND tc.table_name = 'reservas'
           AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'conductor_id'
         LIMIT 1`
      );
      const conductorReference = String(target.rows[0]?.referenced_table || "usuarios").toLowerCase() === "conductores"
        ? driverId
        : driverData.usuario_id;
      await client.query(
        "UPDATE reservas SET vehiculo_id = $1, conductor_id = $2 WHERE id = $3",
        [vehicleId, conductorReference, current.reserva_id]
      );
    }
    if (decisionId !== null) {
      const decision = await client.query(
        `UPDATE decisiones_sistema
         SET entidad_id = $2,
             resultado = CASE
               WHEN (recomendacion->'vehiculo'->>'vehiculo_id')::int = $2 THEN 'aceptada'
               ELSE 'alternativa'
             END,
             confirmado_por = $3,
             factores = factores || jsonb_build_object(
               'decision_operador',
               jsonb_build_object(
                 'vehiculo_id', $2,
                 'resultado', CASE
                   WHEN (recomendacion->'vehiculo'->>'vehiculo_id')::int = $2 THEN 'aceptada'
                   ELSE 'alternativa'
                 END,
                 'motivo', NULLIF($4, ''),
                 'registrado_en', CURRENT_TIMESTAMP,
                 'operacion_id', $5
               )
             )
         WHERE id = $1
           AND tipo_decision = 'asignacion_vehiculo'
           AND resultado IS NULL
           AND (recomendacion->>'operacion_id')::int = $5
           AND recomendacion->>'fecha' = $6::date::text
           AND (recomendacion->>'pasajeros')::int = $7
           AND recomendacion->>'hora_inicio' IS NOT DISTINCT FROM to_char($8::time, 'HH24:MI')
           AND recomendacion->>'hora_fin' IS NOT DISTINCT FROM to_char($9::time, 'HH24:MI')
           AND (
             (recomendacion->'vehiculo'->>'vehiculo_id')::int = $2
             OR (
               NULLIF($4, '') IS NOT NULL
               AND EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements(recomendacion->'alternativas') AS opciones(opcion)
                 WHERE (opciones.opcion->>'vehiculo_id')::int = $2
               )
             )
           )
         RETURNING id`,
        [
          decisionId,
          vehicleId,
          req.user?.id || null,
          decisionReason,
          operationId,
          current.fecha_programada,
          Number(current.pasajeros),
          current.hora_inicio,
          current.hora_fin,
        ]
      );
      if (!decision.rowCount) {
        return reject(409, { success: false, error: "La recomendación ya se registró o el vehículo no es una alternativa válida. Si elegiste otra opción, indica el motivo." });
      }
    }
    await recordHistory(client, operationId, req.user?.id || null, "asignacion", current.estado, "asignada", { vehiculo_id: vehicleId, conductor_id: driverId });
    const updated = await getOperation(client, operationId);
    await client.query("COMMIT");
    return res.json({ success: true, data: updated });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error asignando operación:", error);
    return res.status(500).json({ success: false, error: "No se pudo asignar la operación" });
  } finally {
    client.release();
  }
};

const actualizarEstadoOperacion = async (req: any, res: any) => {
  const operationId = Number(req.params.id);
  const nextState = String(req.body?.estado || "");
  if (!Number.isInteger(operationId) || !VALID_STATES.includes(nextState)) {
    return res.status(400).json({ success: false, error: "Estado u operación inválidos" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM operaciones WHERE id = $1 FOR UPDATE", [operationId]);
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Operación no encontrada" });
    }
    const operation = current.rows[0];
    if (nextState === "en_curso" && (!operation.vehiculo_id || !operation.conductor_id)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, error: "No se puede iniciar una operación sin vehículo y conductor" });
    }
    const now = nextState === "en_curso" ? "hora_inicio_real = CURRENT_TIMESTAMP," : nextState === "completada" ? "hora_fin_real = CURRENT_TIMESTAMP," : "";
    await client.query(`UPDATE operaciones SET estado = $1, ${now} actualizado_en = CURRENT_TIMESTAMP WHERE id = $2`, [nextState, operationId]);
    if (operation.reserva_id && ["en_curso", "completada"].includes(nextState)) {
      await client.query(
        "UPDATE reservas SET estado = $1 WHERE id = $2 AND estado NOT IN ('cancelada', 'finalizada')",
        [nextState === "completada" ? "finalizada" : "en_curso", operation.reserva_id]
      );
    }
    if (operation.reserva_id && nextState === "cancelada") {
      await client.query(
        `UPDATE reservas
         SET vehiculo_id = NULL, conductor_id = NULL
         WHERE id = $1 AND estado = 'confirmada'`,
        [operation.reserva_id]
      );
    }
    await recordHistory(client, operationId, req.user?.id || null, "cambio_estado", operation.estado, nextState);
    const updated = await getOperation(client, operationId);
    await client.query("COMMIT");
    return res.json({ success: true, data: updated });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error actualizando operación:", error);
    return res.status(500).json({ success: false, error: "No se pudo actualizar el estado" });
  } finally {
    client.release();
  }
};

const reabrirOperacion = async (req: any, res: any) => {
  const operationId = Number(req.params.id);
  if (!Number.isInteger(operationId) || operationId <= 0) {
    return res.status(400).json({ success: false, error: "ID de operación inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM operaciones WHERE id = $1 FOR UPDATE", [operationId]);
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Operación no encontrada" });
    }
    const operation = current.rows[0];
    if (operation.estado !== "cancelada") {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, error: "Solo se pueden reabrir operaciones canceladas" });
    }

    if (operation.reserva_id) {
      const reservation = await client.query(
        "SELECT id, estado FROM reservas WHERE id = $1 FOR UPDATE",
        [operation.reserva_id]
      );
      if (!reservation.rowCount || reservation.rows[0].estado !== "confirmada") {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, error: "La reserva vinculada ya no está confirmada" });
      }
      await client.query(
        "UPDATE reservas SET vehiculo_id = NULL, conductor_id = NULL WHERE id = $1",
        [operation.reserva_id]
      );
    }

    await client.query(
      `UPDATE operaciones
       SET estado = 'programada', vehiculo_id = NULL, conductor_id = NULL, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [operationId]
    );
    await recordHistory(client, operationId, req.user?.id || null, "reapertura_despacho", "cancelada", "programada");
    const updated = await getOperation(client, operationId);
    await client.query("COMMIT");
    return res.json({ success: true, data: updated });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error reabriendo operación:", error);
    return res.status(500).json({ success: false, error: "No se pudo reabrir la operación" });
  } finally {
    client.release();
  }
};

const historialOperacion = async (req: any, res: any) => {
  const operationId = Number(req.params.id);
  if (!Number.isInteger(operationId)) return res.status(400).json({ success: false, error: "ID inválido" });
  try {
    const result = await pool.query(
      `SELECT h.*, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
       FROM operacion_historial h LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.operacion_id = $1 ORDER BY h.creado_en DESC`,
      [operationId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error consultando historial de operación:", error);
    return res.status(500).json({ success: false, error: "No se pudo consultar el historial" });
  }
};

module.exports = {
  listarOperaciones,
  listarReservasPorDespachar,
  crearOperacionDesdeReserva,
  crearOperacion,
  asignarOperacion,
  actualizarEstadoOperacion,
  reabrirOperacion,
  historialOperacion,
};
