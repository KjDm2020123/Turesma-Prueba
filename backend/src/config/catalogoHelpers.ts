export {};

const pool = require("./db");

const normalizeRole = async (rawRole) => {
  if (!rawRole) return null;

  const alias = String(rawRole).toLowerCase().trim();
  const result = await pool.query(
    "SELECT rol FROM catalogo_roles_alias WHERE alias = $1 LIMIT 1",
    [alias]
  );

  return result.rowCount ? result.rows[0].rol : null;
};

const isReservaEstadoValido = async (rawEstado) => {
  if (!rawEstado) return false;

  const estado = String(rawEstado).toLowerCase().trim();
  const result = await pool.query(
    "SELECT 1 FROM catalogo_estados_reserva WHERE estado = $1 LIMIT 1",
    [estado]
  );

  return result.rowCount > 0;
};

module.exports = {
  normalizeRole,
  isReservaEstadoValido,
};
