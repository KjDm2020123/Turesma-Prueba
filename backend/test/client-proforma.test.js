const test = require("node:test");
const assert = require("node:assert/strict");

const reservation = {
  id: 91,
  origen: "Quito",
  destino: "Manta",
  fecha_servicio: "2026-11-11",
  hora_salida: "08:30",
  fecha_regreso: "2026-11-15",
  hora_regreso: "10:00",
  num_personas: 6,
  notas: "Viaje familiar",
  tipo_vehiculo: "van",
  precio: "420.00",
  cliente_nombre: "Cliente de prueba",
  cliente_email: "cliente@example.invalid",
  cliente_telefono: "0990000000",
  cliente_cedula: "1234567890",
};

const pool = {
  async query(sql, params) {
    const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (query.startsWith("select r.id, r.origen")) {
      return params[1] === 7 ? { rows: [{ ...reservation }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (query.startsWith("select id from cotizaciones where reserva_id")) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected proforma query: ${query}`);
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

const { buildProformaDataDeReserva, generarProformaPDF } = require("../dist/config/proforma");

test("genera proforma para reserva propia sin cotización vinculada", async () => {
  const data = await buildProformaDataDeReserva(91, 7);
  assert.equal(data.numero, "RES-91");
  assert.equal(data.precio, 420);
  assert.equal(data.servicio.tipo_vehiculo, "van");
  assert.equal(data.servicio.fecha_regreso, "2026-11-15");

  const pdf = await generarProformaPDF(data);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1000);
});

test("no expone la proforma de una reserva que pertenece a otro usuario", async () => {
  const data = await buildProformaDataDeReserva(91, 8);
  assert.equal(data, null);
});
