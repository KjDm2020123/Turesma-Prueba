export {};

const pool = require("../../config/db");
const { crearNotificacion, notificarAdmins } = require("../../config/notificaciones");
const { getPricing, roadDistanceKm, calculateQuote } = require("../../config/pricing");

// PostgreSQL puede devolver columnas DATE como Date según la configuración del
// driver. Nunca se debe enviar Date.toString() a una columna DATE, porque
// produce valores como "Sun Nov 15" que PostgreSQL no puede interpretar.
const toDateOnly = (value: any, fallbackToday = false) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const text = String(value || "").trim();
  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];

  return fallbackToday ? new Date().toISOString().slice(0, 10) : null;
};

const getReservasConductorTarget = async (client: any) => {
  const result = await client.query(
    `SELECT ccu.table_name AS referenced_table
     FROM information_schema.table_constraints tc
     INNER JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     INNER JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name = 'reservas'
       AND tc.constraint_type = 'FOREIGN KEY'
       AND kcu.column_name = 'conductor_id'
     LIMIT 1`
  );

  return String(result.rows[0]?.referenced_table || "usuarios").toLowerCase();
};

const resolveReservaConductorId = async (client: any, conductorId: number | null) => {
  if (!conductorId) return null;

  const targetTable = await getReservasConductorTarget(client);
  if (targetTable === "conductores") return conductorId;

  const conductor = await client.query(
    `SELECT usuario_id
     FROM conductores
     WHERE id = $1
     LIMIT 1`,
    [conductorId]
  );
  if (!conductor.rowCount || !conductor.rows[0].usuario_id) {
    throw new Error("El conductor seleccionado no tiene un usuario válido");
  }

  return Number(conductor.rows[0].usuario_id);
};

// Busca un conductor y un vehículo disponibles para completar la reserva sin
// intervención manual del conductor. Si ya existe una asignación activa válida,
// la reutiliza; de lo contrario crea una nueva asignación con un par disponible.
const resolverAsignacionAutomatica = async (client: any, c: any) => {
  const capacidad = Number(c.num_personas || 1);
  const tipoVehiculo = String(c.tipo_vehiculo || "").trim().toLowerCase();
  const fechaServicio = toDateOnly(c.fecha_servicio, true);

  const pairRes = await client.query(
    `SELECT v.id AS vehiculo_id, cnd.id AS conductor_id
     FROM vehiculos v
     JOIN conductores cnd ON cnd.estado = 'disponible'
     WHERE v.activo = true
       AND v.estado = 'disponible'
       AND v.capacidad >= $1
       AND v.id NOT IN (SELECT vehiculo_id FROM asignacion_vehiculos WHERE estado = 'activa')
       AND cnd.id NOT IN (SELECT conductor_id FROM asignacion_vehiculos WHERE estado = 'activa')
       AND (
         $2 = ''
         OR LOWER(v.tipo) = $2
         OR LOWER(v.modelo) LIKE '%' || $2 || '%'
         OR LOWER(v.marca) LIKE '%' || $2 || '%'
       )
     ORDER BY v.capacidad ASC, v.id ASC
     LIMIT 1`,
    [capacidad, tipoVehiculo]
  );

  if (!pairRes.rowCount) {
    return { vehiculo_id: null, conductor_id: null };
  }

  const vehiculo_id = Number(pairRes.rows[0].vehiculo_id);
  const conductor_id = Number(pairRes.rows[0].conductor_id);

  await client.query(
    `INSERT INTO asignacion_vehiculos (conductor_id, vehiculo_id, fecha_inicio, observaciones, estado)
     SELECT $1, $2, $3, $4, 'activa'
     WHERE NOT EXISTS (
       SELECT 1 FROM asignacion_vehiculos
       WHERE conductor_id = $1 AND vehiculo_id = $2 AND estado = 'activa'
     )`,
    [conductor_id, vehiculo_id, fechaServicio, `Asignación automática por cotización #${c.id}`]
  );

  await client.query(
    `UPDATE vehiculos
     SET estado = 'en_servicio', usuario_id = (SELECT usuario_id FROM conductores WHERE id = $1)
     WHERE id = $2`,
    [conductor_id, vehiculo_id]
  );

  await client.query(
    `UPDATE conductores SET estado = 'en_servicio' WHERE id = $1`,
    [conductor_id]
  );

  return { vehiculo_id, conductor_id };
};

