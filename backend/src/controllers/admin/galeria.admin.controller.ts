export {};

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const pool = require("../../config/db");
const { ensureGaleriaVideoColumns } = require("../../config/galeriaSchema");
const { uploadImage, uploadVideo, deleteImage, getStoragePathFromUrl } = require("../../config/storage");
const { invalidarGaleriaPublica } = require("../galeria.controller");

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

const uploadVideoMiddleware = multer({
  storage,
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowedMimeTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (!allowedMimeTypes.includes(String(file.mimetype || "").toLowerCase())) {
      return cb(new Error("Formato inválido. Solo se permite MP4, WEBM o MOV"));
    }
    cb(null, true);
  },
  limits: { fileSize: 100 * 1024 * 1024 },
}).single("video");

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

const uploadGaleriaVideo = (req: any, res: any) => {
  uploadVideoMiddleware(req, res, async (error: any) => {
    if (error) return res.status(400).json({ error: error.message || "No se pudo subir el video" });
    if (!req.file) return res.status(400).json({ error: "Debes seleccionar un video" });
    try {
      const videoUrl = await uploadVideo(req.file);
      return res.status(201).json({ message: "Video subido correctamente", videoUrl });
    } catch (uploadError) {
      console.error("Error subiendo video de galería a Supabase:", uploadError);
      const detail = process.env.NODE_ENV === "production"
        ? ""
        : `: ${uploadError?.message || "error de Storage"}`;
      return res.status(502).json({ error: `No se pudo guardar el video${detail}` });
    }
  });
};

