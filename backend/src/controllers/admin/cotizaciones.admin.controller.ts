export {};

const pool = require("../../config/db");
const { crearNotificacion, notificarAdmins } = require("../../config/notificaciones");

// Crea una reserva a partir de una cotización, resolviendo el conductor del
// vehículo (asignacion_vehiculos → conductores.id, o vehiculos.usuario_id).
// Si hay un precio de por medio, la reserva nace 'pendiente_pago': solo pasa a
// 'confirmada' cuando el admin aprueba el comprobante del 50% mínimo
// (ver admin/pagos.admin.controller.ts → aprobarPago).
const crearReservaDesdeCotizacion = async (
  client: any, c: any, precioFinal: number, vehiculoOverride?: number | null, conductorOverride?: number | null
) => {
  const vehiculoFinal = vehiculoOverride || c.vehiculo_id || null;
  let conductorFinal = conductorOverride || null;
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

    const result = await pool.query(
      `INSERT INTO cotizaciones
         (usuario_id, origen, destino, fecha_servicio, fecha_fin, num_personas, tipo_vehiculo, notas,
          vehiculo_id, valor_ofrecido, duracion_valor, duracion_unidad, turno,
          origen_lat, origen_lng, destino_lat, destino_lng, hora_salida)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'admin', $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        usuario_id, origen, destino, fecha_servicio, fechaFin, num_personas, tipo_vehiculo || null, notas || null,
        vehiculo_id ? Number(vehiculo_id) : null,
        num(valor_ofrecido), num(duracion_valor), dUnidad,
        num(origen_lat), num(origen_lng), num(destino_lat), num(destino_lng), horaSalida,
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
};