// Crea una reserva a partir de una cotización, resolviendo el conductor del
// vehículo (asignacion_vehiculos → conductores.id, o vehiculos.usuario_id).
// Si hay un precio de por medio, la reserva nace 'pendiente_pago': solo pasa a
// 'confirmada' cuando el admin aprueba el pago total.
const crearReservaDesdeCotizacion = async (
  client: any, c: any, precioFinal: number, vehiculoOverride?: number | null, conductorOverride?: number | null
) => {
  let vehiculoFinal = vehiculoOverride ?? c.vehiculo_id ?? null;
  let conductorFinal = conductorOverride ?? null;

  if (!vehiculoFinal || !conductorFinal) {
    const autoPair = await resolverAsignacionAutomatica(client, c);
    if (!vehiculoFinal && autoPair.vehiculo_id) vehiculoFinal = autoPair.vehiculo_id;
    if (!conductorFinal && autoPair.conductor_id) conductorFinal = autoPair.conductor_id;
  }

  if (!conductorFinal && vehiculoFinal) {
    const porAsignacion = await client.query(
      `SELECT conductor_id FROM asignacion_vehiculos
       WHERE vehiculo_id = $1 AND estado = 'activa' ORDER BY id DESC LIMIT 1`,
      [vehiculoFinal]
    );
    if (porAsignacion.rowCount) conductorFinal = porAsignacion.rows[0].conductor_id;
    else {
      const porUsuario = await client.query(
        `SELECT cn.id FROM vehiculos v JOIN conductores cn ON cn.usuario_id = v.usuario_id WHERE v.id = $1 LIMIT 1`,
        [vehiculoFinal]
      );
      if (porUsuario.rowCount) conductorFinal = porUsuario.rows[0].id;
    }
  }

  if (!vehiculoFinal && !conductorFinal) {
    const fallback = await resolverAsignacionAutomatica(client, c);
    vehiculoFinal = fallback.vehiculo_id ?? vehiculoFinal;
    conductorFinal = fallback.conductor_id ?? conductorFinal;
  }

  const estadoInicial = Number(precioFinal) > 0 ? "pendiente_pago" : "confirmada";
  const fechaServicio = toDateOnly(c.fecha_servicio);
  const fechaFin = toDateOnly(c.fecha_fin);
  if (!fechaServicio) {
    throw new Error(`La cotización #${c.id} no tiene una fecha de servicio válida`);
  }
  const reservaConductorId = await resolveReservaConductorId(client, conductorFinal);
  const reservaRes = await client.query(
    `INSERT INTO reservas
       (usuario_id, fecha_reserva, fecha_fin, num_personas, total, estado, origen, destino, vehiculo_id, conductor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [c.usuario_id, fechaServicio, fechaFin, c.num_personas, precioFinal, estadoInicial, c.origen, c.destino, vehiculoFinal, reservaConductorId]
  );
  return reservaRes.rows[0].id;
};

// ── Admin: listar todas las cotizaciones ────────────────────────────────────
const listarCotizaciones = async (req: any, res: any) => {
  try {
    const { estado } = req.query;
    const cond = estado && estado !== "todas"
      ? estado === "pendiente" ? `WHERE c.estado IN ('pendiente', 'negociacion')` : `WHERE c.estado = $1`
      : "";
    const params = estado && estado !== "todas" && estado !== "pendiente" ? [estado] : [];

    const result = await pool.query(
      `SELECT c.*,
              CASE WHEN c.estado = 'negociacion' THEN 'pendiente' ELSE c.estado END AS estado,
              u.nombre AS cliente_nombre,
              u.email  AS cliente_email,
              u.telefono AS cliente_telefono,
              v.placa AS vehiculo_placa,
              v.modelo AS vehiculo_modelo,
              v.tipo AS vehiculo_tipo_real,
              vc.id AS vehiculo_conductor_id,
              vu.nombre AS vehiculo_conductor_nombre
       FROM cotizaciones c
       JOIN usuarios u ON u.id = c.usuario_id
       LEFT JOIN vehiculos v ON v.id = c.vehiculo_id
       LEFT JOIN usuarios vu ON vu.id = v.usuario_id
       LEFT JOIN conductores vc ON vc.usuario_id = v.usuario_id
       ${cond}
       ORDER BY c.creado_en DESC`,
      params
    );
    return res.json(result.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error al listar cotizaciones" });
  }
};

// Cliente: crea una reserva pendiente de pago sin pasar por la bandeja de cotizaciones.
const crearReservaDirecta = async (req: any, res: any) => {
  const usuarioId = req.user?.id;
  const { origen, destino, fecha_servicio, fecha_fin, num_personas, vehiculo_id, tipo_vehiculo,
    origen_lat, origen_lng, destino_lat, destino_lng, num_viajes, modalidad_servicio, duracion_horas, hora_salida, notas } = req.body;
  if (!usuarioId || !origen || !destino || !fecha_servicio || !num_personas) {
    return res.status(400).json({ error: "Faltan datos para crear la reserva" });
  }

  const client = await pool.connect();
  try {
    const verified = await client.query("SELECT COALESCE(estado_verificacion, 'no_verificado') AS estado FROM usuarios WHERE id = $1", [usuarioId]);
    if (verified.rows[0]?.estado !== "verificado") {
      return res.status(403).json({ error: "Debes verificar tu identidad antes de reservar.", requiere_verificacion: true });
    }
    const vehicle = vehiculo_id ? await client.query("SELECT id, tipo FROM vehiculos WHERE id = $1 AND activo = true", [Number(vehiculo_id)]) : { rowCount: 0, rows: [] };
    if (vehiculo_id && vehicle.rowCount === 0) {
      return res.status(400).json({ error: "El vehículo seleccionado ya no está disponible" });
    }
    const tipoVehiculo = String(vehicle.rows[0]?.tipo || tipo_vehiculo || "van").trim().toLowerCase();
    if (!vehiculo_id) {
      const category = await client.query(
        `SELECT MAX(capacidad)::int AS capacidad
         FROM vehiculos
         WHERE activo = true AND LOWER(tipo) = LOWER($1)`,
        [tipoVehiculo]
      );
      if (category.rows[0]?.capacidad == null) {
        return res.status(400).json({ error: "La categoría seleccionada ya no está disponible" });
      }
      if (Number(num_personas) > Number(category.rows[0].capacidad)) {
        return res.status(400).json({ error: `La categoría seleccionada admite hasta ${category.rows[0].capacidad} pasajeros` });
      }
    }
    const fechaFin = typeof fecha_fin === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha_fin) && fecha_fin > String(fecha_servicio) ? fecha_fin : null;
    const days = fechaFin ? Math.max(1, Math.round((new Date(fechaFin).getTime() - new Date(String(fecha_servicio).slice(0, 10)).getTime()) / 86400000) + 1) : 1;
    const trips = Math.max(1, Math.floor(Number(num_viajes) || 1));
    const coordinates = [origen_lat, origen_lng, destino_lat, destino_lng].every((value) => Number.isFinite(Number(value)));
    const distanceKm = coordinates ? await roadDistanceKm(Number(origen_lat), Number(origen_lng), Number(destino_lat), Number(destino_lng)) : 0;
    const pricing = await getPricing();
    const serviceMode = String(modalidad_servicio || (fechaFin ? "varios_dias" : "dia")).trim().toLowerCase();
    const hours = Math.max(1, Number(duracion_horas) || 1);
    const breakdown = calculateQuote({ pricing, distanceKm, days, trips, vehicleType: tipoVehiculo, serviceMode, hours });
    await client.query("BEGIN");
    const reservation = await client.query(
      `INSERT INTO reservas (usuario_id, fecha_reserva, fecha_fin, num_personas, total, estado, origen, destino, vehiculo_id, tipo_vehiculo, notas, monto_pagado, estado_pago, hora_salida)
       VALUES ($1, $2, $3, $4, $5, 'pendiente_pago', $6, $7, $8, $9, $10, 0, 'pendiente', $11) RETURNING id, total`,
      [usuarioId, fecha_servicio, fechaFin, Number(num_personas), breakdown.total, origen, destino, vehiculo_id ? Number(vehiculo_id) : null, tipoVehiculo, notas || null, hora_salida || null]
    );
    await client.query("COMMIT");
    const reservaId = Number(reservation.rows[0].id);
    await notificarAdmins(usuarioId, `Nueva reserva directa #${reservaId} pendiente de pago por $${Number(breakdown.total).toFixed(2)}.`, "reserva", reservaId);
    return res.status(201).json({ message: "Solicitud de reserva creada. Continúa con el pago; administración confirmará la reserva después de verificarlo.", reserva_id: reservaId, total: breakdown.total, pago_minimo: Number(breakdown.total) * 0.5 });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creando reserva directa:", error);
    return res.status(500).json({ error: "No se pudo crear la reserva" });
  } finally { client.release(); }
};

