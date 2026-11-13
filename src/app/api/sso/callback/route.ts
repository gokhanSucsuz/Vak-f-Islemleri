import { NextResponse } from "next/server";
import { verifyPanelJwt, signGateCookie } from "@/lib/ssoGate";

function getPublicOrigin(req: Request, url: URL): string {
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/+$/, "");
  }
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const publicOrigin = getPublicOrigin(req, url);
  const secret = process.env.PANEL_SSO_SECRET;

  if (!secret) {
    return NextResponse.redirect(`${publicOrigin}/login`);
  }

  const token = url.searchParams.get("token");
  const panelUrl = process.env.PANEL_URL || "https://www.vakifyonetim.space";

  if (!token) {
    return NextResponse.redirect(panelUrl);
  }

  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const payload = await verifyPanelJwt(token, secret, hostHeader);

  if (!payload) {
    return NextResponse.redirect(`${panelUrl}/login?error=InvalidSsoToken`);
  }

  const email = (payload.email || payload.sub || "edirnesydv@gmail.com").toLowerCase();
  const gateValue = await signGateCookie(email, secret);
  const isProd = process.env.NODE_ENV === "production";

  const res = NextResponse.redirect(`${publicOrigin}/login`);
  res.cookies.set("vakif_panel_gate", gateValue, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });

  return res;
}
