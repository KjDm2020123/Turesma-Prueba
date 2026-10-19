const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DB_USER = process.env.DB_USER || "postgres";
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_NAME = process.env.DB_NAME || "turesma_db";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test";
process.env.DB_PORT = process.env.DB_PORT || "5432";

const { generarReciboPago } = require("../dist/config/reciboPago");

test("genera un PDF de constancia para un pago aprobado", async () => {
  const pdf = await generarReciboPago({
    id: 42,
    reserva_id: 17,
    monto: 125.5,
    metodo: "transferencia",
    proveedor_id: null,
    creado_en: "2026-10-18T12:00:00.000Z",
    revisado_en: "2026-10-18T12:30:00.000Z",
    reserva_total: 250,
    monto_pagado: 125.5,
    estado_pago: "confirmado",
    origen: "Quito",
    destino: "Manta",
    cliente_nombre: "Cliente de prueba",
    cliente_email: "cliente@example.com",
  });

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1000);
});
