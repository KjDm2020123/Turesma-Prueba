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
  const driverId = Number(req.body?.conductor_id);
  if (!Number.isInteger(operationId) || !Number.isInteger(vehicleId) || !Number.isInteger(driverId)) {
    return res.status(400).json({ success: false, error: "Operación, vehículo y conductor son obligatorios" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const operation = await client.query("SELECT * FROM operaciones WHERE id = $1 FOR UPDATE", [operationId]);
    if (!operation.rowCount) return res.status(404).json({ success: false, error: "Operación no encontrada" });
    const current = operation.rows[0];
    if (!["programada", "asignada", "incidencia"].includes(current.estado)) {
      return res.status(409).json({ success: false, error: "La operación no permite cambiar la asignación en su estado actual" });
    }

    const vehicle = await client.query(
      `SELECT id, placa, capacidad, estado, activo,
              (fecha_proximo_mantenimiento IS NOT NULL AND fecha_proximo_mantenimiento <= CURRENT_DATE)
              OR (proximo_km_mantenimiento IS NOT NULL AND proximo_km_mantenimiento <= COALESCE(kilometraje, 0)) AS mantenimiento_vencido
       FROM vehiculos WHERE id = $1 FOR UPDATE`,
      [vehicleId]
    );
    if (!vehicle.rowCount) return res.status(404).json({ success: false, error: "Vehículo no encontrado" });
    const vehicleData = vehicle.rows[0];
    if (!vehicleData.activo || ["mantenimiento", "inactivo"].includes(vehicleData.estado)) {
      return res.status(409).json({ success: false, error: "El vehículo no está operativo" });
    }
    if (Number(vehicleData.capacidad) < Number(current.pasajeros)) {
      return res.status(409).json({ success: false, error: "La capacidad del vehículo es insuficiente" });
    }
    if (vehicleData.mantenimiento_vencido) {
      return res.status(409).json({ success: false, error: "El vehículo tiene mantenimiento vencido" });
    }

    const driver = await client.query(
      `SELECT c.id, c.estado, c.fecha_licencia_vencimiento, u.activo
       FROM conductores c JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.id = $1 FOR UPDATE`,
      [driverId]
    );
    if (!driver.rowCount) return res.status(404).json({ success: false, error: "Conductor no encontrado" });
    const driverData = driver.rows[0];
    if (!driverData.activo || ["inactivo", "mantenimiento"].includes(driverData.estado)) {
      return res.status(409).json({ success: false, error: "El conductor no está disponible" });
    }
    if (driverData.fecha_licencia_vencimiento && new Date(driverData.fecha_licencia_vencimiento) < new Date()) {
      return res.status(409).json({ success: false, error: "La licencia del conductor está vencida" });
    }

    const conflict = await findScheduleConflict(client, operationId, current.fecha_programada, current.hora_inicio, current.hora_fin, vehicleId, driverId);
    if (conflict) {
      const resource = conflict.vehiculo_id === vehicleId ? `vehículo ${conflict.placa || vehicleId}` : `conductor ${conflict.conductor_nombre || driverId}`;
      return res.status(409).json({ success: false, error: `Existe un conflicto de horario con el ${resource}`, conflicto: conflict });
    }

    await client.query(
      `UPDATE operaciones SET vehiculo_id = $1, conductor_id = $2, estado = 'asignada', actualizado_en = CURRENT_TIMESTAMP WHERE id = $3`,
      [vehicleId, driverId, operationId]
    );
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

  try {
    const current = await pool.query("SELECT * FROM operaciones WHERE id = $1", [operationId]);
    if (!current.rowCount) return res.status(404).json({ success: false, error: "Operación no encontrada" });
    const operation = current.rows[0];
    if (nextState === "en_curso" && (!operation.vehiculo_id || !operation.conductor_id)) {
      return res.status(409).json({ success: false, error: "No se puede iniciar una operación sin vehículo y conductor" });
    }
    const now = nextState === "en_curso" ? "hora_inicio_real = CURRENT_TIMESTAMP," : nextState === "completada" ? "hora_fin_real = CURRENT_TIMESTAMP," : "";
    await pool.query(`UPDATE operaciones SET estado = $1, ${now} actualizado_en = CURRENT_TIMESTAMP WHERE id = $2`, [nextState, operationId]);
    await recordHistory(pool, operationId, req.user?.id || null, "cambio_estado", operation.estado, nextState);
    return res.json({ success: true, data: await getOperation(pool, operationId) });
  } catch (error) {
    console.error("Error actualizando operación:", error);
    return res.status(500).json({ success: false, error: "No se pudo actualizar el estado" });
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

module.exports = { listarOperaciones, crearOperacion, asignarOperacion, actualizarEstadoOperacion, historialOperacion };
