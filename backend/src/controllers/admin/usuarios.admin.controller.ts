export {};

const pool = require("../../config/db");
const bcrypt = require("bcrypt");
const { normalizeRole } = require("../../config/catalogoHelpers");

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseDiasServicio = (value) => {
  if (!Array.isArray(value)) return [0, 1, 2, 3, 4, 5, 6];

  const cleaned = Array.from(
    new Set(
      value
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  ).sort((a, b) => a - b);

  return cleaned.length ? cleaned : [0, 1, 2, 3, 4, 5, 6];
};

const crearUsuarioAdmin = async (req, res) => {
  const {
    nombre,
    email,
    password,
    rol,
    edad,
    capacidad_pasajeros,
    placa,
    telefono,
    tipo_vehiculo,
    modelo_vehiculo,
    color_vehiculo,
    imagen_vehiculo_url,
    descripcion_vehiculo,
    dias_servicio,
  } = req.body;

  if (!nombre || !email || !password || !rol || !telefono || !String(telefono).trim()) {
    return res.status(400).json({
      error: "Debes enviar nombre, email, telefono, password y rol",
    });
  }

  const normalizedRole = await normalizeRole(rol);

  if (!normalizedRole) {
    return res.status(400).json({
      error: "Rol inválido. Debe ser admin, cliente, operativo o vehiculo",
    });
  }

  let edadValue = null;
  let capacidadPasajerosValue = null;
  let placaValue = null;
  const telefonoValue = String(telefono).trim();

  if (normalizedRole === "vehiculo") {
    const parsedEdad = Number(edad);
    const parsedCapacidad = Number(capacidad_pasajeros);

    if (!Number.isInteger(parsedEdad) || parsedEdad < 18) {
      return res.status(400).json({
        error: "Debes enviar una edad válida (mínimo 18) para usuario vehículo",
      });
    }

    if (!Number.isInteger(parsedCapacidad) || parsedCapacidad <= 0) {
      return res.status(400).json({
        error: "Debes enviar una capacidad de pasajeros válida para usuario vehículo",
      });
    }

    if (!placa || typeof placa !== "string" || placa.trim().length === 0) {
      return res.status(400).json({
        error: "Debes enviar la placa del vehículo para usuario vehículo",
      });
    }

    edadValue = parsedEdad;
    capacidadPasajerosValue = parsedCapacidad;
    placaValue = placa.trim().toUpperCase();
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Verificación explícita para evitar depender solo del constraint de la BD
    const existing = await pool.query("SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1", [email]);
    if (existing.rowCount) {
      return res.status(409).json({ error: "El email ya está registrado" });
    }

    const insertResult = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, edad, capacidad_pasajeros, telefono, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id, nombre, email, rol, edad, capacidad_pasajeros, telefono, activo, creado_en`,
      [nombre, email, hashedPassword, normalizedRole, edadValue, capacidadPasajerosValue, telefonoValue]
    );

    const createdUser = insertResult.rows[0];

    if (normalizedRole === "vehiculo" && placaValue) {
      try {
        await pool.query(
          `INSERT INTO vehiculos (placa, usuario_id, tipo, modelo, capacidad, color, imagen_url, descripcion, dias_servicio, estado, activo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)`,
          [
            placaValue,
            createdUser.id,
            (tipo_vehiculo && String(tipo_vehiculo).trim()) || "van",
            (modelo_vehiculo && String(modelo_vehiculo).trim()) || ("Vehículo de " + createdUser.nombre),
            capacidadPasajerosValue,
            (color_vehiculo && String(color_vehiculo).trim()) || null,
            (imagen_vehiculo_url && String(imagen_vehiculo_url).trim()) || null,
            (descripcion_vehiculo && String(descripcion_vehiculo).trim()) || null,
            parseDiasServicio(dias_servicio),
            "disponible",
          ]
        );
      } catch (vehicleError) {
        if (vehicleError.code === "23505") {
          return res.status(409).json({
            error: "La placa del vehículo ya está registrada",
          });
        }
        throw vehicleError;
      }
    }

    return res.status(201).json({
      message: "Usuario creado correctamente",
      user: createdUser,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "El email ya está registrado" });
    }

    console.error("Error creando usuario admin:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const listarUsuariosAdmin = async (req, res) => {
  try {
    const { rol } = req.query;

    let query = `SELECT id, nombre, email, rol, edad, capacidad_pasajeros, telefono, imagen_url, activo, creado_en FROM usuarios`;
    const params: unknown[] = [];

    if (rol && typeof rol === "string") {
      const normalizedFilterRole = await normalizeRole(rol);
      if (!normalizedFilterRole) {
        return res.status(400).json({ error: "Rol de filtro inválido" });
      }
      query += " WHERE rol = $1";
      params.push(normalizedFilterRole);
    }

    query += " ORDER BY id DESC";

    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando usuarios:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const editarUsuarioAdmin = async (req, res) => {
  const userId = parsePositiveInt(req.params.id);

  if (!userId) {
    return res.status(400).json({ error: "ID de usuario inválido" });
  }

  console.log("[editarUsuarioAdmin] Actualizando usuario ID:", userId);
  console.log("[editarUsuarioAdmin] Body:", { ...req.body, password: req.body.password ? "[HIDDEN]" : undefined });

  try {
    const currentResult = await pool.query(
      "SELECT id, nombre, email, rol, activo, password_hash, imagen_url FROM usuarios WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (currentResult.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const current = currentResult.rows[0];
    console.log("[editarUsuarioAdmin] Usuario actual:", { id: current.id, nombre: current.nombre, email: current.email, rol: current.rol });

    // Validar email si viene en el request
    if (req.body.email && req.body.email !== current.email) {
      const emailExists = await pool.query(
        "SELECT id FROM usuarios WHERE email = $1 AND id != $2 LIMIT 1",
        [req.body.email, userId]
      );

      if (emailExists.rowCount > 0) {
        console.log("[editarUsuarioAdmin] Email ya existe:", req.body.email);
        return res.status(409).json({ error: "El email ya está registrado" });
      }
    }

    // Campos a actualizar
    const nombre = req.body.nombre || current.nombre;
    const email = req.body.email || current.email;
    const telefono = req.body.telefono !== undefined ? (String(req.body.telefono).trim() || null) : undefined;
    let passwordHash = current.password_hash;

    if (req.body.password) {
      console.log("[editarUsuarioAdmin] Hasheando nueva contraseña");
      passwordHash = await bcrypt.hash(req.body.password, 10);
    }

    const imagenUrl =
      (req.body.imagen_url && String(req.body.imagen_url).trim()) ||
      (req.body.foto_conductor && String(req.body.foto_conductor).trim()) ||
      current.imagen_url || null;

    console.log("[editarUsuarioAdmin] Actualizando con:", { nombre, email, rol: current.rol });

    const result = await pool.query(
      `UPDATE usuarios
       SET nombre = $1,
           email = $2,
           password_hash = $3,
           imagen_url = $4,
           telefono = COALESCE($5, telefono)
       WHERE id = $6
       RETURNING id, nombre, email, rol, telefono, activo, imagen_url, creado_en`,
      [nombre, email, passwordHash, imagenUrl, telefono === undefined ? null : telefono, userId]
    );

    console.log("[editarUsuarioAdmin] Actualizado exitosamente");

    return res.status(200).json({
      message: "Usuario actualizado correctamente",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("[editarUsuarioAdmin] Error:", error);
    if (error.code === "23505") {
      return res.status(409).json({ error: "El email ya está registrado" });
    }
    return res.status(500).json({ error: "Error interno del servidor", details: String(error.message) });
  }
};

const eliminarUsuarioAdmin = async (req, res) => {
  const userId = parsePositiveInt(req.params.id);

  if (!userId) {
    return res.status(400).json({ error: "ID de usuario inválido" });
  }

  try {
    const result = await pool.query(
      `DELETE FROM usuarios
       WHERE id = $1
       RETURNING id, nombre, email, rol, edad, capacidad_pasajeros, activo, creado_en`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res.status(200).json({
      message: "Usuario eliminado correctamente",
      user: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23503") {
      try {
        const fallbackResult = await pool.query(
          `UPDATE usuarios
           SET activo = false
           WHERE id = $1
           RETURNING id, nombre, email, rol, edad, capacidad_pasajeros, activo, creado_en`,
          [userId]
        );

        if (fallbackResult.rowCount === 0) {
          return res.status(404).json({ error: "Usuario no encontrado" });
        }

        return res.status(200).json({
          message: "El usuario tiene reservas relacionadas; se cambió a inactivo",
          user: fallbackResult.rows[0],
        });
      } catch (fallbackError) {
        console.error("Error inactivando usuario tras restricción FK:", fallbackError);
        return res.status(500).json({ error: "Error interno del servidor" });
      }
    }

    console.error("Error eliminando usuario:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const recuperarPasswordUsuarioAdmin = async (req, res) => {
  const userId = parsePositiveInt(req.params.id);
  const { nueva_password } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "ID de usuario inválido" });
  }

  if (!nueva_password || String(nueva_password).trim().length < 6) {
    return res.status(400).json({
      error: "Debes enviar una nueva contraseña con al menos 6 caracteres",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(String(nueva_password), 10);

    const result = await pool.query(
      `UPDATE usuarios
       SET password_hash = $1
       WHERE id = $2
       RETURNING id, nombre, email, rol, edad, capacidad_pasajeros, activo, creado_en`,
      [hashedPassword, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res.status(200).json({
      message: "Contraseña restablecida correctamente",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Error recuperando contraseña de usuario:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = {
  crearUsuarioAdmin,
  listarUsuariosAdmin,
  editarUsuarioAdmin,
  eliminarUsuarioAdmin,
  recuperarPasswordUsuarioAdmin,
};
