import type { NextResponse } from "next/server";

const encoder = new TextEncoder();

type SsoRuntimeState = {
  usedJtis: Map<string, number>;
  revokedSessions: Map<string, number>;
  revokedUsers: Map<string, { minTv: number; revokedAt: number }>;
  globalRevokedAtSec: number;
  verifyCache: Map<string, { valid: boolean; checkedAt: number; exp?: number }>;
};

const globalRef = globalThis as unknown as { __vakifSsoState?: SsoRuntimeState };

function getSsoState(): SsoRuntimeState {
  if (!globalRef.__vakifSsoState) {
    globalRef.__vakifSsoState = {
      usedJtis: new Map(),
      revokedSessions: new Map(),
      revokedUsers: new Map(),
      globalRevokedAtSec: 0,
      verifyCache: new Map(),
    };
  }
  return globalRef.__vakifSsoState;
}

function pruneMaps(state: SsoRuntimeState) {
  const now = Date.now();
  if (state.usedJtis.size > 2000) {
    for (const [k, exp] of state.usedJtis) {
      if (now > exp) state.usedJtis.delete(k);
    }
  }
  if (state.revokedSessions.size > 5000) {
    for (const [k, exp] of state.revokedSessions) {
      if (now > exp) state.revokedSessions.delete(k);
    }
  }
  if (state.verifyCache.size > 5000) {
    for (const [k, v] of state.verifyCache) {
      if (now - v.checkedAt > 120_000) state.verifyCache.delete(k);
    }
  }
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padded =
    base64Url.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((base64Url.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function constantTimeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function computeHmacHex(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

function normalizeHost(h?: string): string {
  return (h || "").trim().toLowerCase().replace(/^www\./, "");
}

export function resolvePanelVerifyOrigin(): string {
  const raw = (
    process.env.PANEL_INTERNAL_URL ||
    process.env.PANEL_URL ||
    process.env.VAKIFPANEL_URL ||
    "https://www.vakifyonetim.space"
  )
    .trim()
    .replace(/\/+$/, "");
  if (raw === "https://vakifyonetim.space") {
    return "https://www.vakifyonetim.space";
  }
  return raw;
}

export type PanelLaunchClaims = {
  iss?: string;
  sub?: string;
  aud?: string;
  exp?: number;
  email?: string;
  jti?: string;
  uid?: string;
  username?: string;
  sid?: string;
  tv?: number;
  sessionExp?: number;
  mode?: string;
};

export async function verifyPanelJwt(
  token: string,
  secret: string,
  expectedHost?: string
): Promise<PanelLaunchClaims | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const key = await importHmacKey(secret);
    const signingInput = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlToUint8Array(sigB64);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature.buffer as ArrayBuffer,
      signingInput
    );
    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlToUint8Array(payloadB64));
    const payload = JSON.parse(payloadJson) as PanelLaunchClaims;

    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return null;
    if (payload.iss !== "vakifpanel") return null;

    const allowedEmail = (
      process.env.PANEL_ALLOWED_EMAIL || "edirnesydv@gmail.com"
    ).toLowerCase();
    const tokenEmail = (payload.email || payload.sub || "").toLowerCase();
    if (tokenEmail !== allowedEmail) return null;

    if (
      expectedHost &&
      payload.aud &&
      normalizeHost(payload.aud) !== normalizeHost(expectedHost)
    ) {
      return null;
    }

    const state = getSsoState();
    pruneMaps(state);
    if (payload.jti) {
      const existingExp = state.usedJtis.get(payload.jti);
      if (existingExp && existingExp > Date.now()) {
        return null; // Tek kullanımlık token tekrar kullanılamaz (Replay koruması)
      }
      state.usedJtis.set(payload.jti, Date.now() + 20 * 60_000);
    }

    return payload;
  } catch {
    return null;
  }
}

