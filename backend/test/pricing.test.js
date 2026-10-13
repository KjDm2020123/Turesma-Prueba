const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DB_USER = process.env.DB_USER || "postgres";
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_NAME = process.env.DB_NAME || "turesma_db";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test";
process.env.DB_PORT = process.env.DB_PORT || "5432";

const { calculateQuote } = require("../dist/config/pricing");

const pricing = {
  tarifa_diaria: 80,
  precio_km: 1,
  tarifa_viaje: 10,
  recargo_peajes: 5,
  minimo_km: 20,
  tarifa_van: 80,
  traslado_van: 35,
  hora_van: 15,
  medio_dia_van: 55,
  oferta_activa: false,
  descuento_oferta_pct: 0,
};

test("calcula una cotización diaria aplicando kilometraje mínimo", () => {
  const quote = calculateQuote({
    pricing,
    distanceKm: 8,
    days: 1,
    trips: 2,
    vehicleType: "van",
    serviceMode: "dia",
  });

  assert.equal(quote.billed_km, 20);
  assert.equal(quote.daily_amount, 80);
  assert.equal(quote.distance_amount, 20);
  assert.equal(quote.trips_amount, 20);
  assert.equal(quote.tolls_amount, 5);
  assert.equal(quote.total, 125);
});

test("calcula traslado sin cobrar viajes adicionales", () => {
  const quote = calculateQuote({
    pricing,
    distanceKm: 40,
    days: 1,
    trips: 3,
    vehicleType: "van",
    serviceMode: "traslado",
  });

  assert.equal(quote.service_rate, 35);
  assert.equal(quote.trips_amount, 0);
  assert.equal(quote.total, 80);
});

test("aplica descuento de oferta al importe del servicio", () => {
  const quote = calculateQuote({
    pricing: { ...pricing, oferta_activa: true, descuento_oferta_pct: 10 },
    distanceKm: 20,
    days: 1,
    trips: 1,
    vehicleType: "van",
    serviceMode: "dia",
  });

  assert.equal(quote.discount_amount, 8);
  assert.equal(quote.total, 107);
});
