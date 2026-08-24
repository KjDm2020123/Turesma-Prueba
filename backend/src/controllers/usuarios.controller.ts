export {};

const pool = require("../config/db");
const bcrypt = require("bcrypt");
const { normalizeRole } = require("../config/catalogoHelpers");
const { enviarCorreoBienvenida } = require("../config/usuarioMailer");
const { notificarReprogramacion } = require("../config/reservaMailer");

const crearUsuario = async (req, res) => {
  const { nombre, email: rawEmail, password, rol } = req.body;

  if (!nombre || !rawEmail || !password) {
    return res.status(400).json({ error: "Debes enviar nombre, email y password" });
  }

  const email = String(rawEmail).trim();
  const normalizedRole = await normalizeRole(rol || "cliente");

  if (!normalizedRole) {
    return res.status(400).json({ error: "Rol inválido. Debe ser admin, cliente, operativo o vehiculo" });
  }

  try {
    const exists = await pool.query(
      "SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );

    if (exists.rowCount) {
      return res.status(409).json({ error: "El email ya está registrado" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const insertResult = await pool.query(
      "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, rol, creado_en",
      [nombre, email, hashedPassword, normalizedRole]
    );

    // Correo de bienvenida a los clientes recién registrados (best-effort).
    if (normalizedRole === "cliente") {
      await enviarCorreoBienvenida({ email, nombre });
    }

    return res.status(201).json({ message: "Usuario guardado correctamente", user: insertResult.rows[0] });
  } catch (error) {
    console.error("Error creando usuario:", error);

    if (error && error.code === "23505") {
      return res.status(409).json({ error: "El email ya está registrado" });
    }

    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const listarUsuarios = async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, nombre, email, rol, creado_en FROM usuarios ORDER BY id ASC"
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando usuarios:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const listarVehiculosCliente = async (req, res) => {
  const fecha = req.query.fecha;

  try {
    const result = await pool.query(
      `SELECT
         v.id,
         v.placa,
         v.tipo,
         v.modelo,
         v.capacidad,
         v.color,
         v.imagen_url,
         v.descripcion,
         COALESCE(v.dias_servicio, ARRAY[0,1,2,3,4,5,6]) AS dias_servicio,
         v.estado,
         u.id AS conductor_id,
         u.nombre AS conductor_nombre,
         u.telefono AS conductor_telefono,
         CASE
           WHEN $1::text IS NULL THEN NULL
           ELSE (
             v.activo = true
             AND v.estado = 'disponible'
             AND COALESCE(
               (
                 SELECT vd.disponible
                 FROM vehiculo_disponibilidad vd
                 WHERE vd.vehiculo_id = v.id
                   AND vd.fecha = $1::date
                 LIMIT 1
               ),
               EXTRACT(DOW FROM $1::date)::INT = ANY(COALESCE(v.dias_servicio, ARRAY[0,1,2,3,4,5,6]))
             ) = true
             AND NOT EXISTS (
               SELECT 1
               FROM reservas r
               WHERE r.vehiculo_id = v.id
                 AND r.fecha_reserva = $1::date
                 AND r.estado NOT IN ('cancelada', 'finalizada')
             )
           )
         END AS disponible_en_fecha
       FROM vehiculos v
       LEFT JOIN usuarios u
         ON u.id = v.usuario_id
       WHERE v.activo = true
       ORDER BY v.id DESC`,
      [fecha || null]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando vehiculos para cliente:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const verDisponibilidadVehiculoCliente = async (req, res) => {
  const vehiculoId = Number(req.params.id);

  if (!Number.isInteger(vehiculoId) || vehiculoId <= 0) {
    return res.status(400).json({ error: "ID de vehículo inválido" });
  }

  const desde = req.query.desde || new Date().toISOString().slice(0, 10);
  const hasta = req.query.hasta || (() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  })();

  try {
    const result = await pool.query(
      `SELECT
         s.fecha,
         CASE
           WHEN vd.disponible IS NOT NULL THEN vd.disponible
           WHEN EXTRACT(DOW FROM s.fecha)::INT = ANY(COALESCE(v.dias_servicio, ARRAY[0,1,2,3,4,5,6]))
                AND r.id IS NULL
           THEN true
           ELSE false
         END AS disponible,
         CASE
           WHEN r.id IS NOT NULL THEN 'reservado'
           WHEN vd.disponible IS NOT NULL THEN 'ajuste_manual'
           WHEN EXTRACT(DOW FROM s.fecha)::INT = ANY(COALESCE(v.dias_servicio, ARRAY[0,1,2,3,4,5,6])) THEN 'dia_habil'
           ELSE 'dia_no_habil'
         END AS motivo
       FROM vehiculos v
       CROSS JOIN LATERAL generate_series($2::date, $3::date, interval '1 day') AS s(fecha)
       LEFT JOIN vehiculo_disponibilidad vd
         ON vd.vehiculo_id = v.id
        AND vd.fecha = s.fecha::date
       LEFT JOIN LATERAL (
         SELECT id
         FROM reservas
         WHERE vehiculo_id = v.id
           AND s.fecha::date BETWEEN fecha_reserva AND COALESCE(fecha_fin, fecha_reserva)
           AND estado NOT IN ('cancelada', 'finalizada')
         LIMIT 1
       ) r ON true
       WHERE v.id = $1
         AND v.activo = true
       ORDER BY s.fecha ASC`,
      [vehiculoId, desde, hasta]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error consultando disponibilidad de vehículo:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Endpoint para que el cliente vea SOLO SUS reservas (autenticado por JWT)
const listarMisReservas = async (req: any, res: any) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "No autenticado" });
  }

  try {
    const result = await pool.query(
      `SELECT
         r.id,
         r.usuario_id,
         r.vehiculo_id,
         r.conductor_id,
         r.estado,
         r.fecha_reserva,
         r.fecha_fin,
         r.origen,
         r.destino,
         r.num_personas,
         r.total,
         r.notas,
         r.calificacion,
         r.comentario_calificacion,
         r.monto_pagado,
         r.estado_pago,
         r.link_pago,
         r.creado_en,
         t.titulo AS tour_titulo,
         v.placa AS vehiculo_placa,
         v.modelo AS vehiculo_modelo,
         v.tipo AS vehiculo_tipo,
         v.imagen_url AS vehiculo_imagen_url,
         uc.nombre AS conductor_nombre,
         uc.telefono AS conductor_telefono,
         co.hora_salida
       FROM reservas r
       LEFT JOIN tours t ON t.id = r.tour_id
       LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
       LEFT JOIN usuarios uc ON uc.id = r.conductor_id
       LEFT JOIN cotizaciones co ON co.reserva_id = r.id
       WHERE r.usuario_id = $1
       ORDER BY r.creado_en DESC`,
      [userId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando mis reservas:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Endpoint para que el cliente cancele UNA DE SUS reservas
const cancelarMiReserva = async (req: any, res: any) => {
  const userId = req.user?.id;
  const reservaId = Number(req.params.id);

  if (!userId) {
    return res.status(401).json({ error: "No autenticado" });
  }

  if (!Number.isInteger(reservaId) || reservaId <= 0) {
    return res.status(400).json({ error: "ID de reserva inválido" });
  }

  try {
    const check = await pool.query(
      "SELECT id, estado FROM reservas WHERE id = $1 AND usuario_id = $2 LIMIT 1",
      [reservaId, userId]
    );

    if (check.rowCount === 0) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    const reserva = check.rows[0];
    if (["finalizada", "cancelada", "en_curso"].includes(reserva.estado)) {
      return res.status(400).json({ error: `No se puede cancelar una reserva en estado '${reserva.estado}'` });
    }

    await pool.query(
      "UPDATE reservas SET estado = 'cancelada' WHERE id = $1 AND usuario_id = $2",
      [reservaId, userId]
    );

    return res.status(200).json({ message: "Reserva cancelada correctamente" });
  } catch (error) {
    console.error("Error cancelando reserva:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// El cliente cambia la fecha/hora de salida de su reserva YA CONFIRMADA. Actualiza
// la reserva y la cotización ligada (de donde el conductor lee la hora), y avisa:
// correo al cliente + notificación in-app al admin y al conductor.
const reprogramarMiReserva = async (req: any, res: any) => {
  const userId = req.user?.id;
  const reservaId = Number(req.params.id);
  if (!userId) return res.status(401).json({ error: "No autenticado" });
  if (!Number.isInteger(reservaId) || reservaId <= 0) return res.status(400).json({ error: "ID de reserva inválido" });

  const fecha = typeof req.body?.fecha === "string" ? req.body.fecha.trim() : "";
  const hora = typeof req.body?.hora === "string" ? req.body.hora.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "Indica una fecha válida" });
  if (fecha < new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: "La fecha no puede ser anterior a hoy" });

  try {
    const check = await pool.query(
      "SELECT id, estado FROM reservas WHERE id = $1 AND usuario_id = $2 LIMIT 1",
      [reservaId, userId]
    );
    if (check.rowCount === 0) return res.status(404).json({ error: "Reserva no encontrada" });
    if (check.rows[0].estado !== "confirmada") {
      return res.status(400).json({ error: "Solo puedes cambiar la fecha/hora de una reserva confirmada" });
    }

    // Si la reserva es de varios días, se conserva la duración: fecha_fin se
    // desplaza los mismos días que se movió la fecha de inicio. (En PostgreSQL
    // las expresiones del SET usan los valores ANTERIORES de la fila.)
    await pool.query(
      `UPDATE reservas
         SET fecha_fin = CASE WHEN fecha_fin IS NOT NULL THEN fecha_fin + ($1::date - fecha_reserva) ELSE NULL END,
             fecha_reserva = $1
       WHERE id = $2 AND usuario_id = $3`,
      [fecha, reservaId, userId]
    );
    // La hora de salida y la fecha de servicio viven en la cotización ligada, que
    // es de donde el conductor y el admin las leen: se actualizan también.
    await pool.query(
      `UPDATE cotizaciones
         SET fecha_fin = CASE WHEN fecha_fin IS NOT NULL THEN fecha_fin + ($1::date - fecha_servicio) ELSE NULL END,
             fecha_servicio = $1,
             hora_salida = COALESCE(NULLIF($2, ''), hora_salida)
       WHERE reserva_id = $3`,
      [fecha, hora, reservaId]
    );

    await notificarReprogramacion(reservaId, userId);

    return res.status(200).json({ message: "Fecha/hora actualizada. Se notificó al administrador y al conductor." });
  } catch (error) {
    console.error("Error reprogramando reserva:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// El cliente califica una reserva finalizada (1-5) y se recalcula el rating del conductor
const calificarMiReserva = async (req: any, res: any) => {
  const userId = req.user?.id;
  const reservaId = Number(req.params.id);
  const calificacion = Number(req.body.calificacion);
  const comentario = typeof req.body.comentario === "string" ? req.body.comentario.trim().slice(0, 500) : null;

  if (!userId) return res.status(401).json({ error: "No autenticado" });
  if (!Number.isInteger(reservaId) || reservaId <= 0) return res.status(400).json({ error: "ID de reserva inválido" });
  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
    return res.status(400).json({ error: "La calificación debe ser un número del 1 al 5" });
  }

  try {
    const check = await pool.query(
      "SELECT id, estado, conductor_id FROM reservas WHERE id = $1 AND usuario_id = $2 LIMIT 1",
      [reservaId, userId]
    );
    if (check.rowCount === 0) return res.status(404).json({ error: "Reserva no encontrada" });

    const reserva = check.rows[0];
    if (reserva.estado !== "finalizada") {
      return res.status(400).json({ error: "Solo puedes calificar viajes finalizados" });
    }

    await pool.query(
      "UPDATE reservas SET calificacion = $1, comentario_calificacion = $2, calificado_en = NOW() WHERE id = $3",
      [calificacion, comentario, reservaId]
    );

    // Recalcular el rating promedio del conductor (reservas.conductor_id -> conductores.id)
    if (reserva.conductor_id) {
      const avg = await pool.query(
        "SELECT AVG(calificacion)::numeric(3,2) AS prom FROM reservas WHERE conductor_id = $1 AND calificacion IS NOT NULL",
        [reserva.conductor_id]
      );
      const prom = avg.rows[0]?.prom;
      if (prom !== null && prom !== undefined) {
        await pool.query("UPDATE conductores SET rating_promedio = $1 WHERE id = $2", [prom, reserva.conductor_id]);
      }
    }

    return res.status(200).json({ message: "¡Gracias por calificar tu viaje!" });
  } catch (error) {
    console.error("Error calificando reserva:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// El cliente sigue en tiempo real la ubicación del vehículo de su reserva
const seguimientoMiReserva = async (req: any, res: any) => {
  const userId = req.user?.id;
  const reservaId = Number(req.params.id);
  if (!userId) return res.status(401).json({ error: "No autenticado" });
  if (!Number.isInteger(reservaId) || reservaId <= 0) return res.status(400).json({ error: "ID de reserva inválido" });

  try {
    const r = await pool.query(
      `SELECT r.id, r.estado, r.vehiculo_id,
              v.placa, v.modelo,
              uc.nombre AS conductor_nombre, uc.telefono AS conductor_telefono,
              co.origen_lat, co.origen_lng, co.destino_lat, co.destino_lng
       FROM reservas r
       LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
       LEFT JOIN conductores c ON c.id = r.conductor_id
       LEFT JOIN usuarios uc ON uc.id = c.usuario_id
       LEFT JOIN cotizaciones co ON co.reserva_id = r.id
       WHERE r.id = $1 AND r.usuario_id = $2
       LIMIT 1`,
      [reservaId, userId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Reserva no encontrada" });
    const reserva = r.rows[0];

    let vehiculo = null;
    if (reserva.vehiculo_id) {
      const loc = await pool.query(
        `SELECT lat, lng, creado_en FROM vehiculo_ubicacion
         WHERE vehiculo_id = $1 ORDER BY creado_en DESC LIMIT 1`,
        [reserva.vehiculo_id]
      );
      if (loc.rowCount) vehiculo = loc.rows[0];
    }

    return res.status(200).json({
      estado: reserva.estado,
      placa: reserva.placa,
      modelo: reserva.modelo,
      conductor_nombre: reserva.conductor_nombre,
      conductor_telefono: reserva.conductor_telefono,
      vehiculo, // {lat,lng,creado_en} o null si aún no comparte
      origen: reserva.origen_lat != null ? { lat: Number(reserva.origen_lat), lng: Number(reserva.origen_lng) } : null,
      destino: reserva.destino_lat != null ? { lat: Number(reserva.destino_lat), lng: Number(reserva.destino_lng) } : null,
    });
  } catch (error) {
    console.error("Error en seguimiento de reserva:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// El cliente elimina (o desactiva si tiene reservas) su propia cuenta
const eliminarMiCuenta = async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  try {
    const result = await pool.query("DELETE FROM usuarios WHERE id = $1 RETURNING id", [userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.status(200).json({ message: "Cuenta eliminada correctamente" });
  } catch (error: any) {
    if (error.code === "23503") {
      // Tiene reservas relacionadas: se desactiva en lugar de borrar
      await pool.query("UPDATE usuarios SET activo = false WHERE id = $1", [userId]);
      return res.status(200).json({ message: "Cuenta desactivada (tenía reservas asociadas)" });
    }
    console.error("Error eliminando cuenta:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = {
  crearUsuario,
  listarUsuarios,
  listarVehiculosCliente,
  verDisponibilidadVehiculoCliente,
  listarMisReservas,
  cancelarMiReserva,
  reprogramarMiReserva,
  calificarMiReserva,
  seguimientoMiReserva,
  eliminarMiCuenta,
};