export async function signGateCookie(
  claims: {
    email: string;
    uid?: string;
    username?: string;
    sid?: string;
    tv?: number;
    sessionExp?: number;
    mode?: string;
  },
  secret: string
): Promise<{ cookieValue: string; maxAge: number }> {
  const now = Math.floor(Date.now() / 1000);
  const isDevice = claims.mode === "device";
  const defaultExp = now + (isDevice ? 90 * 24 * 60 * 60 : 8 * 60 * 60);
  const exp =
    !isDevice && claims.sessionExp && claims.sessionExp > now
      ? Math.min(claims.sessionExp, now + 48 * 3600)
      : defaultExp;

  const header = uint8ArrayToBase64Url(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  );
  const payload = uint8ArrayToBase64Url(
    encoder.encode(
      JSON.stringify({
        iss: "vakifpanel-gate",
        sub: claims.email.toLowerCase(),
        uid: claims.uid || "",
        username: claims.username || "",
        sid: claims.sid || "",
        tv: claims.tv || 1,
        mode: isDevice ? "device" : "sso",
        iat: now,
        exp,
      })
    )
  );
  const key = await importHmacKey(secret);
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${header}.${payload}`)
  );
  const sig = uint8ArrayToBase64Url(new Uint8Array(sigBuf));
  return {
    cookieValue: `${header}.${payload}.${sig}`,
    maxAge: Math.max(60, exp - now),
  };
}

async function verifySessionWithPanel(
  params: { uid: string; sid: string; tv: number; mode: string },
  secret: string
): Promise<{ valid: boolean; exp?: number } | null> {
  const state = getSsoState();
  const cacheKey = params.mode === "device" ? "device:admin" : params.sid;
  const cached = state.verifyCache.get(cacheKey);
  const nowMs = Date.now();

  if (cached) {
    const ttl = cached.valid ? 4_000 : 60_000;
    if (nowMs - cached.checkedAt < ttl) {
      return cached;
    }
  }

  const rawBody = JSON.stringify(params);
  const timestamp = String(Math.floor(nowMs / 1000));
  const signature = await computeHmacHex(secret, `${timestamp}.${rawBody}`);
  const origin = resolvePanelVerifyOrigin();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1800);
  try {
    const res = await fetch(`${origin}/api/sso/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Panel-Verify-Timestamp": timestamp,
        "X-Panel-Verify-Signature": signature,
      },
      body: rawBody,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (res.status === 200) {
      const data = (await res.json()) as { valid?: boolean; exp?: number };
      const valid = Boolean(data.valid);
      const entry = { valid, checkedAt: Date.now(), exp: data.exp };
      state.verifyCache.set(cacheKey, entry);
      if (!valid && params.sid) {
        state.revokedSessions.set(params.sid, Date.now() + 48 * 3600_000);
      }
      return entry;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyGateCookie(
  cookieVal: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = cookieVal.split(".");
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, sigB64] = parts;
    const key = await importHmacKey(secret);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToUint8Array(sigB64).buffer as ArrayBuffer,
      encoder.encode(`${headerB64}.${payloadB64}`)
    );
    if (!isValid) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToUint8Array(payloadB64))
    ) as {
      iss?: string;
      sub?: string;
      uid?: string;
      sid?: string;
      tv?: number;
      mode?: string;
      iat?: number;
      exp?: number;
    };

    const now = Math.floor(Date.now() / 1000);
    const allowedEmail = (
      process.env.PANEL_ALLOWED_EMAIL || "edirnesydv@gmail.com"
    ).toLowerCase();

    if (
      payload.iss !== "vakifpanel-gate" ||
      !payload.exp ||
      payload.exp <= now ||
      (payload.sub || "").toLowerCase() !== allowedEmail
    ) {
      return false;
    }

    const state = getSsoState();
    if (state.globalRevokedAtSec && (payload.iat || 0) <= state.globalRevokedAtSec) {
      return false;
    }

    if (payload.mode === "device") {
      const remote = await verifySessionWithPanel(
        { uid: "", sid: "", tv: 1, mode: "device" },
        secret
      );
      return remote ? remote.valid : true;
    }

    if (!payload.uid || !payload.sid) {
      return false;
    }

    if (state.revokedSessions.has(payload.sid)) {
      return false;
    }

    const revUser = state.revokedUsers.get(payload.uid);
    if (revUser && (payload.tv || 1) < revUser.minTv) {
      return false;
    }

    const remote = await verifySessionWithPanel(
      {
        uid: payload.uid,
        sid: payload.sid,
        tv: payload.tv || 1,
        mode: "sso",
      },
      secret
    );

    if (remote) {
      if (!remote.valid) return false;
      if (remote.exp && remote.exp <= now) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function handleSloWebhookRequest(
  req: Request,
  secret: string | undefined
): Promise<{ ok: boolean; status: number }> {
  if (!secret) return { ok: false, status: 500 };

  const rawBody = await req.text();
  const timestamp = req.headers.get("x-panel-slo-timestamp");
  const signature = req.headers.get("x-panel-slo-signature");
  if (!timestamp || !signature) return { ok: false, status: 401 };

  const tsNum = Number(timestamp);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > 90) {
    return { ok: false, status: 401 };
  }

  const expectedHex = await computeHmacHex(secret, `${timestamp}.${rawBody}`);
  if (!constantTimeEqualStr(expectedHex, signature.toLowerCase())) {
    return { ok: false, status: 401 };
  }

  try {
    const body = JSON.parse(rawBody) as {
      action?: "USER_LOGOUT" | "GLOBAL_LOGOUT";
      uid?: string;
      sid?: string;
      tv?: number;
      issuedAt?: number;
    };

    const state = getSsoState();
    pruneMaps(state);

    if (body.action === "GLOBAL_LOGOUT") {
      state.globalRevokedAtSec = Math.max(
        state.globalRevokedAtSec,
        body.issuedAt || nowSec
      );
      state.verifyCache.clear();
    } else {
      if (body.sid) {
        state.revokedSessions.set(body.sid, Date.now() + 48 * 3600_000);
        state.verifyCache.set(body.sid, { valid: false, checkedAt: Date.now() });
      }
      if (body.uid) {
        state.revokedUsers.set(body.uid, {
          minTv: Number(body.tv || 2),
          revokedAt: Date.now(),
        });
      }
    }

    return { ok: true, status: 200 };
  } catch {
    return { ok: false, status: 400 };
  }
}

export function clearAllAuthCookies(
  res: NextResponse,
  extraCookies: string[] = []
): NextResponse {
  const isProd = process.env.NODE_ENV === "production";
  const cookieNames = new Set([
    "vakif_panel_gate",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
    ...extraCookies,
  ]);

  for (const name of cookieNames) {
    res.cookies.set(name, "", {
      httpOnly: true,
      secure: isProd || name.startsWith("__Secure-") || name.startsWith("__Host-"),
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}
