export {};

const pool = require("../../config/db");
const { notificarAdmins } = require("../../config/notificaciones");

const MESES_ES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DIA_MS = 24 * 60 * 60 * 1000;

// Orden de visualización del calendario: dígitos 1..9 y al final el 0.
const ORDEN_DIGITOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

// ── Devuelve el mapa dígito→mes desde la tabla (con respaldo por si faltara) ──
const getCalendarioMap = async (): Promise<Record<number, number>> => {
  const fallback: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 0: 11 };
  try {
    const r = await pool.query("SELECT digito, mes FROM matricula_calendario");
    const map: Record<number, number> = {};
    for (const row of r.rows) map[Number(row.digito)] = Number(row.mes);
    return Object.keys(map).length ? map : fallback;
  } catch {
    return fallback;
  }
};

// Último dígito numérico de la placa (ignora letras y guiones).
const ultimoDigito = (placa: string | null): number | null => {
  if (!placa) return null;
  const soloNumeros = String(placa).replace(/[^0-9]/g, "");
  if (!soloNumeros) return null;
  return Number(soloNumeros[soloNumeros.length - 1]);
};

// ── Calcula el estado de matriculación de un vehículo ────────────────────────
const computeEstado = (vehiculo: any, calMap: Record<number, number>, hoy: Date) => {
  const digito = ultimoDigito(vehiculo.placa);
  if (digito === null) return null;
  const mes = calMap[digito];
  if (!mes) return null;

  const anioActual = hoy.getFullYear();
  const ultima: Date | null = vehiculo.fecha_matricula ? new Date(vehiculo.fecha_matricula) : null;
  const hechoEsteAnio = !!ultima && ultima.getFullYear() >= anioActual;

  const targetYear = hechoEsteAnio ? anioActual + 1 : anioActual;
  const inicioMes = new Date(targetYear, mes - 1, 1);
  const finMes = new Date(targetYear, mes, 0); // día 0 del mes siguiente = último día del mes

  const diasParaMes = Math.ceil((inicioMes.getTime() - hoy.getTime()) / DIA_MS);
  const diasParaFin = Math.ceil((finMes.getTime() - hoy.getTime()) / DIA_MS);

  let estado: string;
  if (hechoEsteAnio) {
    estado = "al_dia";
  } else if (diasParaFin < 0) {
    estado = "vencido"; // rezagado: el mes ya pasó y no se matriculó
  } else if (diasParaMes <= 0) {
    estado = "en_mes"; // estamos dentro del mes que le toca
  } else if (diasParaMes <= 30) {
    estado = "proximo"; // faltan 30 días o menos para su mes
  } else {
    estado = "al_dia";
  }

  const enAlerta = estado === "proximo" || estado === "en_mes" || estado === "vencido";

  return {
    vehiculo_id: vehiculo.id,
    placa: vehiculo.placa,
    modelo: vehiculo.modelo || null,
    tipo: vehiculo.tipo || null,
    digito,
    mes,
    mes_nombre: MESES_ES[mes],
    target_year: targetYear,
    fecha_limite: finMes.toISOString().slice(0, 10),
    dias_para_mes: diasParaMes,
    ultima_matricula: ultima ? ultima.toISOString().slice(0, 10) : null,
    estado,
    en_alerta: enAlerta,
  };
};

// ── Crea avisos (campana + dedupe) para vehículos que entran en alerta ───────
const generarAvisos = async (senderId: number | null | undefined, items: any[]) => {
  for (const it of items) {
    if (!it.en_alerta) continue;
    try {
      // Inserta la marca de aviso; si ya existía (mismo vehículo/año), no repite.
      const ins = await pool.query(
        `INSERT INTO matricula_avisos (vehiculo_id, anio)
         VALUES ($1, $2)
         ON CONFLICT (vehiculo_id, anio) DO NOTHING
         RETURNING id`,
        [it.vehiculo_id, it.target_year]
      );
      if (ins.rowCount === 0) continue; // ya se avisó este ciclo

      let mensaje: string;
      if (it.estado === "vencido") {
        mensaje = `Matrícula ATRASADA: el vehículo ${it.placa} debía matricularse en ${it.mes_nombre}. Regularízalo cuanto antes.`;
      } else if (it.estado === "en_mes") {
        mensaje = `Este mes toca matricular el vehículo ${it.placa} (${it.mes_nombre}, por placa terminada en ${it.digito}).`;
      } else {
        mensaje = `Recordatorio: el vehículo ${it.placa} debe matricularse en ${it.mes_nombre} (faltan ${it.dias_para_mes} días).`;
      }
      await notificarAdmins(senderId, mensaje, null, null);
    } catch (e: any) {
      console.error("Error generando aviso de matrícula:", e.message);
    }
  }
};

