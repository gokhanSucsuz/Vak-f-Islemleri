import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clearAllAuthCookies, verifyGateCookie } from "@/lib/ssoGate";

const authMiddleware = withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname;
    const role = req.nextauth.token?.role;

    if (
      (path.startsWith("/dashboard/users") || path.startsWith("/dashboard/logs")) &&
      role !== "superadmin"
    ) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    if (path.startsWith("/dashboard/settings") && role === "manager") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token?.role && !!token?.id,
    },
  }
);

const PROTECTED_APP_PATHS = [
  "/dashboard",
  "/api/transactions",
  "/api/baby-food",
  "/api/in-kind-aid",
  "/api/petitions",
  "/api/presentations",
  "/api/application-files",
  "/api/logs",
  "/api/admin",
];

export default async function middleware(req: NextRequest, event: any) {
  const { pathname } = req.nextUrl;
  const ssoSecret = process.env.PANEL_SSO_SECRET;

  // PANEL_SSO_SECRET tanımlıysa doğrudan URL erişimini ve süresi bitmiş/çıkış yapılmış panel oturumlarını engelle
  if (ssoSecret) {
    const gateCookie = req.cookies.get("vakif_panel_gate")?.value;
    const isGateValid = gateCookie ? await verifyGateCookie(gateCookie, ssoSecret) : false;

    if (!isGateValid) {
      if (pathname.startsWith("/api/")) {
        const apiRes = NextResponse.json(
          {
            error: "Merkezi Panel oturumunuz sonlandırıldı veya doğrudan erişim engellendi.",
            code: "PANEL_SESSION_ENDED",
            redirectTo: "/yetkisiz-erisim",
          },
          { status: 403 }
        );
        return clearAllAuthCookies(apiRes);
      }
      const proto = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
      const baseOrigin =
        process.env.NEXTAUTH_URL?.replace(/\/+$/, "") ||
        (host ? `${proto}://${host}` : req.nextUrl.origin);
      const redirectRes = NextResponse.redirect(`${baseOrigin}/yetkisiz-erisim`);
      return clearAllAuthCookies(redirectRes);
    }
  }

  const requiresAuth = PROTECTED_APP_PATHS.some((prefix) => pathname.startsWith(prefix));
  if (requiresAuth) {
    return (authMiddleware as any)(req, event);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo-sydv.jpg|logo-vakif.jpg|api/sso/callback|api/sso/logout|api/sso/status|yetkisiz-erisim).*)",
  ],
};