// ── Admin: lista TODAS las fotos de la galería (activas e inactivas) ──────────
const listarGaleriaAdmin = async (_req: any, res: any) => {
  try {
    await ensureGaleriaVideoColumns();
    const result = await pool.query(
      `SELECT id, imagen_url, tipo, categoria, video_offset_x, video_offset_y, video_zoom, video_format, video_aspect_ratio, titulo, descripcion, credito, fuente_url, licencia, licencia_url, orden, activo, creado_en
       FROM galeria_viajes
       ORDER BY orden ASC, creado_en DESC`
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando galería:", error);
    const detail = process.env.NODE_ENV === "production"
      ? ""
      : `: ${error?.message || "error de base de datos"}`;
    return res.status(500).json({ error: `Error interno del servidor${detail}` });
  }
};

// ── Admin: agrega una foto a la galería ──────────────────────────────────────
const crearGaleria = async (req: any, res: any) => {
  try {
    await ensureGaleriaVideoColumns();
    const imagen_url = typeof req.body.imagen_url === "string" ? req.body.imagen_url.trim() : "";
    const tipo = req.body.tipo === "video" ? "video" : "imagen";
    const categoria = req.body.categoria === undefined ? "viajes" : req.body.categoria;
    const videoOffsetX = Number.isFinite(Number(req.body.video_offset_x))
      ? Math.max(-25, Math.min(25, Math.round(Number(req.body.video_offset_x))))
      : 0;
    const videoOffsetY = Number.isFinite(Number(req.body.video_offset_y))
      ? Math.max(-25, Math.min(25, Math.round(Number(req.body.video_offset_y))))
      : 0;
    const videoZoom = Number.isFinite(Number(req.body.video_zoom))
      ? Math.max(100, Math.min(160, Math.round(Number(req.body.video_zoom))))
      : 100;
    const videoFormat = ["original", "horizontal", "vertical"].includes(req.body.video_format)
      ? req.body.video_format
      : "horizontal";
    const requestedAspectRatio = Number(req.body.video_aspect_ratio);
    const originalAspectRatio = Number.isFinite(requestedAspectRatio) && requestedAspectRatio >= 0.25 && requestedAspectRatio <= 4
      ? Math.round(requestedAspectRatio * 10000) / 10000
      : 16 / 9;
    const videoAspectRatio = videoFormat === "vertical"
      ? 9 / 16
      : videoFormat === "horizontal"
        ? 16 / 9
        : originalAspectRatio;
    const titulo = typeof req.body.titulo === "string" ? req.body.titulo.trim().slice(0, 120) : null;
    const descripcion = typeof req.body.descripcion === "string" ? req.body.descripcion.trim().slice(0, 500) : null;
    const credito = typeof req.body.credito === "string" ? req.body.credito.trim().slice(0, 160) : null;
    const fuenteUrl = typeof req.body.fuente_url === "string" ? req.body.fuente_url.trim().slice(0, 1000) : null;
    const licencia = typeof req.body.licencia === "string" ? req.body.licencia.trim().slice(0, 80) : null;
    const licenciaUrl = typeof req.body.licencia_url === "string" ? req.body.licencia_url.trim().slice(0, 1000) : null;
    const orden = Number.isFinite(Number(req.body.orden)) ? Number(req.body.orden) : 0;

    if (categoria !== "viajes" && categoria !== "destinos") {
      return res.status(400).json({ error: "Categoría de galería inválida" });
    }
    if (categoria === "destinos" && tipo !== "imagen") {
      return res.status(400).json({ error: "La sección de destinos solo admite imágenes" });
    }
    if (!imagen_url) {
      return res.status(400).json({ error: "Debes subir un archivo primero" });
    }
    for (const link of [fuenteUrl, licenciaUrl]) {
      if (!link) continue;
      try {
        if (new URL(link).protocol !== "https:") throw new Error("invalid protocol");
      } catch {
        return res.status(400).json({ error: "Los enlaces de crédito deben usar HTTPS" });
      }
    }

    const result = await pool.query(
      `INSERT INTO galeria_viajes (
         imagen_url, tipo, categoria, video_offset_x, video_offset_y, video_zoom, video_format, video_aspect_ratio, titulo, descripcion, credito, fuente_url, licencia, licencia_url, orden, activo
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE)
       RETURNING id, imagen_url, tipo, categoria, video_offset_x, video_offset_y, video_zoom, video_format, video_aspect_ratio, titulo, descripcion, credito, fuente_url, licencia, licencia_url, orden, activo, creado_en`,
      [imagen_url, tipo, categoria, videoOffsetX, videoOffsetY, videoZoom, videoFormat, videoAspectRatio, titulo || null, descripcion || null, credito || null, fuenteUrl || null, licencia || null, licenciaUrl || null, orden]
    );
    invalidarGaleriaPublica();
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
    await ensureGaleriaVideoColumns();
    const existe = await pool.query("SELECT id FROM galeria_viajes WHERE id = $1 LIMIT 1", [id]);
    if (existe.rowCount === 0) return res.status(404).json({ error: "Foto no encontrada" });

    const activo = typeof req.body.activo === "boolean" ? req.body.activo : null;
    const titulo = typeof req.body.titulo === "string" ? req.body.titulo.trim().slice(0, 120) : undefined;
    const descripcion = typeof req.body.descripcion === "string" ? req.body.descripcion.trim().slice(0, 500) : undefined;
    const credito = typeof req.body.credito === "string" ? req.body.credito.trim().slice(0, 160) : undefined;
    const fuenteUrl = typeof req.body.fuente_url === "string" ? req.body.fuente_url.trim().slice(0, 1000) : undefined;
    const licencia = typeof req.body.licencia === "string" ? req.body.licencia.trim().slice(0, 80) : undefined;
    const licenciaUrl = typeof req.body.licencia_url === "string" ? req.body.licencia_url.trim().slice(0, 1000) : undefined;
    for (const link of [fuenteUrl, licenciaUrl]) {
      if (!link) continue;
      try {
        if (new URL(link).protocol !== "https:") throw new Error("invalid protocol");
      } catch {
        return res.status(400).json({ error: "Los enlaces de crédito deben usar HTTPS" });
      }
    }

    const result = await pool.query(
      `UPDATE galeria_viajes
       SET activo = COALESCE($1, activo),
           titulo = COALESCE($2, titulo),
           descripcion = COALESCE($3, descripcion),
           credito = COALESCE($4, credito),
           fuente_url = COALESCE($5, fuente_url),
           licencia = COALESCE($6, licencia),
           licencia_url = COALESCE($7, licencia_url)
       WHERE id = $8
      RETURNING id, imagen_url, tipo, categoria, video_offset_x, video_offset_y, video_zoom, video_format, video_aspect_ratio, titulo, descripcion, credito, fuente_url, licencia, licencia_url, orden, activo, creado_en`,
      [activo, titulo ?? null, descripcion ?? null, credito ?? null, fuenteUrl ?? null, licencia ?? null, licenciaUrl ?? null, id]
    );
    invalidarGaleriaPublica();
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error actualizando foto de galería:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ── Admin: elimina una foto de la galería y su archivo almacenado ────────────
const eliminarGaleria = async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "ID inválido" });

  try {
    const found = await pool.query("SELECT imagen_url FROM galeria_viajes WHERE id = $1 LIMIT 1", [id]);
    if (found.rowCount === 0) return res.status(404).json({ error: "Foto no encontrada" });

    await pool.query("DELETE FROM galeria_viajes WHERE id = $1", [id]);
    invalidarGaleriaPublica();

    const url = String(found.rows[0].imagen_url || "");
    const storagePath = getStoragePathFromUrl(url);
    if (storagePath) {
      await deleteImage(storagePath);
    }

    // Compatibilidad con fotos antiguas guardadas en el disco local.
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
  uploadGaleriaVideo,
  listarGaleriaAdmin,
  crearGaleria,
  actualizarGaleria,
  eliminarGaleria,
};
