export {};

const pool = require("../config/db");
const { crearNotificacion, notificarAdmins } = require("../config/notificaciones");

const optionalText = (value: unknown, maxLength: number): string | null | undefined => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length > maxLength) return undefined;
  return text || null;
};

const validDate = (value: unknown): string | null | undefined => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : undefined;
};

const normalizeServiceGroups = (value: unknown) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const groups = [];
  for (const rawGroup of value) {
    if (!rawGroup || typeof rawGroup !== "object" || Array.isArray(rawGroup)) return null;
    const group = rawGroup as Record<string, unknown>;
    const count = Number(group.cantidad_vehiculos);
    const passengers = group.pasajeros_por_vehiculo === "" || group.pasajeros_por_vehiculo == null
      ? null
      : Number(group.pasajeros_por_vehiculo);
    const startDate = validDate(group.fecha_servicio);
    const endDate = validDate(group.fecha_fin);
    const departureTime = optionalText(group.hora_salida, 10);
    const origin = optionalText(group.origen, 300);
    const destination = optionalText(group.destino, 300);
    const vehicleType = optionalText(group.tipo_vehiculo, 100);
    const stops = optionalText(group.paradas, 1000);
    const details = optionalText(group.detalles, 2000);

    if (!Number.isInteger(count) || count < 1 || count > 1000) return null;
    if (passengers !== null && (!Number.isInteger(passengers) || passengers < 1 || passengers > 1000)) return null;
    if ([startDate, endDate].includes(undefined) || [departureTime, origin, destination, vehicleType, stops, details].includes(undefined)) return null;
    if (endDate && (!startDate || endDate < startDate)) return null;
    if (departureTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(departureTime)) return null;
    if (typeof group.simultaneo !== "boolean") return null;

    groups.push({
      cantidad_vehiculos: count,
      tipo_vehiculo: vehicleType,
      pasajeros_por_vehiculo: passengers,
      fecha_servicio: startDate,
      fecha_fin: endDate,
      hora_salida: departureTime,
      origen: origin,
      destino: destination,
      paradas: stops,
      detalles: details,
      simultaneo: group.simultaneo,
    });
  }
  if (groups.reduce((total, group) => total + group.cantidad_vehiculos, 0) > 1000) return null;
  return groups;
};

const crearRequerimiento = async (req: any, res: any) => {
  const usuarioId = Number(req.user?.id);
  const body = req.body || {};
  const detalles = typeof body.detalles === "string" ? body.detalles.trim() : "";
  const organizacion = optionalText(body.organizacion, 200);
  const serviceGroups = normalizeServiceGroups(body.grupos_servicio);

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(401).json({ error: "No se pudo identificar al cliente" });
  }
  if (organizacion === undefined) {
    return res.status(400).json({ error: "Revisa los textos: uno de los campos supera la longitud permitida o no es válido" });
  }
  if (!serviceGroups) return res.status(400).json({ error: "Revisa los grupos de servicio y asegúrate de completar sus datos correctamente" });
  if (detalles.length < 10 || detalles.length > 5000) {
    return res.status(400).json({ error: "Describe el requerimiento con al menos 10 caracteres y máximo 5000" });
  }
  const totalVehiculos = serviceGroups.reduce((total, group) => total + group.cantidad_vehiculos, 0);
  const firstGroup = serviceGroups[0];
  const distinctTypes = Array.from(new Set(serviceGroups.map(group => group.tipo_vehiculo).filter(Boolean)));
  const legacyVehicleType = distinctTypes.length === 1 ? distinctTypes[0] : distinctTypes.length > 1 ? "Varios" : null;

  try {
    const result = await pool.query(
      `INSERT INTO requerimientos_personalizados
         (usuario_id, organizacion, cantidad_vehiculos, tipo_vehiculo, pasajeros_por_vehiculo,
          fecha_servicio, fecha_fin, hora_salida, origen, destino, detalles, service_groups)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, estado, creado_en`,
      [
        usuarioId,
        organizacion,
        totalVehiculos,
        legacyVehicleType,
        serviceGroups.length === 1 ? firstGroup.pasajeros_por_vehiculo : null,
        firstGroup.fecha_servicio,
        firstGroup.fecha_fin,
        firstGroup.hora_salida,
        firstGroup.origen,
        firstGroup.destino,
        detalles,
        JSON.stringify(serviceGroups),
      ]
    );
    const requerimiento = result.rows[0];
    await notificarAdmins(usuarioId, `Nuevo requerimiento personalizado #${requerimiento.id}`, "requerimiento", requerimiento.id);
    return res.status(201).json(requerimiento);
  } catch (error) {
    console.error("Error creando requerimiento personalizado:", error);
    return res.status(500).json({ error: "No se pudo enviar el requerimiento. Intenta nuevamente." });
  }
};