// ── Admin: aprobar cotización y crear reserva ────────────────────────────────
const aprobarCotizacion = async (req: any, res: any) => {
  const { id } = req.params;
  const { precio_final, respuesta_admin, vehiculo_id, conductor_id } = req.body;

  const precio = Number(precio_final);
  if (!Number.isFinite(precio) || precio <= 0) {
    return res.status(400).json({ error: "Se requiere un precio_final mayor que cero para aprobar" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cot = await client.query("SELECT * FROM cotizaciones WHERE id = $1", [id]);
    if (cot.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cotización no encontrada" });
    }
    if (!["pendiente", "negociacion"].includes(cot.rows[0].estado)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La cotización ya fue procesada" });
    }

    const c = cot.rows[0];
    if ((vehiculo_id && !conductor_id) || (!vehiculo_id && conductor_id)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Selecciona un vehículo con su conductor asignado" });
    }
    if (vehiculo_id && conductor_id) {
      const vehicle = await client.query(
        `SELECT id, tipo, capacidad
         FROM vehiculos
         WHERE id = $1 AND activo = true`,
        [Number(vehiculo_id)]
      );
      if (!vehicle.rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El vehículo seleccionado no existe o está inactivo" });
      }
      const requestedType = String(c.tipo_vehiculo || "").trim().toLowerCase();
      const vehicleType = String(vehicle.rows[0].tipo || "").trim().toLowerCase();
      if (requestedType && vehicleType !== requestedType) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El vehículo seleccionado no pertenece a la categoría solicitada" });
      }
      if (Number(c.num_personas || 0) > Number(vehicle.rows[0].capacidad || 0)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El vehículo seleccionado no tiene capacidad suficiente" });
      }
      const conductor = await client.query(
        `SELECT c.usuario_id, c.estado,
                EXISTS (
                  SELECT 1 FROM asignacion_vehiculos av
                  WHERE av.conductor_id = c.id
                    AND av.vehiculo_id = $2
                    AND av.estado = 'activa'
                ) AS ya_asignado_al_vehiculo
         FROM conductores c
         JOIN usuarios u ON u.id = c.usuario_id
         WHERE c.id = $1 AND u.activo = true`,
        [Number(conductor_id), Number(vehiculo_id)]
      );
      if (!conductor.rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El conductor seleccionado no existe o está inactivo" });
      }
      const conductorActual = conductor.rows[0];
      if (conductorActual.estado !== "disponible" && !conductorActual.ya_asignado_al_vehiculo) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El conductor seleccionado no está disponible para ese vehículo" });
      }
      if (!conductorActual.ya_asignado_al_vehiculo) {
        await client.query(
          `UPDATE asignacion_vehiculos
           SET estado = 'finalizada', fecha_fin = CURRENT_DATE, actualizado_en = CURRENT_TIMESTAMP
           WHERE estado = 'activa'
             AND (vehiculo_id = $1 OR conductor_id = $2)`,
          [Number(vehiculo_id), Number(conductor_id)]
        );
        await client.query(
          `INSERT INTO asignacion_vehiculos (conductor_id, vehiculo_id, estado)
           VALUES ($1, $2, 'activa')`,
          [Number(conductor_id), Number(vehiculo_id)]
        );
      }
      await client.query(
        `UPDATE vehiculos
         SET usuario_id = $1, estado = 'en_servicio'
         WHERE id = $2 AND activo = true`,
        [conductorActual.usuario_id, Number(vehiculo_id)]
      );
      await client.query(
        `UPDATE conductores SET estado = 'en_servicio' WHERE id = $1`,
        [Number(conductor_id)]
      );
    }
    const reservaId = await crearReservaDesdeCotizacion(client, c, precio, vehiculo_id, conductor_id);

    await client.query(
      `UPDATE cotizaciones
       SET estado = 'aprobada', precio_final = $1, respuesta_admin = $2,
           reserva_id = $3, turno = 'admin', actualizado_en = NOW()
       WHERE id = $4`,
      [precio, respuesta_admin || "Cotización aprobada", reservaId, id]
    );
    await client.query(
      `INSERT INTO cotizacion_negociacion (cotizacion_id, actor, precio, mensaje) VALUES ($1, 'admin', $2, $3)`,
      [id, precio, respuesta_admin || "Cotización aprobada"]
    );

    await client.query("COMMIT");

    // Al cliente: debe pagar el total para que la reserva quede confirmada.
    // Al conductor NO se le notifica todavía: la reserva es invisible para él hasta
    // que el pago se apruebe (ver admin/pagos.admin.controller.ts → aprobarPago).
    await crearNotificacion(req.user?.id, c.usuario_id, `Tu cotización fue APROBADA por $${precio}. Reserva #${reservaId} creada: paga el total para confirmarla.`, reservaId, "reserva", reservaId);

    return res.json({ message: "Cotización aprobada y reserva creada, pendiente de pago", reserva_id: reservaId });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    const message = e instanceof Error ? e.message : "Error al aprobar cotización";
    return res.status(500).json({ error: message });
  } finally {
    client.release();
  }
};

