const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "partner-refund-integration-test-secret";

const state = {
  companies: [],
  vehicles: [],
  refunds: [],
  reservation: { id: 501, total: 80, estado: "confirmada", monto_pagado: 80, estado_pago: "pagado" },
  payment: { id: 601, reserva_id: 501, monto: 80, estado: "aprobado" },
  nextCompanyId: 1,
  nextVehicleId: 1,
  nextRefundId: 1,
};

const result = (rows = []) => ({ rows, rowCount: rows.length });
const pool = {
  async query(sql, params = []) {
    const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (query.startsWith("select * from empresas_asociadas")) return result(state.companies);
    if (query.startsWith("select * from vehiculos_asociados")) return result(state.vehicles);
    if (query.startsWith("insert into empresas_asociadas")) {
      const company = {
        id: state.nextCompanyId++,
        nombre: params[0],
        identificacion: params[1],
        contacto: params[2],
        telefono: params[3],
        email: params[4],
        notas: params[5],
        activa: true,
      };
      state.companies.push(company);
      return result([company]);
    }
    if (query.startsWith("select id, activa from empresas_asociadas")) {
      const company = state.companies.find((row) => row.id === Number(params[0]));
      return result(company ? [company] : []);
    }
    if (query.startsWith("insert into vehiculos_asociados")) {
      const vehicle = {
        id: state.nextVehicleId++,
        empresa_id: Number(params[0]),
        placa: params[1],
        modelo: params[2],
        capacidad: params[3],
        conductor: params[4],
        conductor_telefono: params[5],
        activo: true,
      };
      state.vehicles.push(vehicle);
      return result([vehicle]);
    }
    throw new Error(`Unexpected pool query: ${query}`);
  },
  async connect() {
    return {
      async query(sql, params = []) {
        const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
        if (["begin", "commit", "rollback"].includes(query)) return result();
        if (query.startsWith("select p.id, p.reserva_id, p.monto, p.estado, r.total")) {
          return result([{
            ...state.payment,
            total: state.reservation.total,
            reserva_estado: state.reservation.estado,
          }]);
        }
        if (query.startsWith("select coalesce(sum(monto), 0) as total from reembolsos_reserva where pago_id")) {
          const total = state.refunds.filter((refund) => refund.pago_id === Number(params[0])).reduce((sum, refund) => sum + refund.monto, 0);
          return result([{ total }]);
        }
        if (query.startsWith("select coalesce((select sum(monto) from pagos_reserva")) {
          const totalRefunded = state.refunds.filter((refund) => refund.reserva_id === Number(params[0])).reduce((sum, refund) => sum + refund.monto, 0);
          const gross = state.payment.reserva_id === Number(params[0]) ? state.payment.monto : 0;
          return result([{ neto: gross - totalRefunded, devuelto: totalRefunded }]);
        }
        if (query.startsWith("insert into reembolsos_reserva")) {
          const refund = {
            id: state.nextRefundId++,
            pago_id: Number(params[0]),
            reserva_id: Number(params[1]),
            monto: Number(params[2]),
            motivo: params[3],
            referencia_externa: params[4],
          };
          state.refunds.push(refund);
          return result([refund]);
        }
        if (query.startsWith("update reservas set monto_pagado = $1")) {
          Object.assign(state.reservation, { monto_pagado: Number(params[0]), estado_pago: params[1] });
          return result();
        }
        if (query.startsWith("insert into reserva_historial")) return result();
        throw new Error(`Unexpected transaction query: ${query}`);
      },
      release() {},
    };
  },
};

const databaseModule = require.resolve("../dist/config/db");
require.cache[databaseModule] = {
  id: databaseModule,
  filename: databaseModule,
  loaded: true,
  exports: pool,
  children: [],
  paths: [],
};

const adminRoutes = require("../dist/routes/admin.routes");
const app = express();
app.use(express.json());
app.use("/api/admin", adminRoutes);
const tokenForRole = (rol) => jwt.sign({ id: 99, email: `${rol}@example.invalid`, rol }, process.env.JWT_SECRET);

let server;
let baseUrl;

test("administra empresas asociadas y registra devoluciones con permisos y controles", async (t) => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const request = async (path, role, options = {}) => {
    const response = await fetch(`${baseUrl}/api/admin${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${tokenForRole(role)}`,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };

  await t.test("permite consultar el directorio a operaciones y reserva cambios a administración", async () => {
    assert.equal((await request("/empresas-asociadas", "operativo")).status, 200);
    assert.equal((await request("/empresas-asociadas", "operativo", {
      method: "POST",
      body: { nombre: "Transporte de prueba" },
    })).status, 403);
    const created = await request("/empresas-asociadas", "admin", {
      method: "POST",
      body: { nombre: "Transporte de prueba", contacto: "Contacto", telefono: "0990000000" },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.nombre, "Transporte de prueba");
    const invalidVehicle = await request(`/empresas-asociadas/${created.body.data.id}/vehiculos`, "admin", {
      method: "POST",
      body: { placa: "ABC-1234", modelo: "Van", capacidad: 0 },
    });
    assert.equal(invalidVehicle.status, 400);
  });

  await t.test("solo admin puede registrar una devolución y una devolución total exige reserva cancelada", async () => {
    const payload = {
      monto: 80,
      motivo: "Servicio cancelado por emergencia",
      referencia_externa: "DEV-TEST-001",
    };
    assert.equal((await request("/pagos/601/reembolso", "operativo", { method: "POST", body: payload })).status, 403);

    const notCancelled = await request("/pagos/601/reembolso", "admin", { method: "POST", body: payload });
    assert.equal(notCancelled.status, 409);
    assert.match(notCancelled.body.error, /primero debe cancelarse/i);
    assert.equal(state.refunds.length, 0);

    state.reservation.estado = "cancelada";
    const registered = await request("/pagos/601/reembolso", "admin", { method: "POST", body: payload });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    assert.match(registered.body.message, /no se transfirió dinero/i);
    assert.equal(registered.body.monto_pagado_neto, 0);
    assert.equal(registered.body.estado_pago, "reembolsado");
    assert.equal(state.refunds.length, 1);
  });
});
