export {};

const pool = require("../../config/db");

const historialViajes = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         r.id,
         r.fecha_reserva,
         r.estado,
         r.num_personas,
         r.total,
         u.nombre AS usuario_nombre,
         c.nombre AS conductor_nombre,
         t.titulo AS tour_titulo,
         v.placa AS vehiculo_placa
       FROM reservas r
       INNER JOIN usuarios u ON u.id = r.usuario_id
       INNER JOIN tours t ON t.id = r.tour_id
       LEFT JOIN usuarios c ON c.id = r.conductor_id
       LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
       ORDER BY r.fecha_reserva DESC, r.id DESC`
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error obteniendo historial de viajes:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const historialReservas = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         r.id,
         r.fecha_creacion,
         r.fecha_reserva,
         r.estado,
         r.num_personas,
         r.total,
         u.nombre AS usuario_nombre,
         t.titulo AS tour_titulo
       FROM reservas r
       INNER JOIN usuarios u ON u.id = r.usuario_id
       INNER JOIN tours t ON t.id = r.tour_id
       ORDER BY r.fecha_creacion DESC, r.id DESC`
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error obteniendo historial de reservas:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const viajesFinalizados = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         r.id,
         r.fecha_reserva,
         r.num_personas,
         r.total,
         u.nombre AS usuario_nombre,
         c.nombre AS conductor_nombre,
         t.titulo AS tour_titulo,
         v.placa AS vehiculo_placa
       FROM reservas r
       INNER JOIN usuarios u ON u.id = r.usuario_id
       INNER JOIN tours t ON t.id = r.tour_id
       LEFT JOIN usuarios c ON c.id = r.conductor_id
       LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
       WHERE r.estado = 'finalizada'
       ORDER BY r.fecha_reserva DESC, r.id DESC`
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error obteniendo viajes finalizados:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const reporteViajes = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         fecha_reserva,
         COUNT(*) AS cantidad_viajes,
         COUNT(*) FILTER (WHERE estado = 'finalizada') AS viajes_finalizados,
         COALESCE(SUM(total), 0) AS ingresos
       FROM reservas
       GROUP BY fecha_reserva
       ORDER BY fecha_reserva DESC`
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error obteniendo reporte de viajes:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const reporteReservas = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         estado,
         COUNT(*) AS cantidad,
         COALESCE(SUM(total), 0) AS total
       FROM reservas
       GROUP BY estado
       ORDER BY estado ASC`
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error obteniendo reporte de reservas:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const reporteVehiculosUsados = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         v.id,
         v.placa,
         v.modelo,
         COUNT(r.id) AS viajes_realizados,
         COALESCE(SUM(r.num_personas), 0) AS personas_transportadas
       FROM vehiculos v
       LEFT JOIN reservas r
         ON r.vehiculo_id = v.id
         AND r.estado <> 'cancelada'
       GROUP BY v.id, v.placa, v.modelo
       ORDER BY viajes_realizados DESC, v.placa ASC`
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error obteniendo reporte de vehículos usados:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const verHistorial = historialReservas;

