import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyGateCookie } from "@/lib/ssoGate";

const authMiddleware = withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname;
    const role = req.nextauth.token?.role;

    if (path.startsWith("/dashboard/users") && role !== "superadmin") {
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
];

export default async function middleware(req: NextRequest, event: any) {
  const { pathname } = req.nextUrl;
  const ssoSecret = process.env.PANEL_SSO_SECRET;

  // Eğer PANEL_SSO_SECRET tanımlıysa doğrudan URL erişimini engelle, sadece VakıfPanel SSO kapısından geçenlere izin ver
  if (ssoSecret) {
    const gateCookie = req.cookies.get("vakif_panel_gate")?.value;
    const isGateValid = gateCookie ? await verifyGateCookie(gateCookie, ssoSecret) : false;

    if (!isGateValid) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Doğrudan erişim engellendi. Lütfen VakıfPanel üzerinden giriş yapın." },
          { status: 403 }
        );
      }
      const panelUrl = process.env.PANEL_URL || "https://www.vakifyonetim.space";
      return NextResponse.redirect(panelUrl);
    }
  }

  const requiresAuth = PROTECTED_APP_PATHS.some((prefix) => pathname.startsWith(prefix));
  if (requiresAuth) {
    return (authMiddleware as any)(req, event);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/sso/callback|api/auth).*)"],
};
