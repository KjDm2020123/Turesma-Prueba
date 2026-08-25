export {};

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { uploadImage } = require("../../config/storage");

const uploadsDir = path.join(__dirname, "../../../uploads/vehiculos");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedMimeTypes.includes(String(file.mimetype || "").toLowerCase())) {
    return cb(new Error("Formato inválido. Solo se permite JPG, PNG o WEBP"));
  }

  cb(null, true);
};

const uploadVehiculoImageMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single("imagen");

const uploadVehiculoImagen = (req, res) => {
  uploadVehiculoImageMiddleware(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || "No se pudo subir la imagen" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Debes seleccionar una imagen" });
    }

    let imageUrl;
    try {
      imageUrl = await uploadImage(req.file, "vehiculos");
    } catch (uploadError) {
      console.error("Error subiendo imagen de vehículo a Supabase:", uploadError);
      return res.status(502).json({ error: "No se pudo guardar la imagen" });
    }

    return res.status(201).json({
      message: "Imagen subida correctamente",
      imageUrl,
      filename: req.file.filename,
    });
  });
};

module.exports = {
  uploadVehiculoImagen,
};
