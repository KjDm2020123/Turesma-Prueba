export {};

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth.middleware");
const {
  crearRequerimiento,
  listarMisRequerimientos,
} = require("../controllers/requerimientos-personalizados.controller");

const router = express.Router();

router.use(verifyToken, requireRole("cliente"));
router.post("/", crearRequerimiento);
router.get("/mios", listarMisRequerimientos);

module.exports = router;
