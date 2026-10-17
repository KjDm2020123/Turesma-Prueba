import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "../../../../lib/server-session";

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud de inicio de sesión inválida" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "No se pudo conectar con el servicio de autenticación" }, { status: 502 });
  }

  let data: Record<string, unknown>;
  try {
    data = await upstream.json();
  } catch {
    return NextResponse.json({ error: "El servicio de autenticación devolvió una respuesta inválida" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  const token = typeof data.token === "string" ? data.token : "";
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) {
    return NextResponse.json(
      { error: "No fue posible validar la sesión. Verifica que JWT_SECRET coincida en frontend y backend." },
      { status: 502 },
    );
  }

  const response = NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(claims.exp * 1000),
  });
  return response;
}
