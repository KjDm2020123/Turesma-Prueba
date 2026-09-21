export {};

const pool = require("../../config/db");

const getTarifas = async (_req: any, res: any) => {
  try {
    const result = await pool.query("SELECT * FROM configuracion_tarifas WHERE id = 1");
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Error obteniendo tarifas:", error);
    return res.status(500).json({ error: "No se pudieron obtener las tarifas" });
  }
};

const updateTarifas = async (req: any, res: any) => {
  const fields = [
    "tarifa_diaria", "precio_km", "tarifa_viaje", "recargo_peajes", "minimo_km",
    "tarifa_van", "tarifa_bus", "tarifa_suv", "tarifa_minibus", "tarifa_sedan",
    "traslado_van", "traslado_bus", "traslado_suv", "traslado_minibus", "traslado_sedan",
    "hora_van", "hora_bus", "hora_suv", "hora_minibus", "hora_sedan",
    "medio_dia_van", "medio_dia_bus", "medio_dia_suv", "medio_dia_minibus", "medio_dia_sedan",
    "oferta_activa", "oferta_dia", "descuento_oferta_pct", "oferta_descripcion"
  ];
  const values = fields.map((field) => {
    if (field === "oferta_activa") return Boolean(req.body?.[field]);
    if (field === "oferta_dia") return String(req.body?.[field] || "lunes");
    if (field === "oferta_descripcion") return String(req.body?.[field] || "");
    return Number(req.body?.[field]);
  });
  const baseNumericValues = values.slice(0, 5) as number[];
  const vehicleNumericValues = values.slice(5, 25) as number[];

  if (baseNumericValues.some((value) => !Number.isFinite(value) || value < 0)) {
    return res.status(400).json({ error: "Las tarifas base deben ser números mayores o iguales a cero" });
  }
  if (vehicleNumericValues.some((value) => !Number.isFinite(value) || value < 0)) {
    return res.status(400).json({ error: "Las tarifas por tipo de vehículo deben ser válidas" });
  }
  if (!Number.isFinite(Number(values[27])) || Number(values[27]) < 0 || Number(values[27]) > 100) {
    return res.status(400).json({ error: "El descuento de oferta debe estar entre 0 y 100" });
  }

  try {
    const assignments = fields.map((field, index) => `${field} = $${index + 1}`).join(", ");
    const result = await pool.query(
      `UPDATE configuracion_tarifas
       SET ${assignments}, actualizado_en = NOW()
       WHERE id = 1
       RETURNING *`,
      values
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Error actualizando tarifas:", error);
    return res.status(500).json({ error: "No se pudieron guardar las tarifas" });
  }
};

module.exports = { getTarifas, updateTarifas };