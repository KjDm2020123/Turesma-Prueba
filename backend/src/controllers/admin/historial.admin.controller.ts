export {};

const pool = require("../../config/db");

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ── Admin: balance histórico mes a mes de un año (ingresos, gastos, utilidad) ─
const getHistorialMensual = async (req: any, res: any) => {
  try {
    const anio = Number(req.query.anio) || new Date().getFullYear();

    const [ingresosR, gastosR, aniosR] = await Promise.all([
      // Actividad y dinero por mes (reservas que generan ingreso).
      pool.query(
        `SELECT EXTRACT(MONTH FROM fecha_reserva)::int AS mes,
                COUNT(*) FILTER (WHERE estado IN ('confirmada','en_curso','finalizada'))::int AS viajes,
                COALESCE(SUM(num_personas) FILTER (WHERE estado IN ('confirmada','en_curso','finalizada')), 0)::int AS pasajeros,
                COALESCE(SUM(total) FILTER (WHERE estado IN ('confirmada','en_curso','finalizada')), 0)::numeric AS ingresos,
                COUNT(*) FILTER (WHERE estado = 'cancelada')::int AS cancelados
         FROM reservas
         WHERE EXTRACT(YEAR FROM fecha_reserva) = $1
         GROUP BY 1`,
        [anio]
      ),
      // Gastos de mantenimiento por mes (completados).
      pool.query(
        `SELECT EXTRACT(MONTH FROM COALESCE(fecha_realizada, fecha_programada))::int AS mes,
                COALESCE(SUM(costo), 0)::numeric AS gastos
         FROM mantenimiento_vehiculos
         WHERE estado = 'completado'
           AND EXTRACT(YEAR FROM COALESCE(fecha_realizada, fecha_programada)) = $1
         GROUP BY 1`,
        [anio]
      ),
      // Años que tienen datos, para el selector.
      pool.query(
        `SELECT DISTINCT EXTRACT(YEAR FROM fecha_reserva)::int AS anio
         FROM reservas WHERE fecha_reserva IS NOT NULL ORDER BY 1 DESC`
      ),
    ]);

    const ingMap: Record<number, any> = {};
    for (const r of ingresosR.rows) ingMap[r.mes] = r;
    const gasMap: Record<number, number> = {};
    for (const r of gastosR.rows) gasMap[r.mes] = Number(r.gastos);

    // Construye los 12 meses, con ceros donde no hay datos, y el % de crecimiento
    // de ingresos respecto al mes anterior.
    const meses: any[] = [];
    let ingresosPrev: number | null = null;
    for (let m = 1; m <= 12; m++) {
      const i = ingMap[m] || {};
      const ingresos = Math.round(Number(i.ingresos || 0));
      const gastos = Math.round(gasMap[m] || 0);
      const viajes = Number(i.viajes || 0);
      let crecimiento: number | null = null;
      if (ingresosPrev !== null && ingresosPrev > 0) {
        crecimiento = Math.round(((ingresos - ingresosPrev) / ingresosPrev) * 100);
      }
      meses.push({
        mes: m,
        nombre: MESES[m],
        viajes,
        pasajeros: Number(i.pasajeros || 0),
        ingresos,
        gastos,
        utilidad: ingresos - gastos,
        cancelados: Number(i.cancelados || 0),
        ticket_promedio: viajes > 0 ? Math.round(ingresos / viajes) : 0,
        crecimiento,
      });
      // Solo arrastra el previo si el mes tuvo actividad (evita % raros con meses vacíos).
      if (viajes > 0 || ingresos > 0) ingresosPrev = ingresos;
    }

    const conActividad = meses.filter((x) => x.viajes > 0 || x.ingresos > 0);
    const resumen = {
      viajes: meses.reduce((a, x) => a + x.viajes, 0),
      pasajeros: meses.reduce((a, x) => a + x.pasajeros, 0),
      ingresos: meses.reduce((a, x) => a + x.ingresos, 0),
      gastos: meses.reduce((a, x) => a + x.gastos, 0),
      utilidad: meses.reduce((a, x) => a + x.utilidad, 0),
      cancelados: meses.reduce((a, x) => a + x.cancelados, 0),
      mejorMes: conActividad.length ? conActividad.reduce((a, b) => (b.ingresos > a.ingresos ? b : a)).nombre : null,
      peorMes: conActividad.length ? conActividad.reduce((a, b) => (b.ingresos < a.ingresos ? b : a)).nombre : null,
    };

    const anios = aniosR.rows.map((r: any) => r.anio);
    if (!anios.includes(anio)) anios.unshift(anio);

    return res.json({ success: true, anio, anios, meses, resumen });
  } catch (error) {
    console.error("Error obteniendo historial mensual:", error);
    return res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
};

module.exports = { getHistorialMensual };
