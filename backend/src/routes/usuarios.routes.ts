export {};

const express = require("express");
const { verifyToken, requireRole, optionalAuth } = require("../middleware/auth.middleware");
const {
  crearUsuario,
  listarUsuarios,
  listarVehiculosCliente,
  listarTarifasCliente,
  recomendarVehiculo,
  verDisponibilidadVehiculoCliente,
  listarMisReservas,
  cancelarMiReserva,
  reprogramarMiReserva,
  calificarMiReserva,
  seguimientoMiReserva,
  eliminarMiCuenta,
} = require("../controllers/usuarios.controller");
const { crearPagoReserva, listarPagosDeReserva, crearOrdenPaypal, capturarOrdenPaypal } = require("../controllers/pagos.controller");
const { uploadComprobantePago, serveComprobante } = require("../controllers/uploads.controller");
const { enviarVerificacion, miVerificacion } = require("../controllers/verificacion.controller");
const { listarGaleriaPublica } = require("../controllers/galeria.controller");
const { listarViajesPublicos, reservarViajePublicado } = require("../controllers/viajes.controller");

const router = express.Router();

// Rutas públicas (sin autenticación)
router.get("/vehiculos", listarVehiculosCliente);
router.get("/tarifas", listarTarifasCliente);
router.post("/vehiculos/recomendacion", verifyToken, recomendarVehiculo);
router.get("/vehiculos/:id/disponibilidad", verDisponibilidadVehiculoCliente);
router.get("/galeria", listarGaleriaPublica);
router.get("/viajes", listarViajesPublicos);

// Rutas protegidas por token
router.get("/mis-reservas", verifyToken, listarMisReservas);
router.post("/viajes/:id/reservar", verifyToken, reservarViajePublicado);
router.patch("/mis-reservas/:id/cancelar", verifyToken, cancelarMiReserva);
router.patch("/mis-reservas/:id/reprogramar", verifyToken, reprogramarMiReserva);
router.patch("/mis-reservas/:id/calificar", verifyToken, calificarMiReserva);
router.get("/mis-reservas/:id/ubicacion", verifyToken, seguimientoMiReserva);
router.post("/mis-reservas/:id/pagos", verifyToken, crearPagoReserva);
router.get("/mis-reservas/:id/pagos", verifyToken, listarPagosDeReserva);
router.post("/mis-reservas/:id/pagos/paypal/orden", verifyToken, crearOrdenPaypal);
router.post("/mis-reservas/:id/pagos/paypal/capturar", verifyToken, capturarOrdenPaypal);
router.post("/uploads/comprobante-pago", verifyToken, uploadComprobantePago);
router.get("/comprobantes/:filename", optionalAuth, serveComprobante);
router.get("/verificacion", verifyToken, miVerificacion);
router.post("/verificacion", verifyToken, enviarVerificacion);
router.delete("/mi-cuenta", verifyToken, eliminarMiCuenta);

router.get("/", verifyToken, requireRole("admin"), listarUsuarios);
router.post("/", verifyToken, requireRole("admin"), crearUsuario);

module.exports = router;
