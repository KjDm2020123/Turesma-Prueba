export {};

const pool = require("../../config/db");

const positiveInt = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const dateValue = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

const listarViajesAdmin = async (_req: any, res: any) => {
  try {
    const result = await pool.query(`
      SELECT t.*, COALESCE((SELECT jsonb_agg(ti.imagen_url ORDER BY ti.orden) FROM tour_imagenes ti WHERE ti.tour_id = t.id), t.imagenes) AS imagenes, v.placa AS vehiculo_placa, v.modelo AS vehiculo_modelo, v.imagen_url AS vehiculo_imagen_url,
        COALESCE((SELECT SUM(r.num_personas) FROM reservas r WHERE r.tour_id = t.id AND r.estado NOT IN ('cancelada', 'finalizada')), 0)::int AS reservados,
        GREATEST(COALESCE(t.cupos_totales, t.capacidad, 0) - COALESCE((SELECT SUM(r.num_personas) FROM reservas r WHERE r.tour_id = t.id AND r.estado NOT IN ('cancelada', 'finalizada')), 0), 0)::int AS cupos_disponibles
      FROM tours t
      LEFT JOIN vehiculos v ON v.id = t.vehiculo_id
      ORDER BY t.fecha_servicio DESC NULLS LAST, t.id DESC
    `);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error listando viajes publicados:", error);
    return res.status(500).json({ success: false, error: "No se pudieron cargar los viajes" });
  }
};

const crearViajeAdmin = async (req: any, res: any) => {
  const body = req.body || {};
  const title = String(body.titulo || `${body.origen || ""} - ${body.destino || ""}`).trim();
  const origin = String(body.origen || "").trim();
  const destination = String(body.destino || "").trim();
  const date = dateValue(body.fecha_servicio);
  const price = Number(body.precio);
  const capacity = positiveInt(body.cupos_totales || body.capacidad);

  if (!title || !origin || !destination || !Number.isFinite(price) || price < 0 || !capacity) {
    return res.status(400).json({ success: false, error: "Origen, destino, precio y cupos válidos son obligatorios" });
  }

  try {
    const vehicleId = positiveInt(body.vehiculo_id);
    const vehicle = await pool.query("SELECT id, capacidad, estado, activo FROM vehiculos WHERE id = $1 LIMIT 1", [vehicleId]);
    if (!vehicleId || !vehicle.rowCount) return res.status(400).json({ success: false, error: "Debes seleccionar un vehículo existente" });
    if (!vehicle.rows[0].activo || ["mantenimiento", "inactivo"].includes(vehicle.rows[0].estado)) return res.status(409).json({ success: false, error: "No se puede publicar el viaje con un vehículo inactivo o en mantenimiento" });
    if (capacity > Number(vehicle.rows[0].capacidad || 0)) return res.status(400).json({ success: false, error: "Los cupos no pueden superar la capacidad del vehículo seleccionado" });
    const result = await pool.query(`
      INSERT INTO tours (titulo, descripcion, precio, duracion, capacidad, ubicacion, imagen_url, imagenes, activo, origen, destino, fecha_servicio, hora_salida, cupos_totales, tipo_servicio, vehiculo_id, creado_por)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [title, body.descripcion || null, price, body.duracion || null, capacity, `${origin} - ${destination}`, body.imagen_url || null, JSON.stringify(Array.isArray(body.imagenes) ? body.imagenes.slice(0, 8) : []), body.activo !== false, origin, destination, date, body.hora_salida || null, capacity, String(body.tipo_servicio || "viaje").slice(0, 80), vehicleId, req.user?.id || null]);
    const images = Array.isArray(body.imagenes) ? body.imagenes.filter((url: unknown) => typeof url === "string" && url.trim()).slice(0, 8) : [];
    if (images.length) {
      await pool.query(
        `INSERT INTO tour_imagenes (tour_id, imagen_url, orden)
         SELECT $1, image_url, image_order
         FROM unnest($2::text[], $3::int[]) AS image_data(image_url, image_order)`,
        [result.rows[0].id, images, images.map((_: string, index: number) => index)]
      );
    }
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error creando viaje publicado:", error);
    return res.status(500).json({ success: false, error: "No se pudo crear el viaje" });
  }
};

const actualizarViajeAdmin = async (req: any, res: any) => {
  const id = positiveInt(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: "ID inválido" });
  const body = req.body || {};
  try {
    const current = await pool.query("SELECT * FROM tours WHERE id = $1", [id]);
    if (!current.rowCount) return res.status(404).json({ success: false, error: "Viaje no encontrado" });
    const old = current.rows[0];
    const capacity = body.cupos_totales || body.capacidad ? positiveInt(body.cupos_totales || body.capacidad) : Number(old.cupos_totales || old.capacidad);
    const price = body.precio !== undefined ? Number(body.precio) : Number(old.precio);
    if (!capacity || !Number.isFinite(price) || price < 0) return res.status(400).json({ success: false, error: "Precio o cupos inválidos" });
    const result = await pool.query(`
      UPDATE tours SET titulo = $1, descripcion = $2, precio = $3, fecha_servicio = $4, hora_salida = $5, cupos_totales = $6, capacidad = $6, tipo_servicio = $7, vehiculo_id = $8, activo = $9, origen = $10, destino = $11, ubicacion = $12, imagenes = $13::jsonb
      WHERE id = $14 RETURNING *
    `, [body.titulo || old.titulo, body.descripcion ?? old.descripcion, price, dateValue(body.fecha_servicio) || old.fecha_servicio, body.hora_salida ?? old.hora_salida, capacity, body.tipo_servicio || old.tipo_servicio || "viaje", positiveInt(body.vehiculo_id) || old.vehiculo_id || null, body.activo !== undefined ? Boolean(body.activo) : old.activo, body.origen || old.origen, body.destino || old.destino, `${body.origen || old.origen} - ${body.destino || old.destino}`, JSON.stringify(Array.isArray(body.imagenes) ? body.imagenes.slice(0, 8) : old.imagenes || []) , id]);
    if (Array.isArray(body.imagenes)) {
      const images = body.imagenes.filter((url: unknown) => typeof url === "string" && url.trim()).slice(0, 8);
      await pool.query("DELETE FROM tour_imagenes WHERE tour_id = $1", [id]);
      if (images.length) {
        await pool.query(
          `INSERT INTO tour_imagenes (tour_id, imagen_url, orden)
           SELECT $1, image_url, image_order
           FROM unnest($2::text[], $3::int[]) AS image_data(image_url, image_order)`,
          [id, images, images.map((_: string, index: number) => index)]
        );
      }
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error actualizando viaje publicado:", error);
    return res.status(500).json({ success: false, error: "No se pudo actualizar el viaje" });
  }
};

const eliminarViajeAdmin = async (req: any, res: any) => {
  const id = positiveInt(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: "ID inválido" });
  try {
    const result = await pool.query("UPDATE tours SET activo = false WHERE id = $1 RETURNING id", [id]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: "Viaje no encontrado" });
    return res.json({ success: true, message: "Viaje retirado de la publicación" });
  } catch (error) {
    console.error("Error retirando viaje:", error);
    return res.status(500).json({ success: false, error: "No se pudo retirar el viaje" });
  }
};

module.exports = { listarViajesAdmin, crearViajeAdmin, actualizarViajeAdmin, eliminarViajeAdmin };
