export {};

const pool = require("../config/db");

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const listContactos = async (req, res) => {
  const userId = parsePositiveInt(req.query.userId);

  if (!userId) {
    return res.status(400).json({ error: "Debes enviar userId válido" });
  }

  try {
    const userResult = await pool.query(
      "SELECT id, rol FROM usuarios WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const rol = String(userResult.rows[0].rol || "").toLowerCase();

    if (rol === "admin") {
      const all = await pool.query(
        `SELECT id, nombre, email, rol, telefono
         FROM usuarios
         WHERE id <> $1
           AND activo = true
         ORDER BY rol ASC, nombre ASC`,
        [userId]
      );

      return res.status(200).json(all.rows);
    }

    if (rol === "vehiculo") {
      // Vehículo puede hablar con:
      // 1. Otros vehículos
      // 2. Clientes que han hecho reservas con él
      // 3. Admin
      const contactos = await pool.query(
        `SELECT DISTINCT u.id, u.nombre, u.email, u.rol, u.telefono
         FROM usuarios u
         WHERE u.id <> $1
           AND u.activo = true
           AND (
             u.rol = 'admin'
             OR u.rol = 'vehiculo'
             OR u.id IN (
               SELECT DISTINCT r.usuario_id
               FROM reservas r
               WHERE r.vehiculo_id IN (
                 SELECT v.id FROM vehiculos v WHERE v.usuario_id = $1
               )
             )
           )
         ORDER BY u.rol DESC, u.nombre ASC`,
        [userId]
      );

      return res.status(200).json(contactos.rows);
    }

    // Cliente puede hablar con:
    // 1. Vehículos que han aceptado sus reservas
    // 2. Admin
    const clienteContactos = await pool.query(
      `SELECT DISTINCT u.id, u.nombre, u.email, u.rol, u.telefono
       FROM usuarios u
       WHERE u.id <> $1
         AND u.activo = true
         AND (
           u.rol = 'admin'
           OR u.id IN (
             SELECT DISTINCT v.usuario_id
             FROM reservas r
             INNER JOIN vehiculos v ON v.id = r.vehiculo_id
             WHERE r.usuario_id = $1
               AND r.estado IN ('confirmada', 'en_curso', 'finalizada', 'cancelada')
           )
         )
       ORDER BY u.rol DESC, u.nombre ASC`,
      [userId]
    );

    return res.status(200).json(clienteContactos.rows);
  } catch (error) {
    console.error("Error listando contactos de comunicación:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const listMensajes = async (req, res) => {
  const userId = parsePositiveInt(req.query.userId);
  const contactId = parsePositiveInt(req.query.contactId);

  if (!userId || !contactId) {
    return res.status(400).json({ error: "Debes enviar userId y contactId válidos" });
  }

  try {
    await pool.query(
      `UPDATE mensajes_comunicacion
       SET leido = true,
           leido_en = CURRENT_TIMESTAMP
       WHERE recipient_user_id = $1
         AND sender_user_id = $2
         AND COALESCE(leido, false) = false`,
      [userId, contactId]
    );

    const result = await pool.query(
      `SELECT id, sender_user_id, recipient_user_id, mensaje, reserva_id, creado_en, COALESCE(leido, false) AS leido, leido_en
       FROM mensajes_comunicacion
       WHERE (sender_user_id = $1 AND recipient_user_id = $2)
          OR (sender_user_id = $2 AND recipient_user_id = $1)
       ORDER BY creado_en ASC, id ASC
       LIMIT 200`,
      [userId, contactId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando mensajes:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const sendMensaje = async (req, res) => {
  const senderUserId = parsePositiveInt(req.body.sender_user_id);
  const recipientUserId = parsePositiveInt(req.body.recipient_user_id);
  const mensaje = String(req.body.mensaje || "").trim();
  const reservaId = req.body.reserva_id ? parsePositiveInt(req.body.reserva_id) : null;

  if (!senderUserId || !recipientUserId || !mensaje) {
    return res.status(400).json({ error: "Debes enviar sender_user_id, recipient_user_id y mensaje" });
  }

  if (senderUserId === recipientUserId) {
    return res.status(400).json({ error: "No puedes enviarte mensajes a ti mismo" });
  }

  try {
    const users = await pool.query(
      `SELECT id
       FROM usuarios
       WHERE id IN ($1, $2)
         AND activo = true`,
      [senderUserId, recipientUserId]
    );

    if (users.rowCount < 2) {
      return res.status(404).json({ error: "Uno de los usuarios no existe o está inactivo" });
    }

    const result = await pool.query(
      `INSERT INTO mensajes_comunicacion (
         sender_user_id,
         recipient_user_id,
         mensaje,
         reserva_id,
         leido
       )
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, sender_user_id, recipient_user_id, mensaje, reserva_id, creado_en, COALESCE(leido, false) AS leido`,
      [senderUserId, recipientUserId, mensaje, reservaId]
    );

    return res.status(201).json({
      message: "Mensaje enviado",
      mensaje: result.rows[0],
    });
  } catch (error) {
    console.error("Error enviando mensaje:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const listNotificaciones = async (req, res) => {
  const userId = parsePositiveInt(req.query.userId);

  if (!userId) {
    return res.status(400).json({ error: "Debes enviar userId válido" });
  }

  try {
    const unreadResult = await pool.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM mensajes_comunicacion
       WHERE recipient_user_id = $1
         AND COALESCE(leido, false) = false`,
      [userId]
    );

    const notificationsResult = await pool.query(
      `SELECT
         m.id,
         m.sender_user_id,
         m.recipient_user_id,
         m.mensaje,
         m.reserva_id,
         m.link_type,
         m.link_id,
         m.creado_en,
         COALESCE(m.leido, false) AS leido,
         u.nombre AS sender_nombre,
         u.rol AS sender_rol
       FROM mensajes_comunicacion m
       INNER JOIN usuarios u ON u.id = m.sender_user_id
       WHERE m.recipient_user_id = $1
       ORDER BY m.creado_en DESC, m.id DESC
       LIMIT 20`,
      [userId]
    );

    return res.status(200).json({
      unread_count: unreadResult.rows[0]?.unread_count || 0,
      notifications: notificationsResult.rows,
    });
  } catch (error) {
    console.error("Error listando notificaciones:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const markNotificacionLeida = async (req, res) => {
  const notifId = parsePositiveInt(req.params.id);
  const userId = parsePositiveInt(req.body.userId);

  if (!notifId || !userId) {
    return res.status(400).json({ error: "Debes enviar un id de notificación y userId válidos" });
  }

  try {
    const result = await pool.query(
      `UPDATE mensajes_comunicacion
       SET leido = true,
           leido_en = CURRENT_TIMESTAMP
       WHERE id = $1
         AND recipient_user_id = $2
       RETURNING id`,
      [notifId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notificación no encontrada" });
    }

    return res.status(200).json({ message: "Notificación marcada como leída" });
  } catch (error) {
    console.error("Error marcando notificación:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const markAllNotificacionesLeidas = async (req, res) => {
  const userId = parsePositiveInt(req.body.userId);

  if (!userId) {
    return res.status(400).json({ error: "Debes enviar userId válido" });
  }

  try {
    const result = await pool.query(
      `UPDATE mensajes_comunicacion
       SET leido = true,
           leido_en = CURRENT_TIMESTAMP
       WHERE recipient_user_id = $1
         AND COALESCE(leido, false) = false`,
      [userId]
    );

    return res.status(200).json({
      message: "Notificaciones marcadas como leídas",
      updated: result.rowCount || 0,
    });
  } catch (error) {
    console.error("Error marcando notificaciones:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = {
  listContactos,
  listMensajes,
  sendMensaje,
  listNotificaciones,
  markNotificacionLeida,
  markAllNotificacionesLeidas,
};
