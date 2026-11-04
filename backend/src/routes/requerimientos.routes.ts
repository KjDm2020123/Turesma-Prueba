export {};

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth.middleware");
const {
  crearRequerimiento,
  listarMisRequerimientos,
  aceptarPropuestaRequerimiento,
  descargarProformaRequerimiento,
} = require("../controllers/requerimientos-personalizados.controller");

const router = express.Router();

router.use(verifyToken, requireRole("cliente"));
router.post("/", crearRequerimiento);
router.get("/mios", listarMisRequerimientos);
router.get("/:id/proforma", descargarProformaRequerimiento);
router.post("/:id/aceptar", aceptarPropuestaRequerimiento);
router.post("/:id/pagar", aceptarPropuestaRequerimiento);

module.exports = router;
