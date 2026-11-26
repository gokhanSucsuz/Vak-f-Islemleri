import crypto from "crypto";
import zlib from "zlib";
import { NextResponse } from "next/server";

const SHIELD_SECRET_FALLBACK = "vakif-shield-session-default-secret-2026";

function getServerShieldMasterSecret(): string {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.DATA_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY ||
    SHIELD_SECRET_FALLBACK
  ).trim();
}

/**
 * Oturum açmış kullanıcıya özel (userId + sunucu sırrı) 256-bit AES-GCM oturum anahtarı türetir.
 * Donanım hızlandırmalı (AES-NI) olduğu için şifreleme/çözme <1ms sürer.
 */
export function deriveUserShieldKey(userId: string): Buffer {
  return crypto
    .createHmac("sha256", getServerShieldMasterSecret())
    .update(`vakif-media-shield-v1:${String(userId)}`)
    .digest();
}

/**
 * JSON verisini isteğe bağlı Gzip ile sıkıştırıp AES-256-GCM ile şifreler.
 * Çıktı formatı (base64): [12 byte IV][Şifreli Veri][16 byte GCM AuthTag]
 * Açık metin ilk byte: 0x01 = gzip sıkıştırmalı UTF-8 JSON, 0x00 = ham UTF-8 JSON
 */
export function encryptShieldPayload(userId: string, data: unknown): { s: 1; p: string } {
  const key = deriveUserShieldKey(userId);
  const jsonBytes = Buffer.from(JSON.stringify(data), "utf8");

  let framedPlain: Buffer;
  if (jsonBytes.length >= 1024) {
    const gz = zlib.gzipSync(jsonBytes, { level: 6 });
    framedPlain = Buffer.allocUnsafe(1 + gz.length);
    framedPlain[0] = 1;
    gz.copy(framedPlain, 1);
  } else {
    framedPlain = Buffer.allocUnsafe(1 + jsonBytes.length);
    framedPlain[0] = 0;
    jsonBytes.copy(framedPlain, 1);
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(framedPlain), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 byte (WebCrypto AES-GCM ciphertext sonuna ekli bekler)

  const combined = Buffer.concat([iv, encrypted, authTag]);
  return {
    s: 1,
    p: combined.toString("base64"),
  };
}

/**
 * İstemciden gelen şifreli { s: 1, p: "..." } gövdesini çözer; düz JSON gelmişse olduğu gibi döner.
 */
export function decryptShieldPayload<T = any>(userId: string, rawBody: any): T {
  if (!rawBody || typeof rawBody !== "object" || rawBody.s !== 1 || typeof rawBody.p !== "string") {
    return rawBody as T;
  }

  const key = deriveUserShieldKey(userId);
  const combined = Buffer.from(rawBody.p, "base64");
  if (combined.length < 29) {
    throw new Error("Geçersiz şifreli veri paketi.");
  }

  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(12, combined.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const framedPlain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  const mode = framedPlain[0];
  const payloadBytes = framedPlain.subarray(1);
  const utf8Json =
    mode === 1
      ? zlib.gunzipSync(payloadBytes).toString("utf8")
      : payloadBytes.toString("utf8");

  return JSON.parse(utf8Json) as T;
}

export async function parseShieldedRequestJson<T = any>(
  req: Request,
  userId: string
): Promise<T> {
  const raw = await req.json();
  return decryptShieldPayload<T>(userId, raw);
}

/**
 * İstemci `x-vakif-shield: 1` başlığı gönderdiyse yanıtı AES-256-GCM şifreli paket olarak döner;
 * aksi halde standart JSON döner.
 */
export function respondShieldedJson(
  req: Request,
  userId: string,
  data: unknown,
  status = 200
): NextResponse {
  const wantsShield = req.headers.get("x-vakif-shield") === "1" && Boolean(userId);
  const body = wantsShield ? encryptShieldPayload(userId, data) : data;

  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
    },
  });
}
