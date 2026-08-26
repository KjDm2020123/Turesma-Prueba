export {};

const pool = require("../config/db");

const PUBLIC_GALLERY_CACHE_MS = 60_000;
let publicGalleryCache: { expiresAt: number; rows: unknown[] } | null = null;

// ── Público: fotos activas de la galería de viajes, para la landing pública ───
const listarGaleriaPublica = async (_req: any, res: any) => {
  try {
    if (publicGalleryCache && publicGalleryCache.expiresAt > Date.now()) {
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
      return res.status(200).json(publicGalleryCache.rows);
    }

    const result = await pool.query(
      `SELECT id, imagen_url, titulo, descripcion
       FROM galeria_viajes
       WHERE activo = TRUE
       ORDER BY orden ASC, creado_en DESC`
    );
    publicGalleryCache = { rows: result.rows, expiresAt: Date.now() + PUBLIC_GALLERY_CACHE_MS };
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando galería pública:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = {
  listarGaleriaPublica,
};
