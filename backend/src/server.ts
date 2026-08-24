export {};

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const authRoutes = require("./routes/auth.routes");
const usuariosRoutes = require("./routes/usuarios.routes");
const adminRoutes = require("./routes/admin.routes");
const conductorRoutes = require("./routes/conductor.routes");
const comunicacionRoutes = require("./routes/comunicacion.routes");
const cotizacionesRoutes = require("./routes/cotizaciones.routes");
const { initDatabase } = require("./config/initDb");

const app = express();
const uploadsRoot = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

// Cabeceras de seguridad HTTP. Se permite cargar recursos (imágenes de
// vehículos/galería) desde otro origen, porque el frontend corre en otro puerto.
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // esta API sirve JSON, no HTML propio
}));

// CORS: en producción se limita al dominio del frontend (CORS_ORIGIN); en
// desarrollo, si no está definido, se permite cualquier origen (localhost).
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",").map((o: string) => o.trim()) } : {}));

app.use(express.json());
app.use("/uploads", express.static(uploadsRoot));

// Límite de peticiones a autenticación: frena ataques de fuerza bruta al login
// y al envío de PIN de recuperación (por IP).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 40,                  // 40 intentos por IP en esa ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/conductor", conductorRoutes);
app.use("/api/comunicacion", comunicacionRoutes);
app.use("/api/cotizaciones", cotizacionesRoutes);

app.get("/", (req, res) => {
  res.send("API TURESMA funcionando 🚀");
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "API Turesma está activa" });
});

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(` Servidor corriendo en puerto ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Error iniciando el servidor:", error);
    process.exit(1);
  }
};

startServer();
