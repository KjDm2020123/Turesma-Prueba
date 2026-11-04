export {};

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth.middleware");
const {
  crearRequerimiento,
  listarMisRequerimientos,
  pagarRequerimiento,
} = require("../controllers/requerimientos-personalizados.controller");

const router = express.Router();

router.use(verifyToken, requireRole("cliente"));
router.post("/", crearRequerimiento);
router.get("/mios", listarMisRequerimientos);
router.post("/:id/pagar", pagarRequerimiento);

module.exports = router;
