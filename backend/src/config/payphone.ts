export {};

const PAYPHONE_API_URL = String(
  process.env.PAYPHONE_API_URL || "https://pay.payphonetodoesposible.com/api"
).replace(/\/+$/, "");

const getConfig = () => {
  const token = String(process.env.PAYPHONE_TOKEN || "").trim();
  const storeId = String(process.env.PAYPHONE_STORE_ID || "").trim();
  if (!token || !storeId) {
    throw new Error("PayPhone no está configurado: faltan PAYPHONE_TOKEN o PAYPHONE_STORE_ID");
  }
  return { token, storeId };
};

const payphoneRequest = async (path: string, body: Record<string, unknown>) => {
  const { token } = getConfig();
  const response = await fetch(`${PAYPHONE_API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw };
  }
  if (!response.ok) {
    const details = Array.isArray(data?.errors)
      ? data.errors
        .map((item: any) => {
          const descriptions = Array.isArray(item?.errorDescriptions)
            ? item.errorDescriptions.join(", ")
            : "";
          return [item?.message, descriptions].filter(Boolean).join(": ");
        })
        .filter(Boolean)
        .join(" | ")
      : "";
    throw new Error(
      [
        data?.message,
        data?.error,
        data?.errorCode ? `Código ${data.errorCode}` : "",
        details,
        `HTTP ${response.status}`,
      ]
        .filter(Boolean)
        .join(" - ")
    );
  }
  return data;
};

const createPayphonePayment = async ({
  amount,
  clientTransactionId,
  reference,
  responseUrl,
  cancellationUrl,
}: {
  amount: number;
  clientTransactionId: string;
  reference: string;
  responseUrl: string;
  cancellationUrl: string;
}) => {
  const { storeId } = getConfig();
  const amountInCents = Math.round(amount * 100);
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw new Error("El monto de PayPhone debe ser mayor que cero");
  }
  if (amountInCents > 99999999) {
    throw new Error("El monto de PayPhone supera el límite permitido");
  }

  return payphoneRequest("/button/Prepare", {
    amount: amountInCents,
    amountWithoutTax: amountInCents,
    amountWithTax: 0,
    tax: 0,
    service: 0,
    tip: 0,
    clientTransactionId,
    reference,
    storeId,
    currency: "USD",
    responseUrl,
    cancellationUrl,
  });
};

const confirmPayphonePayment = ({
  id,
  clientTransactionId,
}: {
  id: string;
  clientTransactionId: string;
}) => payphoneRequest("/button/Confirm", { id, clientTransactionId });

module.exports = { createPayphonePayment, confirmPayphonePayment };
