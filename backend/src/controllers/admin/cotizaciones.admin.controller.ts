export {};

const pool = require("../../config/db");
const { crearNotificacion, notificarAdmins } = require("../../config/notificaciones");
const { getPricing, roadDistanceKm, calculateQuote } = require("../../config/pricing");
const { createPaypalOrder } = require("../../config/paypal");

// Busca un conductor y un vehículo disponibles para completar la reserva sin
// intervención manual del conductor. Si ya existe una asignación activa válida,
// la reutiliza; de lo contrario crea una nueva asignación con un par disponible.
const resolverAsignacionAutomatica = async (client: any, c: any) => {
  const capacidad = Number(c.num_personas || 1);
  const tipoVehiculo = String(c.tipo_vehiculo || "").trim().toLowerCase();
  const fechaServicio = c.fecha_servicio ? String(c.fecha_servicio).slice(0, 10) : new Date().toISOString().slice(0, 10);

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
// 'confirmada' cuando el admin aprueba el comprobante del 50% mínimo.
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
  const reservaRes = await client.query(
    `INSERT INTO reservas
       (usuario_id, fecha_reserva, fecha_fin, num_personas, total, estado, origen, destino, vehiculo_id, conductor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [c.usuario_id, c.fecha_servicio, c.fecha_fin || null, c.num_personas, precioFinal, estadoInicial, c.origen, c.destino, vehiculoFinal, conductorFinal]
  );
  return reservaRes.rows[0].id;
};

// ── Admin: listar todas las cotizaciones ────────────────────────────────────
const listarCotizaciones = async (req: any, res: any) => {
  try {
    const { estado } = req.query;
    const cond = estado && estado !== "todas" ? `WHERE c.estado = $1` : "";
    const params = estado && estado !== "todas" ? [estado] : [];

    const result = await pool.query(
      `SELECT c.*,
              u.nombre AS cliente_nombre,
              u.email  AS cliente_email,
              u.telefono AS cliente_telefono,
              v.placa AS vehiculo_placa,
              v.modelo AS vehiculo_modelo,
              v.tipo AS vehiculo_tipo_real
       FROM cotizaciones c
       JOIN usuarios u ON u.id = c.usuario_id
       LEFT JOIN vehiculos v ON v.id = c.vehiculo_id
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

// Cliente: acepta el precio visible y crea la reserva directamente, sin pasar
// por la bandeja de cotizaciones del administrador.
const crearReservaDirecta = async (req: any, res: any) => {
  const usuarioId = req.user?.id;
  const { origen, destino, fecha_servicio, fecha_fin, num_personas, vehiculo_id,
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
    const tipoVehiculo = String(vehicle.rows[0]?.tipo || "van").trim().toLowerCase();
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
      `INSERT INTO reservas (usuario_id, fecha_reserva, fecha_fin, num_personas, total, estado, origen, destino, vehiculo_id, monto_pagado, estado_pago, hora_salida)
       VALUES ($1, $2, $3, $4, $5, 'pendiente_pago', $6, $7, $8, 0, 'pendiente', $9) RETURNING id, total`,
      [usuarioId, fecha_servicio, fechaFin, Number(num_personas), breakdown.total, origen, destino, vehiculo_id ? Number(vehiculo_id) : null, hora_salida || null]
    );
    await client.query("COMMIT");
    const reservaId = Number(reservation.rows[0].id);
    await notificarAdmins(usuarioId, `Nueva reserva directa #${reservaId} pendiente de pago por $${Number(breakdown.total).toFixed(2)}.`, "reserva", reservaId);
    let approvalUrl = null;
    try {
      const minimum = Number(breakdown.total) * 0.5;
      const order = await createPaypalOrder(minimum, reservaId);
      approvalUrl = order.links?.find((link: any) => link.rel === "approve")?.href || null;
    } catch (paypalError) {
      console.warn("Reserva creada sin orden PayPal; podrá pagarse por transferencia:", paypalError.message);
    }
    return res.status(201).json({ message: "Reserva creada. Continúa con el pago para confirmarla.", reserva_id: reservaId, total: breakdown.total, pago_minimo: Number(breakdown.total) * 0.5, approval_url: approvalUrl });
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

  if (!precio_final) {
    return res.status(400).json({ error: "Se requiere precio_final para aprobar" });
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
    const reservaId = await crearReservaDesdeCotizacion(client, c, Number(precio_final), vehiculo_id, conductor_id);

    await client.query(
      `UPDATE cotizaciones
       SET estado = 'aprobada', precio_final = $1, respuesta_admin = $2,
           reserva_id = $3, turno = 'admin', actualizado_en = NOW()
       WHERE id = $4`,
      [precio_final, respuesta_admin || "Cotización aprobada", reservaId, id]
    );
    await client.query(
      `INSERT INTO cotizacion_negociacion (cotizacion_id, actor, precio, mensaje) VALUES ($1, 'admin', $2, $3)`,
      [id, precio_final, respuesta_admin || "Cotización aprobada"]
    );

    await client.query("COMMIT");

    // Al cliente: debe pagar el mínimo (50%) para que la reserva quede confirmada.
    // Al conductor NO se le notifica todavía: la reserva es invisible para él hasta
    // que el pago se apruebe (ver admin/pagos.admin.controller.ts → aprobarPago).
    await crearNotificacion(req.user?.id, c.usuario_id, `Tu cotización fue APROBADA por $${precio_final}. Reserva #${reservaId} creada: paga al menos el 50% para confirmarla.`, reservaId, "reserva", reservaId);

    return res.json({ message: "Cotización aprobada y reserva creada, pendiente de pago", reserva_id: reservaId });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    return res.status(500).json({ error: "Error al aprobar cotización" });
  } finally {
    client.release();
  }
};

// ── Admin: contraofertar (proponer un precio distinto) ───────────────────────
const contraofertarCotizacion = async (req: any, res: any) => {
  const { id } = req.params;
  const { precio_propuesto, mensaje } = req.body;

  if (!precio_propuesto) {
    return res.status(400).json({ error: "Se requiere precio_propuesto" });
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
      [precio_propuesto, mensaje || null, id]
    );
    await client.query(
      `INSERT INTO cotizacion_negociacion (cotizacion_id, actor, precio, mensaje) VALUES ($1, 'admin', $2, $3)`,
      [id, precio_propuesto, mensaje || null]
    );
    await client.query("COMMIT");
    await crearNotificacion(req.user?.id, cot.rows[0].usuario_id, `El administrador te propone $${precio_propuesto} por tu cotización #${id}. Revisa y responde.`, null, "cotizacion", Number(id));
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
      // hasta que el pago mínimo (50%) sea aprobado por el admin.
      await notificarAdmins(userId, `El cliente ACEPTÓ la propuesta de $${precioFinal} (cotización #${id}). Reserva #${reservaId} creada, pendiente de pago.`, "reserva", reservaId);
      return res.json({ message: "¡Acuerdo alcanzado! Tu reserva fue creada, paga al menos el 50% para confirmarla", reserva_id: reservaId });
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
  // Tope de días seguidos por servicio (red de seguridad; el front ya lo limita).
  const MAX_DIAS = 30;
  if (fechaFin) {
    const dias = Math.round((new Date(fechaFin).getTime() - new Date(String(fecha_servicio).slice(0, 10)).getTime()) / 86400000) + 1;
    if (dias > MAX_DIAS) {
      return res.status(400).json({ error: `El servicio no puede superar los ${MAX_DIAS} días seguidos.` });
    }
  }

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

    const days = fechaFin
      ? Math.max(1, Math.round((new Date(fechaFin).getTime() - new Date(String(fecha_servicio).slice(0, 10)).getTime()) / 86400000) + 1)
      : 1;
    const trips = Math.max(1, Math.floor(Number(num_viajes) || 1));
    const hasCoordinates = [origen_lat, origen_lng, destino_lat, destino_lng].every((value) => Number.isFinite(Number(value)));
    const distanceKm = hasCoordinates
      ? await roadDistanceKm(Number(origen_lat), Number(origen_lng), Number(destino_lat), Number(destino_lng))
      : 0;
    let tipoVehiculo = String(tipo_vehiculo || "").trim().toLowerCase() || null;
    if (vehiculo_id) {
      const vehicleResult = await pool.query("SELECT tipo FROM vehiculos WHERE id = $1", [Number(vehiculo_id)]);
      if (vehicleResult.rows[0]?.tipo) tipoVehiculo = String(vehicleResult.rows[0].tipo).trim().toLowerCase();
    }
    const pricing = await getPricing();
    const serviceMode = String(modalidad_servicio || (fechaFin ? "varios_dias" : "dia")).trim().toLowerCase();
    const serviceHours = Math.max(1, Number(duracion_horas) || 1);
    const priceBreakdown = calculateQuote({ pricing, distanceKm, days, trips, vehicleType: tipoVehiculo, serviceMode, hours: serviceHours });

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
        vehiculo_id ? Number(vehiculo_id) : null, num(valor_ofrecido), priceBreakdown.total, trips, priceBreakdown.distance_km,
        JSON.stringify({ ...priceBreakdown, pricing: {
          tarifa_diaria: Number(pricing.tarifa_diaria), precio_km: Number(pricing.precio_km),
          tarifa_viaje: Number(pricing.tarifa_viaje), recargo_peajes: Number(pricing.recargo_peajes),
          tarifa_van: Number(pricing.tarifa_van), tarifa_bus: Number(pricing.tarifa_bus),
          tarifa_suv: Number(pricing.tarifa_suv), tarifa_minibus: Number(pricing.tarifa_minibus),
          tarifa_sedan: Number(pricing.tarifa_sedan), service_mode: serviceMode, hours: serviceHours,
        } }),
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
         COUNT(*) FILTER (WHERE estado = 'pendiente')   AS pendientes,
         COUNT(*) FILTER (WHERE estado = 'negociacion') AS negociacion,
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
