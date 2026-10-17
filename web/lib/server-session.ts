import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "turesma_session";

export type SessionClaims = {
  id: number;
  email: string;
  rol: string;
  exp: number;
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") return null;
  return "turesma_secret_key_2026_seguro";
};

export const verifySessionToken = (token: string): SessionClaims | null => {
  const secret = getJwtSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (header.alg !== "HS256") return null;

    const signature = Buffer.from(parts[2], "base64url");
    const expectedSignature = createHmac("sha256", secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    if (
      signature.length !== expectedSignature.length ||
      !timingSafeEqual(signature, expectedSignature)
    ) {
      return null;
    }

    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (
      !Number.isInteger(claims.id) ||
      typeof claims.email !== "string" ||
      typeof claims.rol !== "string" ||
      typeof claims.exp !== "number" ||
      Date.now() >= claims.exp * 1000
    ) {
      return null;
    }

    return claims as SessionClaims;
  } catch {
    return null;
  }
};

export const getPortalPath = (role: string) => {
  const normalizedRole = role.toLowerCase();
  if (normalizedRole === "conductor" || normalizedRole === "vehiculo") return "/vehiculo";
  if (normalizedRole === "gerente_operativo" || normalizedRole === "admin" || normalizedRole === "operativo") {
    return "/admin";
  }
  if (normalizedRole === "cliente") return "/cliente";
  return null;
};