// ── Admin: contraofertar (proponer un precio distinto) ───────────────────────
const contraofertarCotizacion = async (req: any, res: any) => {
  const { id } = req.params;
  const { precio_propuesto, mensaje } = req.body;

  const precio = Number(precio_propuesto);
  if (!Number.isFinite(precio) || precio <= 0) {
    return res.status(400).json({ error: "Se requiere un precio_propuesto mayor que cero" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cot = await client.query("SELECT estado, usuario_id FROM cotizaciones WHERE id = $1", [id]);
    if (cot.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Cotización no encontrada" }); }
    if (!["pendiente", "negociacion"].includes(cot.rows[0].estado)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La cotización ya fue procesada" });
    }
    await client.query(
      `UPDATE cotizaciones
       SET estado = 'negociacion', precio_propuesto = $1, respuesta_admin = $2,
           turno = 'cliente', actualizado_en = NOW()
       WHERE id = $3`,
      [precio, mensaje || null, id]
    );
    await client.query(
      `INSERT INTO cotizacion_negociacion (cotizacion_id, actor, precio, mensaje) VALUES ($1, 'admin', $2, $3)`,
      [id, precio, mensaje || null]
    );
    await client.query("COMMIT");
    await crearNotificacion(req.user?.id, cot.rows[0].usuario_id, `El administrador te propone $${precio} por tu cotización #${id}. Revisa y responde.`, null, "cotizacion", Number(id));
    return res.json({ message: "Contraoferta enviada al cliente" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: "Error al enviar contraoferta" });
  } finally {
    client.release();
  }
};

// ── Cliente: responder a una contraoferta (aceptar / contraofertar / rechazar) ─
const responderCotizacion = async (req: any, res: any) => {
  const { id } = req.params;
  const accion = String(req.body.accion || "").toLowerCase();
  const userId = req.user?.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cot = await client.query("SELECT * FROM cotizaciones WHERE id = $1", [id]);
    if (cot.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Cotización no encontrada" }); }
    const c = cot.rows[0];
    if (Number(c.usuario_id) !== Number(userId)) { await client.query("ROLLBACK"); return res.status(403).json({ error: "No autorizado" }); }
    if (c.estado !== "negociacion") { await client.query("ROLLBACK"); return res.status(400).json({ error: "No hay una propuesta pendiente por responder" }); }

    if (accion === "aceptar") {
      const precioFinal = Number(c.precio_propuesto);
      const reservaId = await crearReservaDesdeCotizacion(client, c, precioFinal);
      await client.query(
        `UPDATE cotizaciones SET estado = 'aprobada', precio_final = $1, reserva_id = $2, turno = 'admin', actualizado_en = NOW() WHERE id = $3`,
        [precioFinal, reservaId, id]
      );
      await client.query(
        `INSERT INTO cotizacion_negociacion (cotizacion_id, actor, precio, mensaje) VALUES ($1, 'cliente', $2, 'Aceptó la propuesta')`,
        [id, precioFinal]
      );
      await client.query("COMMIT");
      // Al conductor NO se le notifica todavía: la reserva queda invisible para él
      // hasta que el pago total sea aprobado por el admin.
      await notificarAdmins(userId, `El cliente ACEPTÓ la propuesta de $${precioFinal} (cotización #${id}). Reserva #${reservaId} creada, pendiente de pago.`, "reserva", reservaId);
      return res.json({ message: "¡Acuerdo alcanzado! Tu reserva fue creada, paga el total para confirmarla", reserva_id: reservaId });
    }

    if (accion === "contraoferta") {
      const nuevoValor = Number(req.body.valor);
      if (!nuevoValor) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Debes enviar un valor" }); }
      await client.query(
        `UPDATE cotizaciones SET estado = 'pendiente', valor_ofrecido = $1, turno = 'admin', actualizado_en = NOW() WHERE id = $2`,
        [nuevoValor, id]
      );
      await client.query(
        `INSERT INTO cotizacion_negociacion (cotizacion_id, actor, precio, mensaje) VALUES ($1, 'cliente', $2, $3)`,
        [id, nuevoValor, req.body.mensaje || null]
      );
      await client.query("COMMIT");
      await notificarAdmins(userId, `El cliente contraoferta $${nuevoValor} en la cotización #${id}.`, "cotizacion", Number(id));
      return res.json({ message: "Tu contrapropuesta fue enviada al administrador" });
    }

    if (accion === "rechazar") {
      await client.query(`UPDATE cotizaciones SET estado = 'rechazada', actualizado_en = NOW() WHERE id = $1`, [id]);
      await client.query(
        `INSERT INTO cotizacion_negociacion (cotizacion_id, actor, precio, mensaje) VALUES ($1, 'cliente', NULL, 'Canceló la negociación')`,
        [id]
      );
      await client.query("COMMIT");
      return res.json({ message: "Cotización cancelada" });
    }

    await client.query("ROLLBACK");
    return res.status(400).json({ error: "Acción inválida" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: "Error al responder la cotización" });
  } finally {
    client.release();
  }
};

// ── Historial de negociación (admin u dueño) ─────────────────────────────────
const obtenerNegociacion = async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const cot = await pool.query("SELECT usuario_id FROM cotizaciones WHERE id = $1", [id]);
    if (cot.rowCount === 0) return res.status(404).json({ error: "Cotización no encontrada" });
    const rol = String(req.user?.rol || "").toLowerCase();
    const esStaff = rol === "admin" || rol === "operativo";
    if (!esStaff && Number(cot.rows[0].usuario_id) !== Number(req.user?.id)) {
      return res.status(403).json({ error: "No autorizado" });
    }
    const hist = await pool.query(
      `SELECT actor, precio, mensaje, creado_en FROM cotizacion_negociacion WHERE cotizacion_id = $1 ORDER BY creado_en ASC`,
      [id]
    );
    return res.json(hist.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error al obtener la negociación" });
  }
};

// ── Admin: rechazar cotización ───────────────────────────────────────────────
const rechazarCotizacion = async (req: any, res: any) => {
  const { id } = req.params;
  const { respuesta_admin } = req.body;
  try {
    const result = await pool.query(
      `UPDATE cotizaciones
       SET estado = 'rechazada', respuesta_admin = $1, actualizado_en = NOW()
       WHERE id = $2 AND estado IN ('pendiente', 'negociacion')
       RETURNING id`,
      [respuesta_admin || "Cotización no disponible", id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Cotización no encontrada o ya procesada" });
    }
    await pool.query(
      `INSERT INTO cotizacion_negociacion (cotizacion_id, actor, precio, mensaje) VALUES ($1, 'admin', NULL, $2)`,
      [id, respuesta_admin || "Cotización no disponible"]
    );
    const dueno = await pool.query("SELECT usuario_id FROM cotizaciones WHERE id = $1", [id]);
    await crearNotificacion(req.user?.id, dueno.rows[0]?.usuario_id, `Tu cotización #${id} fue rechazada. ${respuesta_admin || ""}`.trim(), null, "cotizacion", Number(id));
    return res.json({ message: "Cotización rechazada" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error al rechazar cotización" });
  }
};

// ── Cliente: crear cotización ────────────────────────────────────────────────
const crearCotizacion = async (req: any, res: any) => {
  const usuario_id = req.user?.id || req.body.usuario_id;
  const {
    origen, destino, fecha_servicio, fecha_fin, num_personas, tipo_vehiculo, notas,
    vehiculo_id, valor_ofrecido, duracion_valor, duracion_unidad, hora_salida,
    origen_lat, origen_lng, destino_lat, destino_lng,
    num_viajes, modalidad_servicio, duracion_horas,
  } = req.body;

  if (!usuario_id || !origen || !destino || !fecha_servicio || !num_personas) {
    return res.status(400).json({ error: "Faltan campos requeridos (origen, destino, fecha_servicio, num_personas)" });
  }

  const dUnidad = duracion_unidad === "dias" ? "dias" : "horas";
  const num = (v: any) => (v !== undefined && v !== null && v !== "" ? Number(v) : null);
  const horaSalida = typeof hora_salida === "string" && hora_salida.trim() ? hora_salida.trim().slice(0, 10) : null;
  // Reserva de varios días: la fecha fin solo se guarda si es una fecha válida
  // POSTERIOR a la de inicio; si no, es un servicio de un solo día (null).
  const esFecha = (v: any) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
  const fechaFin = esFecha(fecha_fin) && fecha_fin.trim() > String(fecha_servicio).trim() ? fecha_fin.trim() : null;
  try {
    // Candado de identidad: un cliente solo puede solicitar servicios si su
    // cédula fue verificada por el administrador. El staff (admin/operativo)
    // que crea cotizaciones a nombre de un cliente no pasa por este candado.
    const rol = String(req.user?.rol || "").toLowerCase();
    if (rol === "cliente") {
      const v = await pool.query("SELECT COALESCE(estado_verificacion, 'no_verificado') AS estado FROM usuarios WHERE id = $1", [usuario_id]);
      if ((v.rows[0]?.estado || "no_verificado") !== "verificado") {
        return res.status(403).json({
          error: "Debes verificar tu identidad (cédula) antes de solicitar un servicio.",
          requiere_verificacion: true,
        });
      }
    }

    const trips = Math.max(1, Math.floor(Number(num_viajes) || 1));
    let tipoVehiculo = String(tipo_vehiculo || "").trim().toLowerCase() || null;
    if (vehiculo_id) {
      const vehicleResult = await pool.query("SELECT tipo FROM vehiculos WHERE id = $1", [Number(vehiculo_id)]);
      if (vehicleResult.rows[0]?.tipo) tipoVehiculo = String(vehicleResult.rows[0].tipo).trim().toLowerCase();
    }
    const result = await pool.query(
      `INSERT INTO cotizaciones
         (usuario_id, origen, destino, fecha_servicio, fecha_fin, num_personas, tipo_vehiculo, notas,
          vehiculo_id, valor_ofrecido, precio_estimado, num_viajes, distancia_km, precio_desglose,
          duracion_valor, duracion_unidad, turno,
          origen_lat, origen_lng, destino_lat, destino_lng, hora_salida)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'admin', $17, $18, $19, $20, $21)
       RETURNING *`,
      [
        usuario_id, origen, destino, fecha_servicio, fechaFin, num_personas, tipoVehiculo, notas || null,
        vehiculo_id ? Number(vehiculo_id) : null, num(valor_ofrecido), null, trips, null, null,
        num(duracion_valor), dUnidad, num(origen_lat), num(origen_lng), num(destino_lat), num(destino_lng), horaSalida,
      ]
    );
    const cotizacion = result.rows[0];
    if (cotizacion.valor_ofrecido) {
      await pool.query(
        `INSERT INTO cotizacion_negociacion (cotizacion_id, actor, precio, mensaje) VALUES ($1, 'cliente', $2, 'Solicitud inicial')`,
        [cotizacion.id, cotizacion.valor_ofrecido]
      );
    }
    await notificarAdmins(usuario_id, `Nueva cotización #${cotizacion.id}: ${origen} → ${destino} (${num_personas} pax).`, "cotizacion", cotizacion.id);
    return res.status(201).json(cotizacion);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error al crear cotización" });
  }
};

// ── Cliente: listar mis cotizaciones ────────────────────────────────────────
const listarMisCotizaciones = async (req: any, res: any) => {
  const rol = String(req.user?.rol || "").toLowerCase();
  const esStaff = rol === "admin" || rol === "operativo";
  const usuario_id = esStaff && req.params.usuario_id ? req.params.usuario_id : req.user?.id;

  if (!usuario_id) return res.status(401).json({ error: "No autenticado" });

  try {
    const result = await pool.query(
      `SELECT c.*,
              r.estado AS reserva_estado,
              v.placa AS vehiculo_placa,
              v.modelo AS vehiculo_modelo
       FROM cotizaciones c
       LEFT JOIN reservas r ON r.id = c.reserva_id
       LEFT JOIN vehiculos v ON v.id = c.vehiculo_id
       WHERE c.usuario_id = $1
       ORDER BY c.creado_en DESC`,
      [usuario_id]
    );
    return res.json(result.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error al listar cotizaciones" });
  }
};

// ── Admin: resumen de cotizaciones (KPIs) ────────────────────────────────────
const resumenCotizaciones = async (_req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE estado IN ('pendiente', 'negociacion')) AS pendientes,
         COUNT(*) FILTER (WHERE estado = 'aprobada')    AS aprobadas,
         COUNT(*) FILTER (WHERE estado = 'rechazada')   AS rechazadas,
         COUNT(*) AS total,
         COALESCE(SUM(precio_final) FILTER (WHERE estado = 'aprobada'), 0) AS ingresos_generados
       FROM cotizaciones`
    );
    return res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error al obtener resumen" });
  }
};

module.exports = {
  listarCotizaciones,
  aprobarCotizacion,
  contraofertarCotizacion,
  responderCotizacion,
  obtenerNegociacion,
  rechazarCotizacion,
  crearCotizacion,
  listarMisCotizaciones,
  resumenCotizaciones,
  crearReservaDirecta,
};
