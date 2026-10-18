"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredUser, getRolePath, getStoredToken, getStoredUser, isTokenExpired, normalizeRole, refreshStoredUser, SessionUser } from "./session";

export function useClienteGuard() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const currentUser = getStoredUser();
      // Sin usuario, sin token, o token expirado → cerrar sesión y volver al login.
      if (!currentUser || !getStoredToken() || isTokenExpired()) {
        clearStoredUser();
        window.location.replace("/api/auth/logout");
        return;
      }

      const verifiedUser = await refreshStoredUser();
      if (!verifiedUser) {
        clearStoredUser();
        window.location.replace("/api/auth/logout");
        return;
      }

      const role = normalizeRole(verifiedUser.rol);
      if (role !== "cliente") {
        router.replace(getRolePath(role));
        return;
      }

      setUser(verifiedUser);
      setCheckingSession(false);
    };

    checkSession();
    window.addEventListener("pageshow", checkSession);

    return () => {
      window.removeEventListener("pageshow", checkSession);
    };
  }, [router]);

  return { user, checkingSession };
}
