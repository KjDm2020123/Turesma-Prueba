export {};

const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadsDir = path.join(__dirname, "../../uploads/perfiles");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    const uniqueName = `perfil-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedMimeTypes.includes(String(file.mimetype || "").toLowerCase())) {
    return cb(new Error("Formato inválido. Solo se permite JPG, PNG o WEBP"));
  }

  cb(null, true);
};

const uploadPerfilImageMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single("imagen");

const uploadPerfilImagen = (req, res) => {
  uploadPerfilImageMiddleware(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || "No se pudo subir la imagen" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Debes seleccionar una imagen" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const imageUrl = `${baseUrl}/uploads/perfiles/${req.file.filename}`;

    return res.status(201).json({
      message: "Imagen subida correctamente",
      imageUrl,
      filename: req.file.filename,
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
const cedulasDir = path.join(__dirname, "../../uploads/cedulas");

if (!fs.existsSync(cedulasDir)) {
  fs.mkdirSync(cedulasDir, { recursive: true });
}

const cedulaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, cedulasDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    const uniqueName = `cedula-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, uniqueName);
  },
});

const uploadCedulaMiddleware = multer({
  storage: cedulaStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single("cedula");

const uploadCedula = (req, res) => {
  uploadCedulaMiddleware(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || "No se pudo subir la cédula" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Debes adjuntar una imagen de tu cédula" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const imageUrl = `${baseUrl}/uploads/cedulas/${req.file.filename}`;

    return res.status(201).json({
      message: "Cédula subida correctamente",
      imageUrl,
      filename: req.file.filename,
    });
  });
};

module.exports = {
  uploadPerfilImagen,
  uploadComprobantePago,
  uploadCedula,
};
