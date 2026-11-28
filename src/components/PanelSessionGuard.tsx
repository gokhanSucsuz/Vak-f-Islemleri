"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function PanelSessionGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/yetkisiz-erisim") {
      try {
        sessionStorage.clear();
      } catch {
        // ignore
      }
      return;
    }

    let cancelled = false;
    let checking = false;

    const redirectUnauthorized = () => {
      if (cancelled) return;
      cancelled = true;
      try {
        sessionStorage.clear();
      } catch {
        // ignore
      }
      window.location.replace("/yetkisiz-erisim");
    };

    const verifyStatus = async () => {
      if (cancelled || checking) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      checking = true;
      try {
        const res = await fetch("/api/sso/status", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.valid === false) {
            redirectUnauthorized();
          }
        } else if (res.status === 401 || res.status === 403) {
          redirectUnauthorized();
        }
      } catch {
        // ignore transient network error
      } finally {
        checking = false;
      }
    };

    verifyStatus();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        verifyStatus();
      }
    }, 6000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        verifyStatus();
      }
    };

    window.addEventListener("focus", verifyStatus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", verifyStatus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);

  return null;
}
