export {};

const pool = require("../../config/db");

// ============ LISTAR ASIGNACIONES ============
const listarAsignaciones = async (req: any, res: any) => {
  try {
    const { estado } = req.query;

    let where = "WHERE 1=1";
    const params: any[] = [];

    if (estado) {
      where += ` AND a.estado = $1`;
      params.push(estado);
    }

    const result = await pool.query(
      `SELECT a.*,
              u.nombre AS conductor_nombre,
              u.apellido AS conductor_apellido,
              u.email AS conductor_email,
              c.licencia AS conductor_licencia,
              c.tipo_licencia AS conductor_tipo_licencia,
              v.placa AS vehiculo_placa,
              v.marca AS vehiculo_marca,
              v.modelo AS vehiculo_modelo,
              v.capacidad AS vehiculo_capacidad,
              v.estado AS vehiculo_estado
       FROM asignacion_vehiculos a
       INNER JOIN conductores c ON c.id = a.conductor_id
       INNER JOIN usuarios u ON u.id = c.usuario_id
       INNER JOIN vehiculos v ON v.id = a.vehiculo_id
       ${where}
       ORDER BY a.creado_en DESC
       LIMIT 200`,
      params
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando asignaciones:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ============ CREAR ASIGNACIÓN ============
const crearAsignacion = async (req: any, res: any) => {
  try {
    const { conductor_id, vehiculo_id, fecha_inicio, observaciones } = req.body;

    if (!conductor_id || !vehiculo_id) {
      return res.status(400).json({ error: "Conductor y vehículo son obligatorios" });
    }

    // Regla 1: Un conductor no puede tener dos vehículos activos
    const conductorActivo = await pool.query(
      `SELECT id, vehiculo_id FROM asignacion_vehiculos
       WHERE conductor_id = $1 AND estado = 'activa'
       LIMIT 1`,
      [conductor_id]
    );

    if (conductorActivo.rowCount > 0) {
      return res.status(409).json({
        error: "Este conductor ya tiene un vehículo asignado activo. Finalice la asignación actual primero."
      });
    }

    // Regla 2: Un vehículo no puede estar asignado a dos conductores simultáneamente
    const vehiculoActivo = await pool.query(
      `SELECT id, conductor_id FROM asignacion_vehiculos
       WHERE vehiculo_id = $1 AND estado = 'activa'
       LIMIT 1`,
      [vehiculo_id]
    );

    if (vehiculoActivo.rowCount > 0) {
      return res.status(409).json({
        error: "Este vehículo ya está asignado a otro conductor. Libere el vehículo primero."
      });
    }

    // Verificar que conductor tenga licencia vigente
    const conductor = await pool.query(
      `SELECT c.id, c.fecha_licencia_vencimiento, c.estado, u.nombre
       FROM conductores c
       INNER JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.id = $1`,
      [conductor_id]
    );

    if (conductor.rowCount === 0) {
      return res.status(404).json({ error: "Conductor no encontrado" });
    }

    const conductorData = conductor.rows[0];

    // Alerta inteligente: licencia por vencer
    if (conductorData.fecha_licencia_vencimiento) {
      const vencimiento = new Date(conductorData.fecha_licencia_vencimiento);
      const hoy = new Date();
      if (vencimiento < hoy) {
        return res.status(400).json({
          error: `La licencia del conductor ${conductorData.nombre} está VENCIDA. No se puede asignar.`
        });
      }
      const diasRestantes = Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      if (diasRestantes <= 30) {
        // Permitir pero advertir - se incluirá en la respuesta
      }
    }

    const result = await pool.query(
      `INSERT INTO asignacion_vehiculos (conductor_id, vehiculo_id, fecha_inicio, observaciones, estado)
       VALUES ($1, $2, $3, $4, 'activa')
       RETURNING *`,
      [conductor_id, vehiculo_id, fecha_inicio || new Date().toISOString().slice(0, 10), observaciones || null]
    );

    // Actualizar estado del vehículo
    await pool.query(
      `UPDATE vehiculos SET estado = 'en_servicio', usuario_id = (SELECT usuario_id FROM conductores WHERE id = $1) WHERE id = $2`,
      [conductor_id, vehiculo_id]
    );

    // Actualizar estado del conductor
    await pool.query(
      `UPDATE conductores SET estado = 'en_servicio' WHERE id = $1`,
      [conductor_id]
    );

    return res.status(201).json({
      message: "Asignación creada correctamente",
      asignacion: result.rows[0]
    });
  } catch (error) {
    console.error("Error creando asignación:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ============ FINALIZAR ASIGNACIÓN ============
const finalizarAsignacion = async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  try {
    const result = await pool.query(
      `UPDATE asignacion_vehiculos
       SET estado = 'finalizada',
           fecha_fin = CURRENT_DATE,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $1 AND estado = 'activa'
       RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: "Asignación no encontrada o ya finalizada" });
    }

    const asignacion = result.rows[0];

    // Liberar vehículo
    await pool.query(
      `UPDATE vehiculos SET estado = 'disponible', usuario_id = NULL WHERE id = $1`,
      [asignacion.vehiculo_id]
    );

    // Liberar conductor
    await pool.query(
      `UPDATE conductores SET estado = 'disponible' WHERE id = $1`,
      [asignacion.conductor_id]
    );

    return res.status(200).json({
      message: "Asignación finalizada correctamente",
      asignacion
    });
  } catch (error) {
    console.error("Error finalizando asignación:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ============ HISTORIAL ASIGNACIONES ============
const historialAsignaciones = async (req: any, res: any) => {
  try {
    const { conductor_id, vehiculo_id } = req.query;

    let where = "WHERE a.estado = 'finalizada'";
    const params: any[] = [];
    let paramIdx = 1;

    if (conductor_id) {
      where += ` AND a.conductor_id = $${paramIdx++}`;
      params.push(Number(conductor_id));
    }
    if (vehiculo_id) {
      where += ` AND a.vehiculo_id = $${paramIdx++}`;
      params.push(Number(vehiculo_id));
    }

    const result = await pool.query(
      `SELECT a.*,
              u.nombre AS conductor_nombre,
              v.placa AS vehiculo_placa,
              v.modelo AS vehiculo_modelo
       FROM asignacion_vehiculos a
       INNER JOIN conductores c ON c.id = a.conductor_id
       INNER JOIN usuarios u ON u.id = c.usuario_id
       INNER JOIN vehiculos v ON v.id = a.vehiculo_id
       ${where}
       ORDER BY a.fecha_fin DESC
       LIMIT 100`,
      params
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error obteniendo historial:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ============ CONDUCTORES DISPONIBLES ============
const conductoresDisponiblesParaAsignar = async (_req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.licencia, c.tipo_licencia, c.estado, c.fecha_licencia_vencimiento,
              u.nombre, u.apellido, u.email
       FROM conductores c
       INNER JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.estado = 'disponible'
         AND u.activo = true
         AND c.id NOT IN (
           SELECT conductor_id FROM asignacion_vehiculos WHERE estado = 'activa'
         )
       ORDER BY u.nombre`
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando conductores disponibles:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// ============ VEHÍCULOS DISPONIBLES ============
const vehiculosDisponiblesParaAsignar = async (_req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT v.id, v.placa, v.marca, v.modelo, v.capacidad, v.kilometraje, v.estado
       FROM vehiculos v
       WHERE v.estado = 'disponible'
         AND v.activo = true
         AND v.id NOT IN (
           SELECT vehiculo_id FROM asignacion_vehiculos WHERE estado = 'activa'
         )
       ORDER BY v.placa`
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error listando vehículos disponibles:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = {
  listarAsignaciones,
  crearAsignacion,
  finalizarAsignacion,
  historialAsignaciones,
  conductoresDisponiblesParaAsignar,
  vehiculosDisponiblesParaAsignar,
};