const verReportes = async (_req, res) => {
  try {
    const [resumen, porEstado, porTour] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) AS total_reservas,
           COALESCE(SUM(total), 0) AS ingresos_totales,
           COUNT(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
           COUNT(*) FILTER (WHERE estado = 'confirmada') AS confirmadas,
           COUNT(*) FILTER (WHERE estado = 'cancelada') AS canceladas
         FROM reservas`
      ),
      pool.query(
        `SELECT estado, COUNT(*) AS cantidad
         FROM reservas
         GROUP BY estado
         ORDER BY estado ASC`
      ),
      pool.query(
        `SELECT t.titulo, COUNT(r.id) AS cantidad_reservas, COALESCE(SUM(r.total), 0) AS total
         FROM tours t
         LEFT JOIN reservas r ON r.tour_id = t.id
         GROUP BY t.id, t.titulo
         ORDER BY cantidad_reservas DESC, t.titulo ASC`
      ),
    ]);

    return res.status(200).json({
      resumen: resumen.rows[0],
      por_estado: porEstado.rows,
      por_tour: porTour.rows,
    });
  } catch (error) {
    console.error("Error obteniendo reportes:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

const exportarReporteCSV = async (req, res) => {
  const tipo = String(req.query.tipo || "reservas");

  try {
    let rows: any[] = [];
    let headers: string[] = [];
    let filename = "reporte";

    if (tipo === "vehiculos") {
      const result = await pool.query(
        `SELECT v.placa, v.modelo, v.tipo, v.capacidad, v.color, v.estado,
                u.nombre AS conductor, COUNT(r.id) AS viajes_realizados
         FROM vehiculos v
         LEFT JOIN usuarios u ON u.id = v.usuario_id
         LEFT JOIN reservas r ON r.vehiculo_id = v.id AND r.estado <> 'cancelada'
         WHERE v.activo = true
         GROUP BY v.id, v.placa, v.modelo, v.tipo, v.capacidad, v.color, v.estado, u.nombre
         ORDER BY v.placa ASC`
      );
      rows = result.rows;
      headers = ["placa", "modelo", "tipo", "capacidad", "color", "estado", "conductor", "viajes_realizados"];
      filename = "reporte_vehiculos";
    } else if (tipo === "conductores") {
      const result = await pool.query(
        `SELECT u.nombre, u.email, u.telefono, c.licencia, c.estado, c.rating_promedio,
                c.viajes_completados, c.horas_conduccion, c.estado_documentos
         FROM usuarios u
         LEFT JOIN conductores c ON c.usuario_id = u.id
         WHERE LOWER(u.rol) = 'vehiculo' AND u.activo = true
         ORDER BY u.nombre ASC`
      );
      rows = result.rows;
      headers = ["nombre", "email", "telefono", "licencia", "estado", "rating_promedio", "viajes_completados", "horas_conduccion", "estado_documentos"];
      filename = "reporte_conductores";
    } else {
      // reservas (default) — admite filtrar por rango de fecha (?desde=&hasta=),
      // el mismo filtro que ya usa el Dashboard de Rendimiento.
      const { desde, hasta } = req.query;
      const params: any[] = [];
      let whereFecha = "";
      if (desde && hasta) {
        params.push(desde, hasta);
        whereFecha = `WHERE r.fecha_reserva BETWEEN $1 AND $2`;
      }

      const result = await pool.query(
        `SELECT r.id, r.fecha_reserva, r.estado, r.num_personas, r.total,
                u.nombre AS cliente, t.titulo AS servicio,
                uc.nombre AS conductor, v.placa AS vehiculo
         FROM reservas r
         LEFT JOIN usuarios u ON u.id = r.usuario_id
         LEFT JOIN tours t ON t.id = r.tour_id
         LEFT JOIN conductores c ON c.id = r.conductor_id
         LEFT JOIN usuarios uc ON uc.id = c.usuario_id
         LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
         ${whereFecha}
         ORDER BY r.fecha_reserva DESC, r.id DESC
         LIMIT 1000`,
        params
      );
      rows = result.rows;
      headers = ["id", "fecha_reserva", "estado", "num_personas", "total", "cliente", "servicio", "conductor", "vehiculo"];
      filename = "reporte_reservas";
    }

    // Generar CSV. pg devuelve las columnas DATE como objetos Date de JS: sin
    // este formateo, String(valor) imprime algo como "Wed Jul 22 2026 00:00:00
    // GMT-0500 (hora de Ecuador)" en vez de una fecha limpia para Excel.
    const csvLines = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((h) => {
          const val = row[h] ?? "";
          const str = (val instanceof Date ? val.toISOString().slice(0, 10) : String(val)).replace(/"/g, '""');
          return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
        }).join(",")
      ),
    ];

    const csv = csvLines.join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(200).send("\uFEFF" + csv); // BOM para Excel
  } catch (error) {
    console.error("Error exportando CSV:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = {
  historialViajes,
  historialReservas,
  viajesFinalizados,
  reporteViajes,
  reporteReservas,
  reporteVehiculosUsados,
  verHistorial,
  verReportes,
  exportarReporteCSV,
};
