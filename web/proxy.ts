import { NextRequest, NextResponse } from "next/server";
import { getPortalPath, getVerifiedSession, SESSION_COOKIE } from "./lib/server-session";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let session;
  try {
    session = token ? await getVerifiedSession(token) : null;
  } catch (error) {
    console.error("No se pudo verificar la sesión con el backend:", error);
    return NextResponse.json(
      { error: "El servicio de autenticación no está disponible. Inténtalo de nuevo." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const requestedPortal = `/${request.nextUrl.pathname.split("/")[1]}`;

  if (!session) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  const userPortal = getPortalPath(session.rol);
  const allowed = userPortal === requestedPortal;

  if (!allowed) {
    return NextResponse.redirect(new URL(userPortal || "/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/cliente/:path*", "/vehiculo/:path*"],
};
