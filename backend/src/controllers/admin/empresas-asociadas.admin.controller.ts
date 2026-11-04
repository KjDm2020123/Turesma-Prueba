const pool = require("../../config/db");

const text = (value: unknown, maxLength: number) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result && result.length <= maxLength ? result : undefined;
};

const listarEmpresasAsociadas = async (_req: any, res: any) => {
  try {
    const [companies, vehicles] = await Promise.all([
      pool.query("SELECT * FROM empresas_asociadas ORDER BY activa DESC, nombre ASC"),
      pool.query("SELECT * FROM vehiculos_asociados ORDER BY empresa_id, activo DESC, placa ASC"),
    ]);
    const vehiclesByCompany = new Map<number, any[]>();
    for (const vehicle of vehicles.rows) {
      const current = vehiclesByCompany.get(vehicle.empresa_id) || [];
      current.push(vehicle);
      vehiclesByCompany.set(vehicle.empresa_id, current);
    }
    return res.json({
      success: true,
      data: companies.rows.map((company: any) => ({
        ...company,
        vehiculos: vehiclesByCompany.get(company.id) || [],
      })),
    });
  } catch (error) {
    console.error("Error listando empresas asociadas:", error);
    return res.status(500).json({ success: false, error: "No se pudieron cargar las empresas asociadas" });
  }
};

const crearEmpresaAsociada = async (req: any, res: any) => {
  const body = req.body || {};
  const nombre = text(body.nombre, 160);
  const identificacion = text(body.identificacion, 30);
  const contacto = text(body.contacto, 120);
  const telefono = text(body.telefono, 40);
  const email = text(body.email, 160);
  const notas = text(body.notas, 2000);
  if (!nombre || [body.identificacion, body.contacto, body.telefono, body.email, body.notas]
    .some((value) => value !== undefined && value !== null && value !== "" && text(value, value === body.notas ? 2000 : 160) === undefined)) {
    return res.status(400).json({ success: false, error: "Revisa el nombre y los datos de contacto de la empresa" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO empresas_asociadas (nombre, identificacion, contacto, telefono, email, notas, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [nombre, identificacion, contacto, telefono, email, notas, req.user?.id || null]
    );
    return res.status(201).json({ success: true, data: { ...result.rows[0], vehiculos: [] } });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ success: false, error: "Ya existe una empresa con ese nombre" });
    console.error("Error creando empresa asociada:", error);
    return res.status(500).json({ success: false, error: "No se pudo crear la empresa asociada" });
  }
};

const actualizarEmpresaAsociada = async (req: any, res: any) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, error: "ID de empresa inválido" });
  const nombre = text(body.nombre, 160);
  const identificacion = text(body.identificacion, 30);
  const contacto = text(body.contacto, 120);
  const telefono = text(body.telefono, 40);
  const email = text(body.email, 160);
  const notas = text(body.notas, 2000);
  if (body.nombre !== undefined && !nombre
    || [body.identificacion, body.contacto, body.telefono, body.email, body.notas]
      .some((value) => value !== undefined && value !== null && value !== ""
        && text(value, value === body.notas ? 2000 : 160) === undefined)
    || (body.activa !== undefined && typeof body.activa !== "boolean")) {
    return res.status(400).json({ success: false, error: "Los datos de la empresa no son válidos" });
  }
  try {
    const result = await pool.query(
      `UPDATE empresas_asociadas
       SET nombre = COALESCE($1, nombre),
           identificacion = CASE WHEN $2 THEN $3 ELSE identificacion END,
           contacto = CASE WHEN $4 THEN $5 ELSE contacto END,
           telefono = CASE WHEN $6 THEN $7 ELSE telefono END,
           email = CASE WHEN $8 THEN $9 ELSE email END,
           notas = CASE WHEN $10 THEN $11 ELSE notas END,
           activa = COALESCE($12, activa),
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $13 RETURNING *`,
      [
        nombre, body.identificacion !== undefined, identificacion,
        body.contacto !== undefined, contacto, body.telefono !== undefined, telefono,
        body.email !== undefined, email, body.notas !== undefined, notas,
        body.activa === undefined ? null : body.activa, id,
      ]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "Empresa asociada no encontrada" });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ success: false, error: "Ya existe una empresa con ese nombre" });
    console.error("Error actualizando empresa asociada:", error);
    return res.status(500).json({ success: false, error: "No se pudo actualizar la empresa asociada" });
  }
};

