export {};

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth.middleware");
const {
  getCatalogo,
  listarReservas,
  crearReserva,
  editarReserva,
  eliminarReserva,
  asignarVehiculo,
  asignarConductor,
  verEstadoViaje,
  actualizarEstadoViaje,
  listarRutasConductorDesdeReservas,
  listarVehiculos,
  registrarVehiculo,
  editarVehiculo,
  eliminarVehiculo,
  verVehiculosDisponibles,
  listarConductores,
  registrarConductor,
  editarConductor,
  eliminarConductor,
  verConductoresDisponibles,
  verDisponibilidad,
  obtenerDisponibilidadVehiculo,
  actualizarDisponibilidadVehiculo,
  historialViajes,
  historialReservas,
  viajesFinalizados,
  reporteViajes,
  reporteReservas,
  reporteVehiculosUsados,
  verHistorial,
  verReportes,
  crearUsuarioAdmin,
  listarUsuariosAdmin,
  editarUsuarioAdmin,
  eliminarUsuarioAdmin,
  recuperarPasswordUsuarioAdmin,
  getInteligenciaDashboard,
  getAlertasInteligentes,
  getBadgesSidebar,
  getAnaliticaInteligente,
  exportarReporteCSV,
} = require("../controllers/admin.controller");
const {
  getMantenimientoVehiculos,
  getMantenimientoProximo,
  getMantenimientoResumen,
  completarMantenimientoProgramado,
  reprogramarMantenimiento,
} = require("../controllers/admin/mantenimiento.admin.controller");
const {
  getRutasAnalisis,
  getRutasResumen,
  createRuta,
  updateRuta,
  getRecomendacionesRutas,
  getRutasDesdeReservas,
} = require("../controllers/admin/rutas-analisis.admin.controller");
const {
  getRutasReportadas,
  getRutasReportadasResumen,
} = require("../controllers/admin/rutas-reportadas.admin.controller");
const { uploadVehiculoImagen } = require("../controllers/admin/uploads.admin.controller");
const { listarPagosAdmin, aprobarPago, rechazarPago, actualizarLinkPago } = require("../controllers/admin/pagos.admin.controller");
const { getDashboardData } = require("../controllers/admin/dashboard.admin.controller");
const { getHistorialMensual } = require("../controllers/admin/historial.admin.controller");
const { getProformaCotizacion, enviarProformaCotizacion } = require("../controllers/admin/proforma.admin.controller");
const {
  listarAsignaciones,
  crearAsignacion,
  finalizarAsignacion,
  historialAsignaciones,
  conductoresDisponiblesParaAsignar,
  vehiculosDisponiblesParaAsignar,
} = require("../controllers/admin/asignaciones.admin.controller");
const {
  listarCotizaciones,
  aprobarCotizacion,
  contraofertarCotizacion,
  obtenerNegociacion,
  rechazarCotizacion,
  crearCotizacion,
  listarMisCotizaciones,
  resumenCotizaciones,
} = require("../controllers/admin/cotizaciones.admin.controller");
const { obtenerUbicacionesActuales } = require("../controllers/admin/ubicaciones.admin.controller");
const {
  listarVerificaciones,
  contarVerificacionesPendientes,
  aprobarVerificacion,
  rechazarVerificacion,
} = require("../controllers/admin/verificaciones.admin.controller");
const {
  uploadGaleriaImagen,
  listarGaleriaAdmin,
  crearGaleria,
  actualizarGaleria,
  eliminarGaleria,
} = require("../controllers/admin/galeria.admin.controller");
const {
  listarMatriculas,
  getCalendario,
  actualizarCalendario,
  marcarMatriculado,
} = require("../controllers/admin/matriculas.admin.controller");

const router = express.Router();

// ============ MIDDLEWARE DE AUTENTICACIÓN GLOBAL PARA RUTAS ADMIN ============
// Todas las rutas de /api/admin requieren token JWT válido y rol admin u operativo
router.use(verifyToken);
router.use(requireRole("admin", "operativo"));

router.get("/catalogo", getCatalogo);

// ── DASHBOARD PRINCIPAL ───────────────────────────────────────────────────────
router.get("/dashboard", getDashboardData);
router.get("/historial/mensual", getHistorialMensual);

router.get("/inteligencia/dashboard", getInteligenciaDashboard);
router.get("/inteligencia/alertas", getAlertasInteligentes);
router.get("/inteligencia/analitica", getAnaliticaInteligente);
router.get("/badges-sidebar", getBadgesSidebar);

// Verificación de identidad de clientes
router.get("/verificaciones", listarVerificaciones);
router.get("/verificaciones/pendientes", contarVerificacionesPendientes);
router.patch("/verificaciones/:id/aprobar", aprobarVerificacion);
router.patch("/verificaciones/:id/rechazar", rechazarVerificacion);

router.get("/reservas", listarReservas);
router.get("/reservas/rutas-conductor", listarRutasConductorDesdeReservas);
router.post("/reservas", crearReserva);
router.put("/reservas/:id", editarReserva);
router.delete("/reservas/:id", eliminarReserva);
router.patch("/reservas/:id/asignar-vehiculo", asignarVehiculo);
router.patch("/reservas/:id/asignar-conductor", asignarConductor);
router.get("/reservas/:id/estado-viaje", verEstadoViaje);
router.patch("/reservas/:id/estado-viaje", actualizarEstadoViaje);

