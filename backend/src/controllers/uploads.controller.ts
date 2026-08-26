export {};

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { uploadImage } = require("../config/storage");

const fileFilter = (_req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedMimeTypes.includes(String(file.mimetype || "").toLowerCase())) {
    return cb(new Error("Formato inválido. Solo se permite JPG, PNG o WEBP"));
  }

  cb(null, true);
};

const uploadPerfilImageMiddleware = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single("imagen");

const uploadPerfilImagen = (req, res) => {
  uploadPerfilImageMiddleware(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || "No se pudo subir la imagen" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Debes seleccionar una imagen" });
    }

    let imageUrl;
    try {
      imageUrl = await uploadImage(req.file, "perfiles");
    } catch (uploadError) {
      console.error("Error subiendo foto de perfil a Supabase:", uploadError);
      return res.status(502).json({ error: "No se pudo guardar la foto de perfil" });
    }

    return res.status(201).json({
      message: "Imagen subida correctamente",
      imageUrl,
      filename: imageUrl.split("/").pop(),
    });
  });
};

// ── Comprobante de pago (transferencia / link de pago) ───────────────────────
const comprobantesDir = path.join(__dirname, "../../uploads/comprobantes");

if (!fs.existsSync(comprobantesDir)) {
  fs.mkdirSync(comprobantesDir, { recursive: true });
}

const comprobanteStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, comprobantesDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    const uniqueName = `comprobante-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, uniqueName);
  },
});

const uploadComprobanteMiddleware = multer({
  storage: comprobanteStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single("comprobante");

const uploadComprobantePago = (req, res) => {
  uploadComprobanteMiddleware(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || "No se pudo subir el comprobante" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Debes adjuntar una imagen del comprobante" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const imageUrl = `${baseUrl}/uploads/comprobantes/${req.file.filename}`;

    return res.status(201).json({
      message: "Comprobante subido correctamente",
      imageUrl,
      filename: req.file.filename,
    });
  });
};

// ── Cédula / documento de identidad del cliente ──────────────────────────────
const uploadCedulaMiddleware = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single("cedula");

const uploadCedula = (req, res) => {
  uploadCedulaMiddleware(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || "No se pudo subir la cédula" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Debes adjuntar una imagen de tu cédula" });
    }

    let imageUrl;
    try {
      imageUrl = await uploadImage(req.file, "cedulas");
    } catch (uploadError) {
      console.error("Error subiendo cédula a Supabase:", uploadError);
      return res.status(502).json({ error: "No se pudo guardar la cédula" });
    }

    return res.status(201).json({
      message: "Cédula subida correctamente",
      imageUrl,
      filename: imageUrl.split("/").pop(),
    });
  });
};

module.exports = {
  uploadPerfilImagen,
  uploadComprobantePago,
  uploadCedula,
};
