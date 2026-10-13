"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredUser, getRolePath, getStoredToken, getStoredUser, isTokenExpired, normalizeRole, refreshStoredUser, SessionUser } from "./session";

export function useAdminGuard() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const currentUser = getStoredUser();
      // Sin usuario, sin token, o token expirado → cerrar sesión y volver al login.
      if (!currentUser || !getStoredToken() || isTokenExpired()) {
        clearStoredUser();
        router.replace("/");
        return;
      }

      const verifiedUser = await refreshStoredUser();
      if (!verifiedUser) {
        clearStoredUser();
        router.replace("/");
        return;
      }

      const role = normalizeRole(verifiedUser.rol);
      if (role !== "admin" && role !== "operativo") {
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
