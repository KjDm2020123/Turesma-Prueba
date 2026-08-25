export {};

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const pool = require("../../config/db");
const { uploadImage, deleteImage } = require("../../config/storage");

// ── Almacenamiento en disco de las fotos de la galería de viajes ─────────────
const galeriaDir = path.join(__dirname, "../../../uploads/galeria");

if (!fs.existsSync(galeriaDir)) {
  fs.mkdirSync(galeriaDir, { recursive: true });
}

const storage = multer.memoryStorage();

const fileFilter = (_req: any, file: any, cb: any) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedMimeTypes.includes(String(file.mimetype || "").toLowerCase())) {
    return cb(new Error("Formato inválido. Solo se permite JPG, PNG o WEBP"));
  }
  cb(null, true);
};

const uploadGaleriaMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("imagen");

// ── Admin: sube una foto de viaje y devuelve su URL pública ──────────────────
const uploadGaleriaImagen = (req: any, res: any) => {
  uploadGaleriaMiddleware(req, res, async (error: any) => {
    if (error) {
      return res.status(400).json({ error: error.message || "No se pudo subir la imagen" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Debes seleccionar una imagen" });
    }
    let imageUrl;
    try {
      imageUrl = await uploadImage(req.file, "galeria");
    } catch (uploadError) {
      console.error("Error subiendo imagen de galería a Supabase:", uploadError);
      return res.status(502).json({ error: "No se pudo guardar la imagen" });
    }
    return res.status(201).json({
      message: "Imagen subida correctamente",
      imageUrl,
      filename: req.file.filename,
    });
  });
};

// ── Admin: lista TODAS las fotos de la galería (activas e inactivas) ──────────
const listarGaleriaAdmin = async (_req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT id, imagen_url, titulo, descripcion, orden, activo, creado_en
       FROM galeria_viajes
       ORDER BY orden ASC, creado_en DESC`
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando galería:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ── Admin: agrega una foto a la galería ──────────────────────────────────────
const crearGaleria = async (req: any, res: any) => {
  try {
    const imagen_url = typeof req.body.imagen_url === "string" ? req.body.imagen_url.trim() : "";
    const titulo = typeof req.body.titulo === "string" ? req.body.titulo.trim().slice(0, 120) : null;
    const descripcion = typeof req.body.descripcion === "string" ? req.body.descripcion.trim().slice(0, 500) : null;
    const orden = Number.isFinite(Number(req.body.orden)) ? Number(req.body.orden) : 0;

    if (!imagen_url) {
      return res.status(400).json({ error: "Debes subir una imagen primero" });
    }

    const result = await pool.query(
      `INSERT INTO galeria_viajes (imagen_url, titulo, descripcion, orden, activo)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, imagen_url, titulo, descripcion, orden, activo, creado_en`,
      [imagen_url, titulo || null, descripcion || null, orden]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creando foto de galería:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ── Admin: activa/desactiva una foto (para ocultarla sin borrarla) ───────────
const actualizarGaleria = async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "ID inválido" });

  try {
    const existe = await pool.query("SELECT id FROM galeria_viajes WHERE id = $1 LIMIT 1", [id]);
    if (existe.rowCount === 0) return res.status(404).json({ error: "Foto no encontrada" });

    const activo = typeof req.body.activo === "boolean" ? req.body.activo : null;
    const titulo = typeof req.body.titulo === "string" ? req.body.titulo.trim().slice(0, 120) : undefined;
    const descripcion = typeof req.body.descripcion === "string" ? req.body.descripcion.trim().slice(0, 500) : undefined;

    const result = await pool.query(
      `UPDATE galeria_viajes
       SET activo = COALESCE($1, activo),
           titulo = COALESCE($2, titulo),
           descripcion = COALESCE($3, descripcion)
       WHERE id = $4
       RETURNING id, imagen_url, titulo, descripcion, orden, activo, creado_en`,
      [activo, titulo ?? null, descripcion ?? null, id]
    );
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error actualizando foto de galería:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ── Admin: elimina una foto de la galería (y su archivo en disco) ────────────
const eliminarGaleria = async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "ID inválido" });

  try {
    const found = await pool.query("SELECT imagen_url FROM galeria_viajes WHERE id = $1 LIMIT 1", [id]);
    if (found.rowCount === 0) return res.status(404).json({ error: "Foto no encontrada" });

    await pool.query("DELETE FROM galeria_viajes WHERE id = $1", [id]);

    // Borra el archivo físico si vive en nuestra carpeta de uploads.
    const url = String(found.rows[0].imagen_url || "");
    const marker = "/uploads/galeria/";
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      const filename = url.slice(idx + marker.length);
      const filePath = path.join(galeriaDir, filename);
      fs.unlink(filePath, () => {});
    }

    return res.status(200).json({ message: "Foto eliminada" });
  } catch (error) {
    console.error("Error eliminando foto de galería:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = {
  uploadGaleriaImagen,
  listarGaleriaAdmin,
  crearGaleria,
  actualizarGaleria,
  eliminarGaleria,
};