// ── Admin: lista el estado de matriculación de toda la flota ──────────────────
const listarMatriculas = async (req: any, res: any) => {
  try {
    const calMap = await getCalendarioMap();
    const veh = await pool.query(
      `SELECT id, placa, modelo, tipo, fecha_matricula
       FROM vehiculos
       WHERE placa IS NOT NULL AND placa <> ''
       ORDER BY placa ASC`
    );
    const hoy = new Date();
    const items = veh.rows
      .map((v: any) => computeEstado(v, calMap, hoy))
      .filter((x: any) => x !== null);

    // Dispara los avisos pendientes (best-effort, no bloquea la respuesta si falla).
    await generarAvisos(req.user?.id, items);

    const resumen = {
      al_dia: items.filter((i: any) => i.estado === "al_dia").length,
      proximos: items.filter((i: any) => i.estado === "proximo").length,
      en_mes: items.filter((i: any) => i.estado === "en_mes").length,
      vencidos: items.filter((i: any) => i.estado === "vencido").length,
      total: items.length,
    };

    // Orden: primero los que requieren atención (por días para el mes).
    const peso: Record<string, number> = { vencido: 0, en_mes: 1, proximo: 2, al_dia: 3 };
    items.sort((a: any, b: any) => (peso[a.estado] - peso[b.estado]) || (a.dias_para_mes - b.dias_para_mes));

    return res.status(200).json({ success: true, data: items, resumen });
  } catch (error) {
    console.error("Error listando matrículas:", error);
    return res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
};

// ── Admin: devuelve el calendario dígito→mes (editable) ──────────────────────
const getCalendario = async (_req: any, res: any) => {
  try {
    const calMap = await getCalendarioMap();
    const data = ORDEN_DIGITOS.map((d) => ({
      digito: d,
      mes: calMap[d] || null,
      mes_nombre: calMap[d] ? MESES_ES[calMap[d]] : null,
    }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error obteniendo calendario:", error);
    return res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
};

// ── Admin: actualiza el calendario (uno o varios dígitos) ────────────────────
const actualizarCalendario = async (req: any, res: any) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: "Debes enviar el calendario a guardar" });
    }
    for (const it of items) {
      const digito = Number(it.digito);
      const mes = Number(it.mes);
      if (!Number.isInteger(digito) || digito < 0 || digito > 9) {
        return res.status(400).json({ success: false, error: `Dígito inválido: ${it.digito}` });
      }
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
        return res.status(400).json({ success: false, error: `Mes inválido para el dígito ${digito}` });
      }
      await pool.query(
        `INSERT INTO matricula_calendario (digito, mes)
         VALUES ($1, $2)
         ON CONFLICT (digito) DO UPDATE SET mes = EXCLUDED.mes`,
        [digito, mes]
      );
    }
    return res.status(200).json({ success: true, message: "Calendario actualizado" });
  } catch (error) {
    console.error("Error actualizando calendario:", error);
    return res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
};

// ── Admin: marca un vehículo como matriculado (fija su última fecha) ─────────
const marcarMatriculado = async (req: any, res: any) => {
  const vehiculoId = Number(req.params.vehiculoId);
  if (!Number.isInteger(vehiculoId) || vehiculoId <= 0) {
    return res.status(400).json({ success: false, error: "ID inválido" });
  }
  try {
    const fecha = typeof req.body?.fecha === "string" && req.body.fecha ? req.body.fecha : new Date().toISOString().slice(0, 10);
    const r = await pool.query(
      "UPDATE vehiculos SET fecha_matricula = $1 WHERE id = $2 RETURNING id, placa, fecha_matricula",
      [fecha, vehiculoId]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, error: "Vehículo no encontrado" });
    return res.status(200).json({ success: true, message: "Matrícula registrada", data: r.rows[0] });
  } catch (error) {
    console.error("Error marcando matrícula:", error);
    return res.status(500).json({ success: false, error: "Error interno del servidor" });
  }
};

module.exports = {
  listarMatriculas,
  getCalendario,
  actualizarCalendario,
  marcarMatriculado,
};
