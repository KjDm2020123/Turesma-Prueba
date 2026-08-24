export {};

const pool = require("../config/db");

// ── Público: fotos activas de la galería de viajes, para la landing pública ───
const listarGaleriaPublica = async (_req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT id, imagen_url, titulo, descripcion
       FROM galeria_viajes
       WHERE activo = TRUE
       ORDER BY orden ASC, creado_en DESC`
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando galería pública:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = {
  listarGaleriaPublica,
};
