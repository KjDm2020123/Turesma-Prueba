export {};

const pool = require("../config/db");
const { notificarAdmins } = require("../config/notificaciones");

// ── Cliente: envía su cédula para verificación de identidad ──────────────────
const enviarVerificacion = async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "No autenticado" });

  const cedula = typeof req.body.cedula === "string" ? req.body.cedula.trim() : "";
  const cedulaUrl = typeof req.body.cedula_url === "string" ? req.body.cedula_url.trim() : "";

  if (!/^\d{10}$/.test(cedula)) {
    return res.status(400).json({ error: "La cédula debe tener 10 dígitos" });
  }
  if (!cedulaUrl) {
    return res.status(400).json({ error: "Debes adjuntar la foto de tu cédula" });
  }

  try {
    await pool.query(
      `UPDATE usuarios
       SET cedula = $1, cedula_url = $2, estado_verificacion = 'pendiente',
           notas_verificacion = NULL, fecha_verificacion = NULL, verificado_por = NULL
       WHERE id = $3`,
      [cedula, cedulaUrl, userId]
    );

    const nombreRes = await pool.query("SELECT nombre FROM usuarios WHERE id = $1", [userId]);
    const nombre = nombreRes.rows[0]?.nombre || "Un cliente";
    await notificarAdmins(userId, `${nombre} envió su cédula para verificación de identidad.`, null, null);

    return res.status(200).json({ message: "Documento enviado. Un administrador revisará tu identidad." });
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
      `SELECT cedula, cedula_url,
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
