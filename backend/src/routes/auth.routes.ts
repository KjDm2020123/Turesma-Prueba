export {};

const express = require("express");
const { login, register, forgotPassword, resetPassword, getMe, updateMe } = require("../controllers/auth.controller");
const { uploadPerfilImagen } = require("../controllers/uploads.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/upload-perfil", uploadPerfilImagen);
router.get("/me", verifyToken, getMe);
router.put("/me", verifyToken, updateMe);

module.exports = router;