const crearVehiculoAsociado = async (req: any, res: any) => {
  const companyId = Number(req.params.id);
  const body = req.body || {};
  const placa = text(body.placa, 30);
  const modelo = text(body.modelo, 120);
  const capacidad = Number(body.capacidad);
  const conductor = text(body.conductor, 120);
  const conductorTelefono = text(body.conductor_telefono, 40);
  if (!Number.isInteger(companyId) || companyId <= 0 || !placa || !modelo
    || !Number.isInteger(capacidad) || capacidad <= 0 || capacidad > 300
    || [body.conductor, body.conductor_telefono].some((value) => value !== undefined && value !== null && value !== ""
      && text(value, value === body.conductor ? 120 : 40) === undefined)) {
    return res.status(400).json({ success: false, error: "Indica placa, modelo y una capacidad válida" });
  }
  try {
    const company = await pool.query("SELECT id, activa FROM empresas_asociadas WHERE id = $1", [companyId]);
    if (!company.rowCount) return res.status(404).json({ success: false, error: "Empresa asociada no encontrada" });
    if (!company.rows[0].activa) return res.status(409).json({ success: false, error: "Activa la empresa antes de agregar vehículos" });
    const result = await pool.query(
      `INSERT INTO vehiculos_asociados (empresa_id, placa, modelo, capacidad, conductor, conductor_telefono)
       VALUES ($1, UPPER($2), $3, $4, $5, $6) RETURNING *`,
      [companyId, placa, modelo, capacidad, conductor, conductorTelefono]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ success: false, error: "Ya existe ese vehículo para la empresa" });
    console.error("Error creando vehículo asociado:", error);
    return res.status(500).json({ success: false, error: "No se pudo registrar el vehículo asociado" });
  }
};

const actualizarVehiculoAsociado = async (req: any, res: any) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, error: "ID de vehículo inválido" });
  const placa = text(body.placa, 30);
  const modelo = text(body.modelo, 120);
  const conductor = text(body.conductor, 120);
  const conductorTelefono = text(body.conductor_telefono, 40);
  const capacidad = body.capacidad === undefined ? null : Number(body.capacidad);
  if ((body.placa !== undefined && !placa) || (body.modelo !== undefined && !modelo)
    || (body.capacidad !== undefined && (!Number.isInteger(capacidad) || Number(capacidad) <= 0 || Number(capacidad) > 300))
    || [body.conductor, body.conductor_telefono].some((value) => value !== undefined && value !== null && ""
      !== value && text(value, value === body.conductor ? 120 : 40) === undefined)
    || (body.activo !== undefined && typeof body.activo !== "boolean")) {
    return res.status(400).json({ success: false, error: "Los datos del vehículo asociado no son válidos" });
  }
  try {
    const result = await pool.query(
      `UPDATE vehiculos_asociados
       SET placa = COALESCE($1, placa), modelo = COALESCE($2, modelo), capacidad = COALESCE($3, capacidad),
           conductor = CASE WHEN $4 THEN $5 ELSE conductor END,
           conductor_telefono = CASE WHEN $6 THEN $7 ELSE conductor_telefono END,
           activo = COALESCE($8, activo), actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [
        placa?.toUpperCase() || null, modelo, capacidad,
        body.conductor !== undefined, conductor, body.conductor_telefono !== undefined, conductorTelefono,
        body.activo === undefined ? null : body.activo, id,
      ]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "Vehículo asociado no encontrado" });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ success: false, error: "Ya existe ese vehículo para la empresa" });
    console.error("Error actualizando vehículo asociado:", error);
    return res.status(500).json({ success: false, error: "No se pudo actualizar el vehículo asociado" });
  }
};

module.exports = {
  listarEmpresasAsociadas,
  crearEmpresaAsociada,
  actualizarEmpresaAsociada,
  crearVehiculoAsociado,
  actualizarVehiculoAsociado,
};
