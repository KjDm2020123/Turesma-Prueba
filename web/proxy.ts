import { NextRequest, NextResponse } from "next/server";
import { getPortalPath, SESSION_COOKIE, verifySessionToken } from "./lib/server-session";

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? verifySessionToken(token) : null;
  const requestedPortal = `/${request.nextUrl.pathname.split("/")[1]}`;

  if (!claims) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  const userPortal = getPortalPath(claims.rol);
  const allowed = userPortal === requestedPortal;

  if (!allowed) {
    return NextResponse.redirect(new URL(userPortal || "/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/cliente/:path*", "/vehiculo/:path*"],
};
