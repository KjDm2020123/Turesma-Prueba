export {};

const express = require("express");
const {
  listContactos,
  listMensajes,
  sendMensaje,
  listNotificaciones,
  markNotificacionLeida,
  markAllNotificacionesLeidas,
} = require("../controllers/comunicacion.controller");

const router = express.Router();

router.get("/contactos", listContactos);
router.get("/mensajes", listMensajes);
router.post("/mensajes", sendMensaje);
router.get("/notificaciones", listNotificaciones);
router.patch("/notificaciones/leidas", markAllNotificacionesLeidas);
router.patch("/notificaciones/:id/leida", markNotificacionLeida);

module.exports = router;
