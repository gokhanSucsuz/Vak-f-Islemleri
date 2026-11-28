import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clearAllAuthCookies, verifyGateCookie } from "@/lib/ssoGate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ssoSecret = process.env.PANEL_SSO_SECRET;
  if (!ssoSecret) {
    return NextResponse.json({ valid: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const gateCookie = req.cookies.get("vakif_panel_gate")?.value;
  const valid = gateCookie ? await verifyGateCookie(gateCookie, ssoSecret) : false;

  if (!valid) {
    const res = NextResponse.json(
      { valid: false, redirectTo: "/yetkisiz-erisim" },
      { headers: { "Cache-Control": "no-store" } }
    );
    return clearAllAuthCookies(res);
  }

  return NextResponse.json({ valid: true }, { headers: { "Cache-Control": "no-store" } });
}