router.get("/vehiculos", listarVehiculos);
router.post("/vehiculos", registrarVehiculo);
router.put("/vehiculos/:id", editarVehiculo);
router.delete("/vehiculos/:id", eliminarVehiculo);
router.get("/vehiculos/disponibles", verVehiculosDisponibles);
router.get("/vehiculos/:id/disponibilidad", obtenerDisponibilidadVehiculo);
router.patch("/vehiculos/:id/disponibilidad", actualizarDisponibilidadVehiculo);

router.get("/conductores", listarConductores);
router.post("/conductores", registrarConductor);
router.put("/conductores/:id", editarConductor);
router.delete("/conductores/:id", eliminarConductor);
router.get("/conductores/disponibles", verConductoresDisponibles);

// ============ RUTAS DE ASIGNACIONES ============
router.get("/asignaciones", listarAsignaciones);
router.post("/asignaciones", crearAsignacion);
router.patch("/asignaciones/:id/finalizar", finalizarAsignacion);
router.get("/asignaciones/historial", historialAsignaciones);
router.get("/asignaciones/conductores-disponibles", conductoresDisponiblesParaAsignar);
router.get("/asignaciones/vehiculos-disponibles", vehiculosDisponiblesParaAsignar);

router.get("/historial/viajes", historialViajes);
router.get("/historial/reservas", historialReservas);
router.get("/historial/viajes-finalizados", viajesFinalizados);

router.get("/reportes/viajes", reporteViajes);
router.get("/reportes/reservas", reporteReservas);
router.get("/reportes/vehiculos-usados", reporteVehiculosUsados);

router.get("/disponibilidad", verDisponibilidad);

router.post("/usuarios", crearUsuarioAdmin);
router.get("/usuarios", listarUsuariosAdmin);
router.put("/usuarios/:id", editarUsuarioAdmin);
router.delete("/usuarios/:id", eliminarUsuarioAdmin);
router.patch("/usuarios/:id/recuperar-password", recuperarPasswordUsuarioAdmin);
router.post("/uploads/vehiculo-imagen", uploadVehiculoImagen);
router.get("/pagos", listarPagosAdmin);
router.patch("/pagos/:id/aprobar", aprobarPago);
router.patch("/pagos/:id/rechazar", rechazarPago);
router.patch("/reservas/:id/link-pago", actualizarLinkPago);

router.get("/historial", verHistorial);
router.get("/reportes", verReportes);
router.get("/reportes/exportar-csv", exportarReporteCSV);

// ============ RUTAS DE MANTENIMIENTO VEHICULAR ============
router.get("/mantenimiento", getMantenimientoVehiculos);
router.get("/mantenimiento/proximo", getMantenimientoProximo);
router.get("/mantenimiento/resumen", getMantenimientoResumen);
router.patch("/mantenimiento/:vehiculoId/completar", completarMantenimientoProgramado);
router.patch("/mantenimiento/:vehiculoId/reprogramar", reprogramarMantenimiento);

// ============ RUTAS DE ANÁLISIS DE RUTAS ============
router.get("/rutas-analisis", getRutasAnalisis);
router.post("/rutas-analisis", createRuta);
router.put("/rutas-analisis/:id", updateRuta);
router.get("/rutas-analisis/resumen", getRutasResumen);
router.get("/rutas-analisis/recomendaciones", getRecomendacionesRutas);
router.get("/rutas-analisis/dinamico", getRutasDesdeReservas);

router.get("/rutas-reportadas", getRutasReportadas);
router.get("/rutas-reportadas/resumen", getRutasReportadasResumen);

// ============ RUTAS DE COTIZACIONES ============
router.get("/cotizaciones", listarCotizaciones);
router.get("/cotizaciones/resumen", resumenCotizaciones);
router.post("/cotizaciones", crearCotizacion);
router.patch("/cotizaciones/:id/aprobar", aprobarCotizacion);
router.patch("/cotizaciones/:id/contraoferta", contraofertarCotizacion);
router.patch("/cotizaciones/:id/rechazar", rechazarCotizacion);
router.get("/cotizaciones/:id/negociacion", obtenerNegociacion);
router.get("/cotizaciones/:id/proforma", getProformaCotizacion);
router.post("/cotizaciones/:id/proforma/enviar", enviarProformaCotizacion);
router.get("/cotizaciones/cliente/:usuario_id", listarMisCotizaciones);

// ============ UBICACIÓN EN VIVO DE VEHÍCULOS ============
router.get("/ubicaciones", obtenerUbicacionesActuales);

// ============ GALERÍA DE VIAJES (fotos para la landing pública) ============
router.post("/uploads/galeria-imagen", uploadGaleriaImagen);
router.get("/galeria", listarGaleriaAdmin);
router.post("/galeria", crearGaleria);
router.patch("/galeria/:id", actualizarGaleria);
router.delete("/galeria/:id", eliminarGaleria);

// ============ MATRICULACIÓN VEHICULAR (automática por placa) ============
router.get("/matriculas", listarMatriculas);
router.get("/matriculas/calendario", getCalendario);
router.put("/matriculas/calendario", actualizarCalendario);
router.patch("/matriculas/:vehiculoId/matriculado", marcarMatriculado);

module.exports = router;
