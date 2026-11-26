import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { deriveUserShieldKey } from "@/lib/payloadShield";

/**
 * Yetkili oturum için tek kullanımlık maskelenmiş 256-bit oturum anahtarı el sıkışması.
 * Tarayıcı bu anahtarı `extractable: false` olarak WebCrypto içine alır ve ham byte dizisini sıfırlar.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = String((session?.user as any)?.id || "");
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }

  const key = deriveUserShieldKey(userId); // 32 byte
  const mask = crypto.randomBytes(32); // Her yanıtta rastgele tek kullanımlık XOR maskesi
  const masked = Buffer.allocUnsafe(32);
  for (let i = 0; i < 32; i++) {
    masked[i] = key[i] ^ mask[i];
  }

  const out = Buffer.concat([mask, masked]); // 64 byte ikili akış
  return new NextResponse(new Uint8Array(out), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
    },
  });
}
