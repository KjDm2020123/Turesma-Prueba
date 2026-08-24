export {};

const express = require("express");
const { verifyToken } = require("../middleware/auth.middleware");
const {
  crearCotizacion,
  listarMisCotizaciones,
  responderCotizacion,
  obtenerNegociacion,
} = require("../controllers/admin/cotizaciones.admin.controller");

const router = express.Router();

// Rutas de cotizaciones accesibles para cualquier usuario autenticado (clientes).
// El usuario_id se deriva del token, por lo que un cliente sólo opera sobre lo suyo.
router.use(verifyToken);

router.post("/", crearCotizacion);
router.get("/mias", listarMisCotizaciones);
router.patch("/:id/responder", responderCotizacion);
router.get("/:id/negociacion", obtenerNegociacion);

module.exports = router;
