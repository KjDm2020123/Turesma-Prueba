export {};

const pool = require("../config/db");

const { createEmailVerification } = require("../config/emailVerification");

// ── Cliente: envía su número de cédula y solicita verificación por correo ────
const enviarVerificacion = async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  const cedula = typeof req.body.cedula === "string" ? req.body.cedula.trim() : "";

  if (!/^\d{10}$/.test(cedula)) {
    return res.status(400).json({ error: "La cédula debe tener 10 dígitos" });
  }
  try {
    await pool.query(
      `UPDATE usuarios
       SET cedula = $1, estado_verificacion = 'pendiente',
           notas_verificacion = NULL, fecha_verificacion = NULL, verificado_por = NULL
       WHERE id = $2`,
      [cedula, userId]
    );

    const userRes = await pool.query("SELECT nombre, email FROM usuarios WHERE id = $1", [userId]);
    const user = userRes.rows[0];
    await createEmailVerification(userId, user?.email, user?.nombre || "Un cliente");

    return res.status(200).json({ message: "Te enviamos un enlace de verificación a tu correo." });
  } catch (error: any) {
    // 23505 = violación de unicidad: esa cédula ya está en otra cuenta.
    if (error?.code === "23505") {
      return res.status(409).json({ error: "La cédula ya se encuentra registrada. Si crees que es un error, comunícate con un administrador." });
    }
    console.error("Error enviando verificación:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ── Cliente: consulta el estado de su propia verificación ────────────────────
const miVerificacion = async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  try {
    const r = await pool.query(
      `SELECT cedula,
              COALESCE(estado_verificacion, 'no_verificado') AS estado_verificacion,
              notas_verificacion, fecha_verificacion
       FROM usuarios WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.status(200).json(r.rows[0]);
  } catch (error) {
    console.error("Error consultando verificación:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = { enviarVerificacion, miVerificacion };
