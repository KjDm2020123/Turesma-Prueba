export {};

const PAYPAL_API = process.env.PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

const getAccessToken = async () => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal no está configurado en el backend");
  const credentials = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error_description || "No se pudo autenticar con PayPal");
  return data.access_token as string;
};

const paypalRequest = async (path: string, options: RequestInit = {}) => {
  const token = await getAccessToken();
  const response = await fetch(`${PAYPAL_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || "Error en PayPal");
  return data;
};

const createPaypalOrder = (amount: number, reservationId: number) => paypalRequest("/v2/checkout/orders", {
  method: "POST",
  headers: { "PayPal-Request-Id": `turesma-reserva-${reservationId}-${Date.now()}` },
  body: JSON.stringify({
    intent: "CAPTURE",
    purchase_units: [{ reference_id: `reserva-${reservationId}`, custom_id: String(reservationId), amount: { currency_code: "USD", value: amount.toFixed(2) } }],
    application_context: {
      brand_name: "Turesma",
      user_action: "PAY_NOW",
      return_url: `${process.env.WEB_URL || "http://localhost:3000"}/cliente/historial?paypal=ok&reserva_id=${reservationId}`,
      cancel_url: `${process.env.WEB_URL || "http://localhost:3000"}/cliente/historial?paypal=cancelado&reserva_id=${reservationId}`,
    },
  }),
});

const capturePaypalOrder = (orderId: string) => paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST" });

module.exports = { createPaypalOrder, capturePaypalOrder };