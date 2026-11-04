const test = require("node:test");
const assert = require("node:assert/strict");

const queries = [];
const pool = {
  async query(sql, params = []) {
    const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
    queries.push({ query, params });
    if (query.startsWith("insert into requerimientos_personalizados")) {
      return { rows: [{ id: 44, estado: "pendiente", creado_en: "2026-11-03T20:00:00Z" }], rowCount: 1 };
    }
    if (query.startsWith("select id, organizacion")) {
      return { rows: [{ id: 44, usuario_id: params[0], estado: "pendiente" }], rowCount: 1 };
    }
    if (query.startsWith("update requerimientos_personalizados")) {
      return {
        rows: [{ id: params[3], usuario_id: 7, estado: params[0], respuesta_admin: params[1] }],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected requerimiento query: ${query}`);
  },
};

const dbModule = require.resolve("../dist/config/db");
require.cache[dbModule] = {
  id: dbModule,
  filename: dbModule,
  loaded: true,
  exports: pool,
  children: [],
  paths: [],
};

const notificationsModule = require.resolve("../dist/config/notificaciones");
const sentNotifications = [];
require.cache[notificationsModule] = {
  id: notificationsModule,
  filename: notificationsModule,
  loaded: true,
  exports: {
    async notificarAdmins(...args) { sentNotifications.push(["admins", ...args]); },
    async crearNotificacion(...args) { sentNotifications.push(["client", ...args]); },
  },
  children: [],
  paths: [],
};

const {
  crearRequerimiento,
  listarMisRequerimientos,
  actualizarRequerimientoAdmin,
} = require("../dist/controllers/requerimientos-personalizados.controller");

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("valida y guarda un requerimiento personalizado asociado al cliente autenticado", async () => {
  const invalidRes = response();
  await crearRequerimiento({
    user: { id: 7 },
    body: {
      detalles: "demanda de buses",
      grupos_servicio: [{ cantidad_vehiculos: 1, fecha_servicio: "2026-02-31", simultaneo: false }],
    },
  }, invalidRes);
  assert.equal(invalidRes.statusCode, 400);

  const res = response();
  await crearRequerimiento({
    user: { id: 7 },
    body: {
      organizacion: "Empresa de prueba",
      detalles: "Se requieren diez buses para trasladar personal.",
      grupos_servicio: [
        {
          cantidad_vehiculos: 10,
          tipo_vehiculo: "Bus",
          pasajeros_por_vehiculo: 40,
          fecha_servicio: "2026-11-10",
          fecha_fin: "2026-11-11",
          hora_salida: "08:30",
          origen: "Manta",
          destino: "Quito",
          paradas: "Portoviejo",
          detalles: "Recoger al personal en la terminal.",
          simultaneo: true,
        },
        {
          cantidad_vehiculos: 1,
          tipo_vehiculo: "SUV",
          pasajeros_por_vehiculo: 4,
          fecha_servicio: "2026-11-10",
          fecha_fin: "",
          hora_salida: "09:00",
          origen: "Manta",
          destino: "Montecristi",
          paradas: "",
          detalles: "",
          simultaneo: false,
        },
      ],
    },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, 44);
  assert.equal(queries.at(-1).params[0], 7);
  assert.equal(queries.at(-1).params[2], 11);
  assert.equal(queries.at(-1).params[3], "Varios");
  assert.equal(JSON.parse(queries.at(-1).params[11])[0].simultaneo, true);
  assert.equal(sentNotifications[0][0], "admins");
});

test("lista solo los requerimientos del cliente y permite responder desde administración", async () => {
  const listRes = response();
  await listarMisRequerimientos({ user: { id: 7 } }, listRes);
  assert.equal(listRes.body[0].usuario_id, 7);
  assert.equal(queries.at(-1).params[0], 7);

  const updateRes = response();
  await actualizarRequerimientoAdmin({
    params: { id: "44" },
    user: { id: 2 },
    body: { estado: "respondido", respuesta_admin: "Estamos coordinando unidades disponibles." },
  }, updateRes);
  assert.equal(updateRes.statusCode, 200);
  assert.equal(updateRes.body.estado, "respondido");
  assert.equal(sentNotifications.at(-1)[0], "client");
  assert.equal(sentNotifications.at(-1)[2], 7);
});
