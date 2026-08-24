export {};

const pool = require("./db");

const hasReservasColumn = async (columnName) => {
  const result = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'reservas'
       AND column_name = $1
     LIMIT 1`,
    [columnName]
  );

  return result.rowCount > 0;
};

const syncReservaEstadosAutomaticos = async () => {
  const [hasConductorId, hasVehiculoId, hasFechaSalida, hasFechaLlegada, hasFechaServicio] = await Promise.all([
    hasReservasColumn("conductor_id"),
    hasReservasColumn("vehiculo_id"),
    hasReservasColumn("fecha_salida"),
    hasReservasColumn("fecha_llegada"),
    hasReservasColumn("fecha_servicio"),
  ]);

  const assignmentChecks = [];
  if (hasConductorId) assignmentChecks.push("conductor_id IS NOT NULL");
  if (hasVehiculoId) assignmentChecks.push("vehiculo_id IS NOT NULL");

  if (assignmentChecks.length > 0) {
    await pool.query(
      `UPDATE reservas
       SET estado = 'confirmada'
       WHERE estado = 'pendiente'
         AND (${assignmentChecks.join(" OR ")})`
    );
  }

  const startDateParts = [];
  if (hasFechaSalida) startDateParts.push("fecha_salida::timestamp");
  if (hasFechaServicio) startDateParts.push("fecha_servicio::timestamp");
  startDateParts.push("fecha_reserva::timestamp");

  const endDateParts = [];
  if (hasFechaLlegada) endDateParts.push("fecha_llegada::timestamp");
  if (hasFechaSalida) endDateParts.push("(fecha_salida::timestamp + interval '1 hour')");
  if (hasFechaServicio) endDateParts.push("(fecha_servicio::timestamp + interval '1 hour')");
  endDateParts.push("(fecha_reserva::timestamp + interval '23 hours 59 minutes')");

  const startAtExpr = `COALESCE(${startDateParts.join(", ")})`;
  const endAtExpr = `COALESCE(${endDateParts.join(", ")})`;

  await pool.query(
    `UPDATE reservas
     SET estado = 'en_curso'
     WHERE estado = 'confirmada'
       AND NOW() >= ${startAtExpr}
       AND NOW() < ${endAtExpr}`
  );

  await pool.query(
    `UPDATE reservas
     SET estado = 'finalizada'
     WHERE estado IN ('confirmada', 'en_curso')
       AND NOW() >= ${endAtExpr}`
  );
};

module.exports = {
  syncReservaEstadosAutomaticos,
};
