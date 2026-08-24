export {};

const catalogoReservasController = require("./admin/catalogo-reservas.admin.controller");
const inteligenciaController = require("./admin/inteligencia.admin.controller");
const vehiculosConductoresController = require("./admin/vehiculos-conductores.admin.controller");
const historialReportesController = require("./admin/historial-reportes.admin.controller");
const usuariosController = require("./admin/usuarios.admin.controller");

module.exports = {
  ...catalogoReservasController,
  ...inteligenciaController,
  ...vehiculosConductoresController,
  ...historialReportesController,
  ...usuariosController,
};
