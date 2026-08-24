"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredUser, getRolePath, getStoredToken, getStoredUser, isTokenExpired, normalizeRole, SessionUser } from "./session";

export function useClienteGuard() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const checkSession = () => {
      const currentUser = getStoredUser();
      // Sin usuario, sin token, o token expirado → cerrar sesión y volver al login.
      if (!currentUser || !getStoredToken() || isTokenExpired()) {
        clearStoredUser();
        router.replace("/");
        return;
      }

      const role = normalizeRole(currentUser.rol);
      if (role !== "cliente") {
        router.replace(getRolePath(role));
        return;
      }

      setUser(currentUser);
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
