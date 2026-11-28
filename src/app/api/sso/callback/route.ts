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
  if (!token) {
    return NextResponse.redirect(`${publicOrigin}/yetkisiz-erisim`);
  }

  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const payload = await verifyPanelJwt(token, secret, hostHeader);

  if (!payload) {
    return NextResponse.redirect(`${publicOrigin}/yetkisiz-erisim`);
  }

  const email = (payload.email || payload.sub || "edirnesydv@gmail.com").toLowerCase();
  const { cookieValue, maxAge } = await signGateCookie(
    {
      email,
      uid: payload.uid,
      username: payload.username,
      sid: payload.sid,
      tv: payload.tv,
      sessionExp: payload.sessionExp,
      mode: payload.mode,
    },
    secret
  );
  const isProd = process.env.NODE_ENV === "production";

  const res = NextResponse.redirect(`${publicOrigin}/login`);
  res.cookies.set("vakif_panel_gate", cookieValue, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return res;
}
