export {};

const pool = require("./db");

const DEFAULT_PRICING = {
  tarifa_diaria: 80,
  precio_km: 0.8,
  tarifa_viaje: 15,
  recargo_peajes: 0,
  minimo_km: 0,
  tarifa_van: 80,
  tarifa_bus: 120,
  tarifa_suv: 110,
  tarifa_minibus: 95,
  tarifa_sedan: 70,
  traslado_van: 35, traslado_bus: 55, traslado_suv: 50, traslado_minibus: 42, traslado_sedan: 30,
  hora_van: 15, hora_bus: 25, hora_suv: 22, hora_minibus: 19, hora_sedan: 14,
  medio_dia_van: 55, medio_dia_bus: 85, medio_dia_suv: 78, medio_dia_minibus: 68, medio_dia_sedan: 50,
  oferta_activa: false,
  oferta_dia: "lunes",
  descuento_oferta_pct: 0,
  oferta_descripcion: "",
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const getPricing = async () => {
  const result = await pool.query("SELECT * FROM configuracion_tarifas WHERE id = 1");
  return result.rows[0] || { id: 1, ...DEFAULT_PRICING };
};

const haversineKm = (originLat: number, originLng: number, destinationLat: number, destinationLng: number) => {
  const earthRadiusKm = 6371;
  const latDelta = (destinationLat - originLat) * Math.PI / 180;
  const lngDelta = (destinationLng - originLng) * Math.PI / 180;
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(originLat * Math.PI / 180) * Math.cos(destinationLat * Math.PI / 180) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const roadDistanceKm = async (originLat: number, originLng: number, destinationLat: number, destinationLng: number) => {
  const fallback = haversineKm(originLat, originLng, destinationLat, destinationLng);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destinationLng},${destinationLat}?overview=false`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!response.ok) return fallback;
    const data = await response.json();
    const distance = Number(data?.routes?.[0]?.distance);
    return Number.isFinite(distance) && distance > 0 ? distance / 1000 : fallback;
  } catch {
    return fallback;
  }
};

const vehicleRateKey = (vehicleType: string | null | undefined) => {
  const type = String(vehicleType || "").trim().toLowerCase();
  if (["bus", "microbus", "coaster"].includes(type)) return "tarifa_bus";
  if (["suv", "4x4", "jeep"].includes(type)) return "tarifa_suv";
  if (["minibus", "minivan", "minivan"].includes(type)) return "tarifa_minibus";
  if (["sedan", "carro", "auto"].includes(type)) return "tarifa_sedan";
  return "tarifa_van";
};

const calculateQuote = ({ pricing, distanceKm, days, trips, vehicleType, serviceMode = "dia", hours = 1 }: {
  pricing: any; distanceKm: number; days: number; trips: number; vehicleType?: string | null; serviceMode?: string; hours?: number;
}) => {
  const billedKm = Math.max(Number(pricing.minimo_km) || 0, Number(distanceKm) || 0);
  const rateKey = vehicleRateKey(vehicleType);
  const dailyBase = Number(pricing[rateKey]) || Number(pricing.tarifa_diaria) || 0;
  const typeSuffix = rateKey.replace("tarifa_", "");
  const mode = ["traslado", "horas", "medio_dia", "dia", "varios_dias"].includes(serviceMode) ? serviceMode : "dia";
  const selectedHours = Math.max(1, Number(hours) || 1);
  const serviceRateKey = mode === "traslado" ? `traslado_${typeSuffix}` : mode === "horas" ? `hora_${typeSuffix}` : mode === "medio_dia" ? `medio_dia_${typeSuffix}` : rateKey;
  const serviceBase = Number(pricing[serviceRateKey]) || dailyBase;
  const offerDiscount = Number(pricing.descuento_oferta_pct) || 0;
  const offerActive = Boolean(pricing.oferta_activa);
  const dailyBeforeOffer = mode === "horas" ? serviceBase * selectedHours : mode === "medio_dia" || mode === "traslado" ? serviceBase : dailyBase * Math.max(1, days);
  const dailyOfferDiscount = offerActive ? (dailyBeforeOffer * offerDiscount) / 100 : 0;
  const daily = dailyBeforeOffer - dailyOfferDiscount;
  const distance = billedKm * (Number(pricing.precio_km) || 0);
  const travel = (Number(pricing.tarifa_viaje) || 0) * Math.max(1, trips);
  const tolls = Number(pricing.recargo_peajes) || 0;
  const total = daily + distance + (mode === "traslado" ? 0 : travel) + tolls;
  return {
    distance_km: roundMoney(Number(distanceKm) || 0),
    billed_km: roundMoney(billedKm),
    days: Math.max(1, days),
    trips: Math.max(1, trips),
    vehicle_type: vehicleType || "van",
    service_mode: mode,
    hours: selectedHours,
    service_rate: roundMoney(serviceBase),
    vehicle_rate: roundMoney(dailyBase),
    oferta_activa: offerActive,
    descuento_oferta_pct: roundMoney(offerDiscount),
    daily_amount_before_offer: roundMoney(dailyBeforeOffer),
    discount_amount: roundMoney(dailyOfferDiscount),
    daily_amount: roundMoney(daily),
    distance_amount: roundMoney(distance),
    trips_amount: roundMoney(mode === "traslado" ? 0 : travel),
    tolls_amount: roundMoney(tolls),
    total: roundMoney(total),
  };
};

module.exports = { DEFAULT_PRICING, getPricing, haversineKm, roadDistanceKm, calculateQuote };