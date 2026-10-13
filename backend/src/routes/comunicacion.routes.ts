export {};

const express = require("express");
const { verifyToken } = require("../middleware/auth.middleware");
const {
  listContactos,
  listMensajes,
  sendMensaje,
  listNotificaciones,
  markNotificacionLeida,
  markAllNotificacionesLeidas,
} = require("../controllers/comunicacion.controller");

const router = express.Router();

router.use(verifyToken);
router.get("/contactos", listContactos);
router.get("/mensajes", listMensajes);
router.post("/mensajes", sendMensaje);
router.get("/notificaciones", listNotificaciones);
router.patch("/notificaciones/leidas", markAllNotificacionesLeidas);
router.patch("/notificaciones/:id/leida", markNotificacionLeida);

module.exports = router;