const listarMisRequerimientos = async (req: any, res: any) => {
  const usuarioId = Number(req.user?.id);
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(401).json({ error: "No se pudo identificar al cliente" });
  }
  try {
    const result = await pool.query(
      `SELECT id, organizacion, cantidad_vehiculos, tipo_vehiculo, pasajeros_por_vehiculo, service_groups,
              fecha_servicio, fecha_fin, hora_salida, origen, destino, detalles, estado,
              precio_final, reserva_id, respuesta_admin, creado_en, actualizado_en
       FROM requerimientos_personalizados
       WHERE usuario_id = $1
       ORDER BY creado_en DESC
       LIMIT 100`,
      [usuarioId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Error listando requerimientos personalizados del cliente:", error);
    return res.status(500).json({ error: "No se pudieron cargar tus requerimientos" });
  }
};

const listarRequerimientosAdmin = async (_req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.nombre AS cliente_nombre, u.email AS cliente_email, u.telefono AS cliente_telefono
       FROM requerimientos_personalizados r
       JOIN usuarios u ON u.id = r.usuario_id
       ORDER BY CASE WHEN r.estado IN ('pendiente', 'en_revision') THEN 0 ELSE 1 END,
                r.creado_en DESC
       LIMIT 300`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Error listando requerimientos personalizados para administración:", error);
    return res.status(500).json({ error: "No se pudieron cargar los requerimientos personalizados" });
  }
};

const actualizarRequerimientoAdmin = async (req: any, res: any) => {
  const id = Number(req.params.id);
  const usuarioAdminId = Number(req.user?.id);
  const estado = String(req.body?.estado || "").trim();
  const respuesta = String(req.body?.respuesta_admin || "").trim();
  const precioRaw = req.body?.precio_final;
  const precio = precioRaw === "" || precioRaw === null || precioRaw === undefined ? null : Number(precioRaw);
  const estadosValidos = ["pendiente", "en_revision", "respondido", "cerrado"];

  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Requerimiento inválido" });
  if (!estadosValidos.includes(estado)) return res.status(400).json({ error: "Selecciona un estado válido" });
  if (respuesta.length > 5000) return res.status(400).json({ error: "La respuesta no puede superar 5000 caracteres" });
  if (precio !== null && (!Number.isFinite(precio) || precio < 0 || precio > 100000000)) {
    return res.status(400).json({ error: "Ingresa un precio válido" });
  }

  try {
    const result = await pool.query(
      `UPDATE requerimientos_personalizados
       SET estado = $1, precio_final = $2, respuesta_admin = $3, respondido_por = $4, actualizado_en = NOW()
       WHERE id = $5
       RETURNING id, usuario_id, estado, precio_final, respuesta_admin, actualizado_en`,
      [estado, precio, respuesta || null, Number.isInteger(usuarioAdminId) ? usuarioAdminId : null, id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "No se encontró el requerimiento" });
    const updated = result.rows[0];
    await crearNotificacion(
      usuarioAdminId,
      Number(updated.usuario_id),
      `Turesma actualizó tu requerimiento personalizado #${id}: ${estado.replace("_", " ")}`,
      null,
      null,
      null
    );
    return res.json(updated);
  } catch (error) {
    console.error("Error actualizando requerimiento personalizado:", error);
    return res.status(500).json({ error: "No se pudo guardar la respuesta. Intenta nuevamente." });
  }
};

const pagarRequerimiento = async (req: any, res: any) => {
  const requerimientoId = Number(req.params.id);
  const usuarioId = Number(req.user?.id);
  if (!Number.isInteger(requerimientoId) || requerimientoId <= 0) {
    return res.status(400).json({ error: "Requerimiento inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT * FROM requerimientos_personalizados
       WHERE id = $1 AND usuario_id = $2
       FOR UPDATE`,
      [requerimientoId, usuarioId]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No se encontró el requerimiento" });
    }
    const request = result.rows[0];
    if (request.reserva_id) {
      await client.query("COMMIT");
      return res.json({ reserva_id: Number(request.reserva_id), message: "Este requerimiento ya está listo para pago." });
    }
    const precio = Number(request.precio_final);
    if (!Number.isFinite(precio) || precio <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El requerimiento todavía no tiene un precio aprobado" });
    }
    const groups = Array.isArray(request.service_groups) ? request.service_groups : [];
    const group = groups[0] || {};
    const fechaServicio = validDate(group.fecha_servicio) || new Date().toISOString().slice(0, 10);
    const fechaFin = validDate(group.fecha_fin);
    const notas = [
      `Requerimiento personalizado #${requerimientoId}`,
      request.detalles,
      groups.length > 1 ? `Grupos de servicio: ${JSON.stringify(groups)}` : "",
    ].filter(Boolean).join("\n\n");
    const reservation = await client.query(
      `INSERT INTO reservas
         (usuario_id, fecha_reserva, fecha_fin, num_personas, total, estado,
          origen, destino, tipo_vehiculo, notas, monto_pagado, estado_pago, hora_salida)
       VALUES ($1, $2, $3, $4, $5, 'pendiente_pago', $6, $7, $8, $9, 0, 'pendiente', $10)
       RETURNING id`,
      [
        usuarioId,
        fechaServicio,
        fechaFin,
        Number(group.pasajeros_por_vehiculo) || 1,
        precio,
        group.origen || "Por definir",
        group.destino || "Por definir",
        group.tipo_vehiculo || null,
        notas,
        group.hora_salida || null,
      ]
    );
    const reservaId = Number(reservation.rows[0].id);
    await client.query(
      `UPDATE requerimientos_personalizados
       SET reserva_id = $1, actualizado_en = NOW()
       WHERE id = $2`,
      [reservaId, requerimientoId]
    );
    await client.query("COMMIT");
    await notificarAdmins(usuarioId, `El cliente solicitó pagar el requerimiento personalizado #${requerimientoId}. Reserva #${reservaId} pendiente de pago.`, "reserva", reservaId);
    return res.status(201).json({
      message: "Reserva creada. Continúa con el pago.",
      reserva_id: reservaId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error preparando pago del requerimiento personalizado:", error);
    return res.status(500).json({ error: "No se pudo preparar el pago. Intenta nuevamente." });
  } finally {
    client.release();
  }
};

module.exports = {
  crearRequerimiento,
  listarMisRequerimientos,
  listarRequerimientosAdmin,
  actualizarRequerimientoAdmin,
  pagarRequerimiento,
};
