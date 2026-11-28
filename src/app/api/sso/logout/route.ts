import { NextResponse } from "next/server";
import { clearAllAuthCookies, handleSloWebhookRequest } from "@/lib/ssoGate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const result = await handleSloWebhookRequest(req, process.env.PANEL_SSO_SECRET);
  return NextResponse.json({ ok: result.ok }, { status: result.status });
}

export async function GET() {
  const res = NextResponse.json({ ok: true });
  return clearAllAuthCookies(res);
}
