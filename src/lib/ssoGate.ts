const encoder = new TextEncoder();

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((base64Url.length + 3) % 4);
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

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function verifyPanelJwt(token: string, secret: string, expectedHost?: string) {
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
  const payload = JSON.parse(payloadJson) as {
    iss?: string;
    sub?: string;
    aud?: string;
    exp?: number;
    email?: string;
    jti?: string;
  };

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) return null;
  if (payload.iss !== "vakifpanel") return null;

  const allowedEmail = (process.env.PANEL_ALLOWED_EMAIL || "edirnesydv@gmail.com").toLowerCase();
  const tokenEmail = (payload.email || payload.sub || "").toLowerCase();
  if (tokenEmail !== allowedEmail) return null;

  if (expectedHost && payload.aud && payload.aud !== expectedHost) {
    return null;
  }

  return payload;
}

export async function signGateCookie(email: string, secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 8 * 60 * 60; // 8 saat
  const header = uint8ArrayToBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = uint8ArrayToBase64Url(
    encoder.encode(JSON.stringify({ iss: "vakifpanel-gate", sub: email, exp }))
  );
  const key = await importHmacKey(secret);
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payload}`));
  const sig = uint8ArrayToBase64Url(new Uint8Array(sigBuf));
  return `${header}.${payload}.${sig}`;
}

export async function verifyGateCookie(cookieVal: string, secret: string): Promise<boolean> {
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

  const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(payloadB64))) as {
    iss?: string;
    sub?: string;
    exp?: number;
  };

  const now = Math.floor(Date.now() / 1000);
  const allowedEmail = (process.env.PANEL_ALLOWED_EMAIL || "edirnesydv@gmail.com").toLowerCase();
  return (
    payload.iss === "vakifpanel-gate" &&
    Boolean(payload.exp && payload.exp > now) &&
    (payload.sub || "").toLowerCase() === allowedEmail
  );
}

