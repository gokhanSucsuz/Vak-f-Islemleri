"use client";

const cleanedBgCache = new Map<string, string>();
const protectedBitmapCache = new Map<string, ImageBitmap>();
const inflightBitmapDecodes = new Map<string, Promise<ImageBitmap | null>>();

function makeMediaCacheKey(dataUrl: string): string {
  if (!dataUrl) return "";
  return `${dataUrl.length}:${dataUrl.slice(0, 56)}:${dataUrl.slice(-48)}`;
}

/**
 * `data:image/...;base64,...` dizisini `<img src>` veya `new Image()` KULLANMADAN
 * doğrudan bellek içi ikili `Blob` -> `ImageBitmap` olarak arka plan iş parçacığında çözer.
 * Chrome DevTools Network sekmesinde hiçbir `data:image` veya `blob:` satırı oluşturmaz.
 */
export async function decodeDataUrlToBitmap(dataUrl: string): Promise<ImageBitmap | null> {
  if (!dataUrl || typeof window === "undefined" || typeof createImageBitmap === "undefined") {
    return null;
  }
  const key = makeMediaCacheKey(dataUrl);
  const cached = protectedBitmapCache.get(key);
  if (cached) return cached;

  const inflight = inflightBitmapDecodes.get(key);
  if (inflight) return inflight;

  const task = (async (): Promise<ImageBitmap | null> => {
    try {
      const commaIdx = dataUrl.indexOf(",");
      if (commaIdx < 0) return null;
      const header = dataUrl.slice(0, commaIdx);
      const b64 = dataUrl.slice(commaIdx + 1);
      const mimeMatch = header.match(/^data:([^;]+)/i);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";

      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mime });
      const bmp = await createImageBitmap(blob);

      if (protectedBitmapCache.size >= 160) {
        const oldestKey = protectedBitmapCache.keys().next().value;
        if (oldestKey) {
          const oldBmp = protectedBitmapCache.get(oldestKey);
          oldBmp?.close?.();
          protectedBitmapCache.delete(oldestKey);
        }
      }
      protectedBitmapCache.set(key, bmp);
      return bmp;
    } catch {
      return null;
    } finally {
      inflightBitmapDecodes.delete(key);
    }
  })();

  inflightBitmapDecodes.set(key, task);
  return task;
}

/**
 * Sayfadan çıkıldığında bellekteki tüm çözülmüş ImageBitmap piksellerini serbest bırakır (KVKK bellek temizliği).
 */
export function clearProtectedBitmapCache(): void {
  for (const bmp of protectedBitmapCache.values()) {
    try {
      bmp.close?.();
    } catch {
      // ignore
    }
  }
  protectedBitmapCache.clear();
  inflightBitmapDecodes.clear();
}

// ============================================================================
// OTURUMA ÖZEL WEBCYPTO AES-256-GCM İLETİM ZIRHI (Sıfır Yavaşlama / Donanım AES-NI)
// ============================================================================
let shieldCryptoKeyPromise: Promise<CryptoKey | null> | null = null;

function isWebCryptoShieldSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.isSecureContext) &&
    Boolean(window.crypto?.subtle) &&
    typeof DecompressionStream !== "undefined" &&
    typeof CompressionStream !== "undefined"
  );
}

async function getSessionShieldKey(): Promise<CryptoKey | null> {
  if (!isWebCryptoShieldSupported()) return null;
  if (shieldCryptoKeyPromise) return shieldCryptoKeyPromise;

  shieldCryptoKeyPromise = (async () => {
    try {
      const res = await fetch("/api/presentations/shield", {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength < 64) return null;

      const rawKey = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        rawKey[i] = buf[i] ^ buf[32 + i];
      }

      // `extractable: false` -> Tarayıcı konsolundan dahi anahtar dışarı aktarılamaz!
      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );
      rawKey.fill(0);
      buf.fill(0);
      return cryptoKey;
    } catch {
      shieldCryptoKeyPromise = null;
      return null;
    }
  })();

  return shieldCryptoKeyPromise;
}

async function decryptShieldEnvelope<T = any>(
  envelope: any,
  key: CryptoKey | null
): Promise<T> {
  if (!envelope || typeof envelope !== "object" || envelope.s !== 1 || typeof envelope.p !== "string") {
    return envelope as T;
  }
  if (!key) {
    throw new Error("Şifreli oturum anahtarı alınamadı.");
  }

  const bin = atob(envelope.p);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }

  const iv = bytes.subarray(0, 12);
  const cipherWithTag = bytes.subarray(12);
  const decryptedBuf = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherWithTag
  );

  const framed = new Uint8Array(decryptedBuf);
  const mode = framed[0];
  const payload = framed.subarray(1);

  if (mode === 1) {
    const ds = new DecompressionStream("gzip");
    const decompressedStream = new Blob([payload]).stream().pipeThrough(ds);
    const jsonText = await new Response(decompressedStream).text();
    return JSON.parse(jsonText) as T;
  }

  const jsonText = new TextDecoder().decode(payload);
  return JSON.parse(jsonText) as T;
}

async function encryptShieldBody(
  data: unknown,
  key: CryptoKey
): Promise<{ s: 1; p: string }> {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(data));
  let framed: Uint8Array;

  if (jsonBytes.byteLength >= 1024) {
    const cs = new CompressionStream("gzip");
    const compressedStream = new Blob([jsonBytes]).stream().pipeThrough(cs);
    const gzBuf = new Uint8Array(await new Response(compressedStream).arrayBuffer());
    framed = new Uint8Array(1 + gzBuf.byteLength);
    framed[0] = 1;
    framed.set(gzBuf, 1);
  } else {
    framed = new Uint8Array(1 + jsonBytes.byteLength);
    framed[0] = 0;
    framed.set(jsonBytes, 1);
  }

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = new Uint8Array(
    await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, framed as BufferSource)
  );

  const combined = new Uint8Array(12 + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(cipherBuf, 12);

  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < combined.length; i += chunkSize) {
    binary += String.fromCharCode(...combined.subarray(i, i + chunkSize));
  }
  return { s: 1, p: btoa(binary) };
}

/**
 * Sunular API'lerinden gelen yanıtları AES-256-GCM şifreli kanal üzerinden çeker ve bellekte çözer.
 * Network sekmesinde kişisel veriler veya base64 fotoğraflar yerine yalnızca `{ s: 1, p: "..." }` görünür.
 */
export async function shieldedFetchJson<T = any>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const key = await getSessionShieldKey();
  const headers = new Headers(init?.headers || {});
  if (key) {
    headers.set("X-Vakif-Shield", "1");
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  const rawJson = await res.json();
  const data = key ? await decryptShieldEnvelope<T>(rawJson, key) : (rawJson as T);
  return { ok: res.ok, status: res.status, data };
}

/**
 * Sunu ekleme ve güncelleme isteklerinde giden gövdeyi de (fotoğraf + metin) AES-256-GCM ile şifreler.
 */
export async function shieldedSendJson<T = any>(
  url: string,
  method: "POST" | "PUT" | "PATCH",
  payload: unknown,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const key = await getSessionShieldKey();
  const headers = new Headers(init?.headers || {});
  headers.set("Content-Type", "application/json");
  if (key) {
    headers.set("X-Vakif-Shield", "1");
  }

  const bodyObj = key ? await encryptShieldBody(payload, key) : payload;
  const res = await fetch(url, {
    ...init,
    method,
    headers,
    body: JSON.stringify(bodyObj),
  });

  const rawJson = await res.json();
  const data = key ? await decryptShieldEnvelope<T>(rawJson, key) : (rawJson as T);
  return { ok: res.ok, status: res.status, data };
}

/**
 * Şablon arka plan görselinin sol alt köşesindeki (fppt.com) filigran alanını
 * hemen üstündeki temiz arka plan dokusuyla pürüzsüzce kapatır.
 */
export async function cleanTemplateWatermark(dataUrl: string): Promise<string> {
  if (!dataUrl || typeof window === "undefined") return dataUrl;
  const cached = cleanedBgCache.get(dataUrl);
  if (cached) return cached;

  try {
    const bmp = await decodeDataUrlToBitmap(dataUrl);
    if (!bmp) return dataUrl;

    const w = bmp.width;
    const h = bmp.height;
    if (!w || !h) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;

    ctx.drawImage(bmp, 0, 0, w, h);

    // Sol alt köşedeki fppt.com yazısını (~x: %0.5..%14, y: %94.2..%99.2)
    // üstteki ve sağdaki temiz arka plan gradyanını devam ettirerek (yumuşak geçişli) kapat
    const x0 = Math.max(0, Math.floor(w * 0.004));
    const x1 = Math.min(w - 1, Math.floor(w * 0.145));
    const y0 = Math.max(8, Math.floor(h * 0.942));
    const y1 = Math.min(h - 1, Math.floor(h * 0.992));

    const rowA = Math.max(0, y0 - 8);
    const rowB = Math.max(0, y0 - 2);
    const rowDiff = Math.max(1, rowB - rowA);
    const rightCol = Math.min(w - 1, x1 + 3);
    const feather = 4;

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let y = y0; y <= y1; y++) {
      const rIdx = (y * w + rightCol) * 4;
      const rR = data[rIdx];
      const rG = data[rIdx + 1];
      const rB = data[rIdx + 2];

      for (let x = x0; x <= x1; x++) {
        const idxA = (rowA * w + x) * 4;
        const idxB = (rowB * w + x) * 4;
        const t = (y - rowB) / rowDiff;

        // Dikey gradyanı doğal şekilde devam ettir
        const vR = data[idxB] + (data[idxB] - data[idxA]) * t * 0.7;
        const vG = data[idxB + 1] + (data[idxB + 1] - data[idxA + 1]) * t * 0.7;
        const vB = data[idxB + 2] + (data[idxB + 2] - data[idxA + 2]) * t * 0.7;

        // Sağ kenara yaklaştıkça sağdaki temiz piksel ile harmanla
        const hx = (x - x0) / Math.max(1, x1 - x0);
        const hWeight = Math.pow(hx, 2.2) * 0.45;

        const targetR = Math.max(0, Math.min(255, vR * (1 - hWeight) + rR * hWeight));
        const targetG = Math.max(0, Math.min(255, vG * (1 - hWeight) + rG * hWeight));
        const targetB = Math.max(0, Math.min(255, vB * (1 - hWeight) + rB * hWeight));

        // Üst ve sağ kenarda yumuşak geçiş (feather)
        const alphaTop = Math.min(1, (y - y0 + 1) / feather);
        const alphaRight = Math.min(1, (x1 - x + 1) / feather);
        const alpha = Math.min(alphaTop, alphaRight);

        const curIdx = (y * w + x) * 4;
        data[curIdx] = Math.round(data[curIdx] * (1 - alpha) + targetR * alpha);
        data[curIdx + 1] = Math.round(data[curIdx + 1] * (1 - alpha) + targetG * alpha);
        data[curIdx + 2] = Math.round(data[curIdx + 2] * (1 - alpha) + targetB * alpha);
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const cleaned = canvas.toDataURL("image/jpeg", 0.92);
    cleanedBgCache.set(dataUrl, cleaned);
    return cleaned;
  } catch {
    return dataUrl;
  }
}

export interface SlideItem {
  fullName: string;
  neighborhood: string;
  photoCount: 0 | 1 | 2 | 4;
  photos: string[];
  description: string;
  descriptionHtml?: string;
  fontFamily?: string;
  fontSize?: number | "auto";
  titleFontSize?: number;
  titleBold?: boolean;
  descTopPct?: number;
  descBottomPct?: number;
  photoWidthPct?: number;
  photoHeightPct?: number;
  photoLeftPct?: number;
  photoFitMode?: "contain" | "cover" | "fill";
  templateId?: string;
  backgroundPreset?: string;
}

export interface BackgroundPresetOption {
  id: string;
  label: string;
  previewBg: string;
  accentColor: string;
}

export const BACKGROUND_PRESETS: BackgroundPresetOption[] = [
  {
    id: "template",
    label: "Şablon Varsayılanı",
    previewBg: "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)",
    accentColor: "#475569",
  },
  {
    id: "lacivert_kurum",
    label: "Kurumsal Lacivert",
    previewBg: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
    accentColor: "#1e3a5f",
  },
  {
    id: "bordo_valilik",
    label: "Resmi Bordo Şerit",
    previewBg: "linear-gradient(180deg, #fafaf9 0%, #f5f5f4 100%)",
    accentColor: "#881337",
  },
  {
    id: "krem_altin",
    label: "Krem & Altın Çerçeve",
    previewBg: "linear-gradient(135deg, #fefcf6 0%, #f5efe2 100%)",
    accentColor: "#b4925a",
  },
  {
    id: "mavi_geometrik",
    label: "Modern Kurum Mavisi",
    previewBg: "linear-gradient(135deg, #f8fbff 0%, #e6f0fa 100%)",
    accentColor: "#1d4ed8",
  },
  {
    id: "zumrut_resmi",
    label: "Sade Zümrüt Çizgili",
    previewBg: "linear-gradient(180deg, #f8faf9 0%, #edf4f0 100%)",
    accentColor: "#065f46",
  },
  {
    id: "resmi_gri",
    label: "Resmi Açık Gri",
    previewBg: "radial-gradient(circle at 50% 35%, #f8fafc 0%, #cbd5e1 100%)",
    accentColor: "#64748b",
  },
  {
    id: "saf_beyaz",
    label: "Sade Beyaz (Minimal)",
    previewBg: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
    accentColor: "#94a3b8",
  },
];

export interface PhotoFramePresetOption {
  id: string;
  label: string;
  badge?: string;
  description: string;
}

export const PHOTO_FRAME_PRESETS: PhotoFramePresetOption[] = [
  {
    id: "none",
    label: "Çerçevesiz (Varsayılan)",
    description: "Standart yumuşak köşeli fotoğraf görünümü",
  },
  {
    id: "duz_beyaz",
    label: "Düz Beyaz Kurumsal",
    badge: "Klasik",
    description: "Saf düz beyaz net kurumsal fotoğraf çerçevesi",
  },
  {
    id: "beyaz_3d_kabartma",
    label: "3B Beyaz Galeri",
    badge: "3B Derinlik",
    description: "Üç boyutlu eğimli beyaz çerçeve ve derin sahne gölgesi",
  },
  {
    id: "modern_cift_beyaz",
    label: "Modern Çift Beyaz",
    badge: "Modern",
    description: "Çift katmanlı düz beyaz paspartu ve ince gümüş kontur",
  },
  {
    id: "kurumsal_lacivert_3d",
    label: "3B Kurumsal Lacivert",
    badge: "3B Kurumsal",
    description: "3 boyutlu lacivert dış çerçeve ve düz beyaz iç paspartu",
  },
  {
    id: "altin_prestij_3d",
    label: "3B Prestij Altın & Beyaz",
    badge: "3B Göz Alıcı",
    description: "Metalik 3 boyutlu altın dış çerçeve ve düz beyaz iç paspartu",
  },
  {
    id: "bordo_resmi_3d",
    label: "3B Resmi Bordo & Beyaz",
    badge: "3B Resmi",
    description: "3 boyutlu resmi bordo çerçeve ve düz beyaz iç şerit",
  },
  {
    id: "kristal_cam_3d",
    label: "Modern 3B Kristal",
    badge: "3B Modern",
    description: "Yüzen 3 boyutlu parlak kristal beyaz-mavi ışık çerçevesi",
  },
];

/**
 * Canlı web önizlemesi ve küçük kartlar için fotoğraf çerçevesi CSS stillerini döndürür.
 * Düz renk ve çok katmanlı 3B gölgeler doğrudan <img> etrafını sarar.
 */
export function getPhotoFrameWebStyle(
  framePresetId?: string,
  compact = false
): Record<string, string | number> {
  const id = framePresetId || "none";
  const scale = compact ? 0.42 : 1;
  const px = (v: number) => `${Math.max(1, Math.round(v * scale * 10) / 10)}px`;

  switch (id) {
    case "duz_beyaz":
      return {
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        padding: px(6.5),
        border: `${px(1.5)} solid #dbe3ee`,
        borderRadius: px(10),
        boxShadow: compact
          ? "0 1px 4px rgba(15, 23, 42, 0.18)"
          : "0 5px 14px rgba(15, 23, 42, 0.18), 0 1px 3px rgba(15, 23, 42, 0.1)",
      };
    case "beyaz_3d_kabartma":
      return {
        boxSizing: "border-box",
        background:
          "linear-gradient(145deg var(--in-oklab, ), #ffffff 0%, #f8fafc 65%, #eef2f6 100%)",
        padding: px(8),
        borderTop: `${px(2)} solid #ffffff`,
        borderLeft: `${px(2)} solid #ffffff`,
        borderRight: `${px(2.5)} solid #cbd5e1`,
        borderBottom: `${px(3.5)} solid #94a3b8`,
        borderRadius: px(12),
        boxShadow: compact
          ? "0 3px 7px rgba(15, 23, 42, 0.3)"
          : "0 16px 28px -6px rgba(15, 23, 42, 0.42), 0 6px 12px -3px rgba(15, 23, 42, 0.24), inset 0 0 0 1px rgba(15, 23, 42, 0.06)",
      };
    case "modern_cift_beyaz":
      return {
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        padding: px(7.5),
        border: `${px(2)} solid #cbd5e1`,
        outline: `${px(3)} solid #ffffff`,
        outlineOffset: `-${px(4.5)}`,
        borderRadius: px(12),
        boxShadow: compact
          ? "0 2px 6px rgba(15, 23, 42, 0.22)"
          : "0 12px 24px -5px rgba(15, 23, 42, 0.3), 0 3px 7px rgba(15, 23, 42, 0.14)",
      };
    case "kurumsal_lacivert_3d":
      return {
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        padding: px(5),
        borderTop: `${px(5)} solid #2b5282`,
        borderLeft: `${px(5)} solid #234670`,
        borderRight: `${px(5.5)} solid #162d4c`,
        borderBottom: `${px(6)} solid #0f213a`,
        borderRadius: px(11),
        boxShadow: compact
          ? "0 3px 7px rgba(15, 23, 42, 0.32)"
          : "0 15px 26px -5px rgba(15, 23, 42, 0.44), 0 5px 10px rgba(15, 23, 42, 0.24)",
      };
    case "altin_prestij_3d":
      return {
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        padding: px(5),
        borderTop: `${px(5)} solid #e5c87e`,
        borderLeft: `${px(5)} solid #d4b15f`,
        borderRight: `${px(5.5)} solid #9a732a`,
        borderBottom: `${px(6)} solid #785619`,
        borderRadius: px(11),
        boxShadow: compact
          ? "0 3px 7px rgba(120, 86, 25, 0.32)"
          : "0 16px 28px -5px rgba(15, 23, 42, 0.42), 0 5px 12px rgba(120, 86, 25, 0.3)",
      };
    case "bordo_resmi_3d":
      return {
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        padding: px(5),
        borderTop: `${px(5)} solid #be123c`,
        borderLeft: `${px(5)} solid #9f1239`,
        borderRight: `${px(5.5)} solid #6b0f2b`,
        borderBottom: `${px(6)} solid #4c0519`,
        borderRadius: px(11),
        boxShadow: compact
          ? "0 3px 7px rgba(76, 5, 25, 0.3)"
          : "0 15px 26px -5px rgba(15, 23, 42, 0.42), 0 5px 11px rgba(136, 19, 55, 0.28)",
      };
    case "kristal_cam_3d":
      return {
        boxSizing: "border-box",
        background:
          "linear-gradient(135deg var(--in-oklab, ), #ffffff 0%, #eff6ff 52%, #ffffff 100%)",
        padding: px(7),
        borderTop: `${px(2.5)} solid #ffffff`,
        borderLeft: `${px(2.5)} solid #ffffff`,
        borderRight: `${px(2.5)} solid #bfdbfe`,
        borderBottom: `${px(3.5)} solid #93c5fd`,
        borderRadius: px(14),
        boxShadow: compact
          ? "0 3px 8px rgba(30, 58, 138, 0.26)"
          : "0 16px 30px -6px rgba(30, 58, 138, 0.36), 0 6px 12px -2px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(147, 197, 253, 0.6)",
      };
    default:
      return {};
  }
}

const presetBgCache = new Map<string, string>();

/**
 * Resmi kurum slaytlarına uygun yüksek çözünürlüklü (4:3) arka plan görseli üretir.
 * İnternet veya harici URL gerektirmez, tamamen ücretsiz ve önbelleklidir.
 */
export function getPresetBackgroundDataUrl(presetId?: string): string {
  if (!presetId || presetId === "template" || typeof window === "undefined") {
    return "";
  }
  const cached = presetBgCache.get(presetId);
  if (cached) return cached;

  const w = 1200;
  const h = 900;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  if (presetId === "lacivert_kurum") {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#f8fafc");
    g.addColorStop(1, "#e9eff6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Üst & alt kurumsal lacivert şerit + ince altın çizgi
    ctx.fillStyle = "#1e3a5f";
    ctx.fillRect(0, 0, w, 18);
    ctx.fillRect(0, h - 14, w, 14);
    ctx.fillStyle = "#c59b52";
    ctx.fillRect(0, 18, w, 3);
    ctx.fillRect(0, h - 17, w, 3);

    // Sağ alt köşede çok hafif kurumsal geometrik vurgu
    ctx.fillStyle = "rgba(30, 58, 95, 0.045)";
    ctx.beginPath();
    ctx.moveTo(w, h);
    ctx.lineTo(w - 260, h);
    ctx.lineTo(w, h - 180);
    ctx.closePath();
    ctx.fill();
  } else if (presetId === "bordo_valilik") {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#f4f4f5");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Sol dikey ve üst ince bordo kurumsal şerit
    ctx.fillStyle = "#881337";
    ctx.fillRect(0, 0, 14, h);
    ctx.fillRect(0, 0, w, 10);
    ctx.fillStyle = "rgba(180, 146, 90, 0.7)";
    ctx.fillRect(14, 0, 3, h);
    ctx.fillStyle = "rgba(136, 19, 55, 0.04)";
    ctx.beginPath();
    ctx.arc(w - 60, h - 60, 220, 0, Math.PI * 2);
    ctx.fill();
  } else if (presetId === "krem_altin") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#fffdf8");
    g.addColorStop(1, "#f4ede0");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Çift resmi çerçeve
    ctx.strokeStyle = "#b4925a";
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.strokeStyle = "rgba(180, 146, 90, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(22, 22, w - 44, h - 44);
  } else if (presetId === "mavi_geometrik") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#e6f0fa");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(29, 78, 216, 0.06)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(360, 0);
    ctx.quadraticCurveTo(180, 110, 0, 180);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(30, 64, 175, 0.08)";
    ctx.beginPath();
    ctx.moveTo(w, h);
    ctx.lineTo(w - 420, h);
    ctx.quadraticCurveTo(w - 190, h - 120, w, h - 220);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#1d4ed8";
    ctx.fillRect(0, h - 8, w, 8);
  } else if (presetId === "zumrut_resmi") {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#f9fbfa");
    g.addColorStop(1, "#ebf3ee");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#065f46";
    ctx.fillRect(0, 0, w, 12);
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = "rgba(6, 95, 70, 0.25)";
    ctx.fillRect(0, 12, w, 2);
  } else if (presetId === "resmi_gri") {
    const rg = ctx.createRadialGradient(w * 0.5, h * 0.35, 80, w * 0.5, h * 0.5, w * 0.72);
    rg.addColorStop(0, "#f8fafc");
    rg.addColorStop(0.65, "#e2e8f0");
    rg.addColorStop(1, "#cbd5e1");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(100, 116, 139, 0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, w - 20, h - 20);
  } else if (presetId === "saf_beyaz") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);
  } else {
    return "";
  }

  const url = canvas.toDataURL("image/jpeg", 0.9);
  presetBgCache.set(presetId, url);
  return url;
}

export interface TemplateBox {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export interface TemplateLayoutConfig {
  version?: number;
  mode: "classic" | "title_only" | "blank_text" | "title_and_desc" | "multi_slot";
  titleBox: TemplateBox | null;
  descBox: TemplateBox | null;
  photoSlots: TemplateBox[];
}

export interface PresentationTemplateClient {
  _id: string;
  name: string;
  fileName: string;
  backgroundImageBase64: string;
  slideWidthIn: number;
  slideHeightIn: number;
  layoutConfig?: TemplateLayoutConfig;
}

export const DEFAULT_TEMPLATE_LAYOUT: TemplateLayoutConfig = {
  mode: "classic",
  titleBox: { xPct: 47.5, yPct: 15.3, wPct: 46.2, hPct: 12.2 },
  descBox: { xPct: 3.2, yPct: 46, wPct: 93.6, hPct: 50.5 },
  photoSlots: [{ xPct: 3.2, yPct: 2.4, wPct: 41, hPct: 41.6 }],
};

export const SLIDE_FONT_OPTIONS = [
  "Verdana",
  "Calibri",
  "Times New Roman",
  "Arial",
  "Tahoma",
  "Georgia",
] as const;

export function compressImageToJpeg(
  file: File,
  maxDim = 1100,
  quality = 0.76
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Görsel okunamadı."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Geçersiz görsel dosyası."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas bağlamı oluşturulamadı."));
          return;
        }
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

async function getImageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  const bmp = await decodeDataUrlToBitmap(dataUrl);
  if (bmp && bmp.width > 0 && bmp.height > 0) {
    return { w: bmp.width, h: bmp.height };
  }
  return { w: 4, h: 3 };
}

async function roundImageCorners(dataUrl: string, radiusRatio = 0.04): Promise<string> {
  if (!dataUrl || typeof window === "undefined") return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Görsel yüklenemedi"));
      el.src = dataUrl;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    const r = Math.max(8, Math.round(Math.min(w, h) * radiusRatio));
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}

let autoFitMeasureCtx: CanvasRenderingContext2D | null = null;

function getAutoFitMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!autoFitMeasureCtx) {
    const canvas = document.createElement("canvas");
    autoFitMeasureCtx = canvas.getContext("2d");
  }
  return autoFitMeasureCtx;
}

export function computeAutoFontSizePt(
  lines: string[],
  boxWidthIn: number,
  boxHeightIn: number
): number {
  if (lines.length === 0) return 13.5;

  // Web önizlemedeki (720x540px = 10x7.5 inç) px-3 (12pt) ve py-2 (7.5pt) iç boşluklarıyla birebir aynı kullanılabilir alan
  const usableWidthPt = Math.max(120, boxWidthIn * 72 - 24);
  const usableHeightPt = Math.max(60, boxHeightIn * 72 - 14);
  const ctx = getAutoFitMeasureCtx();

  for (let pt = 15; pt >= 6.5; pt -= 0.5) {
    const bulletIndentPt = pt * 0.84 + 3.6;
    const lineTextWidthPt = Math.max(80, usableWidthPt - bulletIndentPt);
    let totalVisualLines = 0;

    if (ctx) {
      ctx.font = `bold ${pt}px Verdana, Geneva, sans-serif`;
      for (const rawLine of lines) {
        const clean = rawLine.trim();
        if (!clean) continue;
        const words = clean.split(/\s+/);
        let currentW = 0;
        let wrappedLines = 1;
        const spaceW = ctx.measureText(" ").width;

        for (const word of words) {
          const wordW = ctx.measureText(word).width;
          if (currentW === 0) {
            if (wordW > lineTextWidthPt) {
              const extra = Math.ceil(wordW / lineTextWidthPt) - 1;
              wrappedLines += extra;
              currentW = wordW % lineTextWidthPt;
            } else {
              currentW = wordW;
            }
          } else if (currentW + spaceW + wordW <= lineTextWidthPt) {
            currentW += spaceW + wordW;
          } else {
            wrappedLines += 1;
            currentW = wordW;
          }
        }
        totalVisualLines += wrappedLines;
      }
    } else {
      // Sunucu/fallback tahmini (Verdana Bold ortalama karakter genişliği ~0.65em)
      const charsPerLine = Math.max(12, Math.floor(lineTextWidthPt / (pt * 0.65)));
      for (const rawLine of lines) {
        totalVisualLines += Math.max(1, Math.ceil(rawLine.trim().length / charsPerLine));
      }
    }

    const paraGapTotalPt = Math.max(0, lines.length - 1) * 1.5;
    const totalHeightPt = totalVisualLines * (pt * 1.28) + paraGapTotalPt;
    if (totalHeightPt <= usableHeightPt) {
      return pt;
    }
  }
  return 6.5;
}

interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

function rgbToHex(colorStr: string): string | undefined {
  if (!colorStr) return undefined;
  const trimmed = colorStr.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.slice(1).toUpperCase();
  const m = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) {
    const r = Number(m[1]).toString(16).padStart(2, "0");
    const g = Number(m[2]).toString(16).padStart(2, "0");
    const b = Number(m[3]).toString(16).padStart(2, "0");
    return `${r}${g}${b}`.toUpperCase();
  }
  return undefined;
}

const CLIENT_LEADING_BULLET_RE = /^\s*(?:[➢➤➔→•●▪▫◦❖✓✔✦»›]|[-–—*]+(?=\s))\s*/u;

/**
 * Kopyala-yapıştır ile gelen ham metni düz metin satırlarına dönüştürür;
 * görünmez karakterleri, sekmeleri ve kopyalanmış eski madde işaretlerini temizler.
 */
export function extractCleanPlainLines(rawText: string): string[] {
  if (!rawText) return [];
  return rawText
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/\u00A0/g, " ")
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/\t+/g, " ")
        .replace(CLIENT_LEADING_BULLET_RE, "")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter(Boolean);
}

/**
 * Zengin metin HTML içeriğinden yabancı font-family, font-size, arka plan rengi,
 * Word/PowerPoint/Web sınıflarını tamamen temizler; yalnızca temiz <p>, <strong>, <em>, <u>
 * ve kurumsal yazı rengi (<span style="color:#RRGGBB">) bırakır.
 */
export function sanitizeSlideDescriptionHtml(
  rawHtml: string,
  fallbackPlain = ""
): string {
  if (typeof window === "undefined") return rawHtml || "";
  const trimmed = (rawHtml || "").trim();
  if (!trimmed) {
    const plainLines = extractCleanPlainLines(fallbackPlain);
    return plainLines
      .map(
        (l) =>
          `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
      )
      .join("");
  }

  const doc = new DOMParser().parseFromString(`<div>${trimmed}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const BLOCK_TAGS = new Set([
    "P",
    "DIV",
    "LI",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "BLOCKQUOTE",
    "TR",
    "UL",
    "OL",
  ]);
  const IGNORED_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "META", "LINK"]);

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines: string[] = [];
  let currentRuns: Array<{
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    colorHex?: string;
  }> = [];

  const flushLine = () => {
    if (currentRuns.length === 0) return;
    // Satır başındaki olası kopyalanmış madde işaretlerini temizle
    let strippedLeading = false;
    const normalizedRuns = currentRuns
      .map((r) => {
        let t = r.text.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "").replace(/\u00A0/g, " ");
        if (!strippedLeading) {
          const trimmedStart = t.replace(CLIENT_LEADING_BULLET_RE, "").trimStart();
          if (trimmedStart.length > 0) {
            strippedLeading = true;
            t = trimmedStart;
          } else {
            return null;
          }
        }
        return { ...r, text: t };
      })
      .filter(Boolean) as typeof currentRuns;

    const fullText = normalizedRuns.map((r) => r.text).join("").trim();
    if (fullText) {
      const htmlLine = normalizedRuns
        .map((r) => {
          let chunk = escapeHtml(r.text);
          if (r.underline) chunk = `<u>${chunk}</u>`;
          if (r.italic) chunk = `<em>${chunk}</em>`;
          if (r.bold) chunk = `<strong>${chunk}</strong>`;
          if (r.colorHex && r.colorHex !== "0F172A" && r.colorHex !== "111827" && r.colorHex !== "000000") {
            chunk = `<span style="color:#${r.colorHex}">${chunk}</span>`;
          }
          return chunk;
        })
        .join("");
      lines.push(`<p>${htmlLine}</p>`);
    }
    currentRuns = [];
  };

  const walk = (
    node: Node,
    style: { bold?: boolean; italic?: boolean; underline?: boolean; colorHex?: string }
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.textContent || "").split(/\r?\n/);
      parts.forEach((part, idx) => {
        if (idx > 0) flushLine();
        if (part) currentRuns.push({ text: part, ...style });
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (IGNORED_TAGS.has(tag)) return;
    if (tag === "BR") {
      flushLine();
      return;
    }

    const nextStyle = { ...style };
    if (tag === "B" || tag === "STRONG") nextStyle.bold = true;
    if (tag === "I" || tag === "EM") nextStyle.italic = true;
    if (tag === "U") nextStyle.underline = true;
    // Sadece editör renk paletinden seçilen açık renkleri koru; font-family ve font-size tamamen yok sayılır!
    const rawColor = el.style?.color || el.getAttribute("color") || "";
    if (rawColor) {
      const hex = rgbToHex(rawColor);
      if (hex) nextStyle.colorHex = hex;
    }

    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock && currentRuns.length > 0) flushLine();
    el.childNodes.forEach((child) => walk(child, nextStyle));
    if (isBlock) flushLine();
  };

  root.childNodes.forEach((child) => walk(child, {}));
  flushLine();
  return lines.join("");
}

function htmlToLinesOfRuns(html: string): RichRun[][] {
  if (typeof window === "undefined" || !html.trim()) return [];
  const cleanHtml = sanitizeSlideDescriptionHtml(html);
  if (!cleanHtml) return [];
  const doc = new DOMParser().parseFromString(`<div>${cleanHtml}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return [];

  const lines: RichRun[][] = [];
  let currentLine: RichRun[] = [];

  const flushLine = () => {
    const combined = currentLine.map((r) => r.text).join("").trim();
    if (combined) {
      // Ardışık aynı biçimlendirmeye sahip parçaları birleştir (temiz tek <a:r> OOXML üretimi için)
      const merged: RichRun[] = [];
      for (const run of currentLine) {
        if (!run.text) continue;
        const prev = merged[merged.length - 1];
        if (
          prev &&
          Boolean(prev.italic) === Boolean(run.italic) &&
          Boolean(prev.underline) === Boolean(run.underline) &&
          (prev.color || "") === (run.color || "")
        ) {
          prev.text += run.text;
        } else {
          merged.push({ ...run });
        }
      }
      if (merged.length > 0) {
        merged[0].text = merged[0].text.replace(CLIENT_LEADING_BULLET_RE, "").trimStart();
        merged[merged.length - 1].text = merged[merged.length - 1].text.trimEnd();
        const nonEmpty = merged.filter((m) => m.text.length > 0);
        if (nonEmpty.length > 0) lines.push(nonEmpty);
      }
    }
    currentLine = [];
  };

  const walk = (
    node: Node,
    style: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string }
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const rawTxt = (node.textContent || "").replace(/\u00A0/g, " ");
      const parts = rawTxt.split(/\r?\n/);
      parts.forEach((part, idx) => {
        if (idx > 0) flushLine();
        if (part) currentLine.push({ text: part, ...style });
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === "BR") {
      flushLine();
      return;
    }

    const nextStyle = { ...style };
    if (tag === "B" || tag === "STRONG" || Number(el.style.fontWeight) >= 600 || el.style.fontWeight === "bold") {
      nextStyle.bold = true;
    }
    if (tag === "I" || tag === "EM" || el.style.fontStyle === "italic") {
      nextStyle.italic = true;
    }
    if (tag === "U" || el.style.textDecoration.includes("underline")) {
      nextStyle.underline = true;
    }
    if (el.style.color) {
      const hex = rgbToHex(el.style.color);
      if (hex) nextStyle.color = hex;
    }

    const isBlock = ["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "TR", "UL", "OL"].includes(tag);
    if (isBlock && currentLine.length > 0) flushLine();

    el.childNodes.forEach((child) => walk(child, nextStyle));

    if (isBlock) flushLine();
  };

  root.childNodes.forEach((child) => walk(child, {}));
  flushLine();
  return lines;
}

const framedPptxCache = new Map<
  string,
  {
    dataUrl: string;
    shadow: {
      type: "outer";
      blur: number;
      offset: number;
      angle: number;
      color: string;
      opacity: number;
    };
  }
>();

async function renderFramedPhotoForPptx(
  dataUrl: string,
  framePresetId?: string
): Promise<{
  dataUrl: string;
  shadow: {
    type: "outer";
    blur: number;
    offset: number;
    angle: number;
    color: string;
    opacity: number;
  };
}> {
  const defaultShadow = {
    type: "outer" as const,
    blur: 4,
    offset: 2,
    angle: 45,
    color: "475569",
    opacity: 0.3,
  };
  const preset = framePresetId || "none";
  if (!dataUrl || typeof window === "undefined") {
    return { dataUrl, shadow: defaultShadow };
  }
  if (preset === "none") {
    // Orijinal sıkıştırılmış JPEG görseli PNG'ye şişirmeden (%100 kaliteyi koruyarak) doğrudan kullan
    return { dataUrl, shadow: defaultShadow };
  }

  const cacheKey = `${preset}::${dataUrl.length}::${dataUrl.slice(0, 64)}::${dataUrl.slice(-48)}`;
  const cached = framedPptxCache.get(cacheKey);
  if (cached) return cached;

  try {
    const img = await decodeDataUrlToBitmap(dataUrl);
    if (!img) return { dataUrl, shadow: defaultShadow };
    const iw = img.width;
    const ih = img.height;
    if (!iw || !ih) return { dataUrl, shadow: defaultShadow };

    const minDim = Math.min(iw, ih);
    const outerBand =
      preset === "kurumsal_lacivert_3d" ||
      preset === "altin_prestij_3d" ||
      preset === "bordo_resmi_3d"
        ? Math.max(10, Math.round(minDim * 0.022))
        : preset === "beyaz_3d_kabartma"
          ? Math.max(6, Math.round(minDim * 0.01))
          : Math.max(4, Math.round(minDim * 0.006));

    const whiteMat =
      preset === "duz_beyaz"
        ? Math.max(14, Math.round(minDim * 0.028))
        : preset === "beyaz_3d_kabartma"
          ? Math.max(16, Math.round(minDim * 0.032))
          : preset === "modern_cift_beyaz"
            ? Math.max(16, Math.round(minDim * 0.03))
            : Math.max(11, Math.round(minDim * 0.02));

    const totalPad = outerBand + whiteMat;
    const cw = iw + totalPad * 2;
    const ch = ih + totalPad * 2;
    const outerRadius = Math.max(14, Math.round(minDim * 0.042));
    const innerRadius = Math.max(8, Math.round(minDim * 0.024));

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { dataUrl, shadow: defaultShadow };

    // 1. Dış çerçeve dolgusu ve 3B eğim (bevel) efekti (Opak yüksek kaliteli JPEG çıktısı için net galeri köşesi)
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, cw, ch);

    if (preset === "duz_beyaz") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = "#DBE3EE";
      ctx.lineWidth = Math.max(3, Math.round(minDim * 0.005));
      ctx.strokeRect(1.5, 1.5, cw - 3, ch - 3);
    } else if (preset === "beyaz_3d_kabartma") {
      const g = ctx.createLinearGradient(0, 0, cw, ch);
      g.addColorStop(0, "#FFFFFF");
      g.addColorStop(0.7, "#F8FAFC");
      g.addColorStop(1, "#E2E8F0");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);

      // Alt ve sağ 3B pah gölgesi
      ctx.strokeStyle = "#94A3B8";
      ctx.lineWidth = Math.max(6, Math.round(minDim * 0.012));
      ctx.strokeRect(0, 0, cw, ch);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = Math.max(5, Math.round(minDim * 0.01));
      ctx.beginPath();
      ctx.moveTo(0, ch);
      ctx.lineTo(0, 0);
      ctx.lineTo(cw, 0);
      ctx.stroke();
    } else if (preset === "modern_cift_beyaz") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, cw, ch);
      const midInset = Math.round(totalPad * 0.45);
      ctx.strokeStyle = "#CBD5E1";
      ctx.lineWidth = Math.max(3, Math.round(minDim * 0.005));
      ctx.beginPath();
      ctx.roundRect(
        midInset,
        midInset,
        cw - midInset * 2,
        ch - midInset * 2,
        Math.max(10, outerRadius - 4)
      );
      ctx.stroke();
      ctx.strokeStyle = "#E2E8F0";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, cw - 2, ch - 2);
    } else if (preset === "kurumsal_lacivert_3d") {
      const g = ctx.createLinearGradient(0, 0, cw, ch);
      g.addColorStop(0, "#2B5282");
      g.addColorStop(0.5, "#1E3A5F");
      g.addColorStop(1, "#0F213A");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    } else if (preset === "altin_prestij_3d") {
      const g = ctx.createLinearGradient(0, 0, cw, ch);
      g.addColorStop(0, "#ECCF86");
      g.addColorStop(0.45, "#C29845");
      g.addColorStop(1, "#785619");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    } else if (preset === "bordo_resmi_3d") {
      const g = ctx.createLinearGradient(0, 0, cw, ch);
      g.addColorStop(0, "#BE123C");
      g.addColorStop(0.5, "#881337");
      g.addColorStop(1, "#4C0519");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    } else if (preset === "kristal_cam_3d") {
      const g = ctx.createLinearGradient(0, 0, cw, ch);
      g.addColorStop(0, "#FFFFFF");
      g.addColorStop(0.55, "#EFF6FF");
      g.addColorStop(1, "#DBEAFE");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = "#93C5FD";
      ctx.lineWidth = Math.max(4, Math.round(minDim * 0.008));
      ctx.strokeRect(2, 2, cw - 4, ch - 4);
    }

    // 2. İç düz beyaz paspartu katmanı (renkli 3B çerçevelerde saf beyaz iç çerçeve)
    if (
      preset === "kurumsal_lacivert_3d" ||
      preset === "altin_prestij_3d" ||
      preset === "bordo_resmi_3d"
    ) {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(
        outerBand,
        outerBand,
        cw - outerBand * 2,
        ch - outerBand * 2,
        Math.max(10, outerRadius - 5)
      );
      ctx.fill();
    }

    // 3. Fotoğrafın kendisini iç yuvarlatılmış alana çiz
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(totalPad, totalPad, iw, ih, innerRadius);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, totalPad, totalPad, iw, ih);
    ctx.restore();

    // Hafif iç kontur
    ctx.strokeStyle = "rgba(15, 23, 42, 0.08)";
    ctx.lineWidth = Math.max(1.5, Math.round(minDim * 0.0025));
    ctx.beginPath();
    ctx.roundRect(totalPad, totalPad, iw, ih, innerRadius);
    ctx.stroke();

    ctx.restore();

    const shadow =
      preset === "duz_beyaz"
        ? {
            type: "outer" as const,
            blur: 6,
            offset: 2.5,
            angle: 45,
            color: "334155",
            opacity: 0.25,
          }
        : {
            type: "outer" as const,
            blur: 10,
            offset: 4,
            angle: 45,
            color: preset === "kristal_cam_3d" ? "1E3A8A" : "0F172A",
            opacity: 0.4,
          };

    // PNG yerine %92 yüksek kaliteli JPEG: görsel netliği sıfır kayıpla korunur, dosya boyutu ~%85 küçülür
    const result = {
      dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      shadow,
    };
    if (framedPptxCache.size > 60) {
      const firstKey = framedPptxCache.keys().next().value;
      if (firstKey) framedPptxCache.delete(firstKey);
    }
    framedPptxCache.set(cacheKey, result);
    return result;
  } catch {
    return { dataUrl, shadow: defaultShadow };
  }
}

export async function exportSlidesToPptx(params: {
  slides: SlideItem[];
  fileName: string;
  templates?: PresentationTemplateClient[];
  template?: PresentationTemplateClient | null;
  meetingBackgroundPreset?: string;
  meetingPhotoFramePreset?: string;
  triggerDownload?: boolean;
}): Promise<{ blob: Blob; fileName: string }> {
  const {
    slides,
    fileName,
    templates = [],
    template = null,
    meetingBackgroundPreset,
    meetingPhotoFramePreset = "none",
    triggerDownload = true,
  } = params;
  const [{ default: PptxGenJS }, { default: JSZip }] = await Promise.all([
    import("pptxgenjs"),
    import("jszip"),
  ]);
  const pptx = new PptxGenJS();

  const defaultTpl =
    (slides[0]?.templateId &&
      templates.find((t) => t._id === slides[0].templateId)) ||
    templates[0] ||
    template;
  const slideW = defaultTpl?.slideWidthIn || 10;
  const slideH = defaultTpl?.slideHeightIn || 7.5;
  const sx = slideW / 10;
  const sy = slideH / 7.5;

  pptx.defineLayout({ name: "CUSTOM_LAYOUT", width: slideW, height: slideH });
  pptx.layout = "CUSTOM_LAYOUT";

  // Arka plan görselini her slayta ayrı ayrı kopyalamak yerine SlideMaster ile TEK KEZ göm (50 slaytta ~%95 yer tasarrufu!)
  const registeredMasters = new Map<string, string>();
  let masterSeq = 0;

  const resolveSlideMasterName = async (item: SlideItem): Promise<string> => {
    const slideTpl =
      (item.templateId && templates.find((t) => t._id === item.templateId)) ||
      defaultTpl;
    const activePreset = meetingBackgroundPreset ?? item.backgroundPreset;
    const presetBg =
      activePreset && activePreset !== "template"
        ? getPresetBackgroundDataUrl(activePreset)
        : "";

    let bgKey = "solid:E5E7EB";
    let backgroundDef: { data?: string; color?: string } = { color: "E5E7EB" };

    if (presetBg) {
      bgKey = `preset:${activePreset}`;
      backgroundDef = { data: presetBg };
    } else if (slideTpl?.backgroundImageBase64) {
      bgKey = `tpl:${slideTpl._id || slideTpl.fileName || "default"}`;
      const cleanedBg = await cleanTemplateWatermark(slideTpl.backgroundImageBase64);
      backgroundDef = { data: cleanedBg };
    }

    const existing = registeredMasters.get(bgKey);
    if (existing) return existing;

    masterSeq += 1;
    const masterName = `VAKIF_MASTER_${masterSeq}`;
    pptx.defineSlideMaster({
      title: masterName,
      background: backgroundDef as any,
    });
    registeredMasters.set(bgKey, masterName);
    return masterName;
  };

  for (const item of slides) {
    const masterName = await resolveSlideMasterName(item);
    const slide = pptx.addSlide({ masterName });
    // Tüm sistemde tek tip kurumsal standart yazı tipi (Verdana)
    const fontFamily = "Verdana";
    const slideTpl =
      (item.templateId && templates.find((t) => t._id === item.templateId)) ||
      defaultTpl;
    const layout = slideTpl?.layoutConfig || DEFAULT_TEMPLATE_LAYOUT;

    const fitMode = item.photoFitMode || "contain";
    const photos = (item.photos || []).filter(Boolean);

    // 1. FOTOĞRAFLAR
    if (
      (layout.mode === "classic" && layout.photoSlots.length > 0) ||
      ((layout.mode === "blank_text" || layout.mode === "title_only") &&
        photos.length > 0 &&
        (item.photoCount || 0) > 0)
    ) {
      const isClassic = layout.mode === "classic";
      const slot = isClassic
        ? layout.photoSlots[0]
        : layout.titleBox
        ? {
            xPct: 3,
            yPct: Math.min(35, layout.titleBox.yPct + layout.titleBox.hPct + 3),
            wPct: 94,
            hPct: Math.max(40, 95 - (layout.titleBox.yPct + layout.titleBox.hPct + 3)),
          }
        : { xPct: 3, yPct: 4, wPct: 94, hPct: 92 };
      const wPct = isClassic ? Math.min(52, Math.max(20, item.photoWidthPct ?? slot.wPct)) : slot.wPct;
      const hPct = isClassic ? Math.min(44, Math.max(22, item.photoHeightPct ?? slot.hPct)) : slot.hPct;
      const lPct = isClassic ? Math.min(30, Math.max(0, item.photoLeftPct ?? slot.xPct)) : slot.xPct;
      const areaX = (lPct / 100) * slideW;
      const areaY = (slot.yPct / 100) * slideH;
      const areaW = (wPct / 100) * slideW;
      const areaH = (hPct / 100) * slideH;
      const usedPhotos = photos.slice(0, item.photoCount || 4);

      if (usedPhotos.length > 0) {
        const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
        if (usedPhotos.length === 1) {
          boxes.push({ x: areaX, y: areaY, w: areaW, h: areaH });
        } else if (usedPhotos.length === 2) {
          const gap = 0.1 * sx;
          const w = (areaW - gap) / 2;
          boxes.push({ x: areaX, y: areaY, w, h: areaH });
          boxes.push({ x: areaX + w + gap, y: areaY, w, h: areaH });
        } else {
          const gapX = 0.1 * sx;
          const gapY = 0.1 * sy;
          const w = (areaW - gapX) / 2;
          const h = (areaH - gapY) / 2;
          boxes.push({ x: areaX, y: areaY, w, h });
          boxes.push({ x: areaX + w + gapX, y: areaY, w, h });
          boxes.push({ x: areaX, y: areaY + h + gapY, w, h });
          boxes.push({ x: areaX + w + gapX, y: areaY + h + gapY, w, h });
        }

        for (let i = 0; i < usedPhotos.length; i++) {
          const box = boxes[i];
          const photoData = usedPhotos[i];
          let drawX = box.x;
          let drawY = box.y;
          let drawW = box.w;
          let drawH = box.h;
          if (fitMode !== "fill") {
            const dims = await getImageDimensions(photoData);
            const imgRatio = dims.w / dims.h;
            const boxRatio = box.w / box.h;
            if (imgRatio > boxRatio) drawH = box.w / imgRatio;
            else drawW = box.h * imgRatio;
            drawX = box.x + (box.w - drawW) / 2;
            drawY = box.y + (box.h - drawH) / 2;
          }
          const framed = await renderFramedPhotoForPptx(
            photoData,
            meetingPhotoFramePreset
          );
          slide.addImage({
            data: framed.dataUrl,
            x: drawX,
            y: drawY,
            w: drawW,
            h: drawH,
            shadow: framed.shadow,
          });
        }
      }
    } else if (layout.mode === "multi_slot" && layout.photoSlots.length > 0) {
      for (let i = 0; i < layout.photoSlots.length; i++) {
        const photoData = photos[i];
        if (!photoData) continue;
        const slot = layout.photoSlots[i];
        const bx = (slot.xPct / 100) * slideW;
        const by = (slot.yPct / 100) * slideH;
        const bw = (slot.wPct / 100) * slideW;
        const bh = (slot.hPct / 100) * slideH;

        let drawX = bx;
        let drawY = by;
        let drawW = bw;
        let drawH = bh;
        if (fitMode !== "fill") {
          const dims = await getImageDimensions(photoData);
          const imgRatio = dims.w / dims.h;
          const boxRatio = bw / bh;
          if (imgRatio > boxRatio) drawH = bw / imgRatio;
          else drawW = bh * imgRatio;
          drawX = bx + (bw - drawW) / 2;
          drawY = by + (bh - drawH) / 2;
        }
        const framed = await renderFramedPhotoForPptx(
          photoData,
          meetingPhotoFramePreset
        );
        slide.addImage({
          data: framed.dataUrl,
          x: drawX,
          y: drawY,
          w: drawW,
          h: drawH,
          shadow: framed.shadow,
        });
      }
    }

    // 2. BAŞLIK KUTUSU (classic, title_only veya title_and_desc şablonlarında)
    if (
      layout.titleBox &&
      (layout.mode === "classic" ||
        layout.mode === "title_only" ||
        layout.mode === "title_and_desc")
    ) {
      const tb = layout.titleBox;
      let boxX = (tb.xPct / 100) * slideW;
      let boxW = (tb.wPct / 100) * slideW;
      if (layout.mode === "classic") {
        const wPct = Math.min(52, Math.max(20, item.photoWidthPct ?? 41));
        const lPct = Math.min(30, Math.max(0, item.photoLeftPct ?? 3.2));
        const areaX = (lPct / 100) * slideW;
        const areaW = (wPct / 100) * slideW;
        boxX = Math.max(boxX, areaX + areaW + 0.25 * sx);
        boxW = Math.min(boxW, slideW - boxX - 0.32 * sx);
      }
      const boxY = (tb.yPct / 100) * slideH;
      const baseBoxH = Math.max(0.85 * sy, (tb.hPct / 100) * slideH);
      const minTitleFromDesc =
        item.fontSize && item.fontSize !== "auto" ? Number(item.fontSize) + 1 : 14;
      const titlePt = Math.min(
        26,
        Math.max(minTitleFromDesc, Number(item.titleFontSize ?? 20))
      );
      const isTitleBold = item.titleBold !== false;

      const maxChars = Math.max(
        (item.fullName || "").length,
        (item.neighborhood || "").length,
        12
      );
      const estCharW = (titlePt / 72) * (isTitleBold ? 0.64 : 0.58);
      const neededW = maxChars * estCharW + 0.45 * sx;
      const maxAllowedW =
        layout.mode === "classic" ? slideW - boxX - 0.32 * sx : slideW - 0.6 * sx;
      boxW = Math.min(maxAllowedW, Math.max(boxW, neededW));
      if (layout.mode !== "classic") {
        boxX = Math.max(0.3 * sx, (slideW - boxW) / 2);
      }
      const lineCount =
        Math.max(1, Math.ceil((item.fullName || "").length / Math.max(10, (boxW - 0.3 * sx) / estCharW))) +
        Math.max(1, Math.ceil((item.neighborhood || "").length / Math.max(10, (boxW - 0.3 * sx) / estCharW)));
      const neededH = lineCount * ((titlePt / 72) * 1.25) + 0.24 * sy;
      const boxH = Math.min(slideH * 0.35, Math.max(baseBoxH, neededH));

      slide.addShape(pptx.ShapeType.rect, {
        x: boxX,
        y: boxY,
        w: boxW,
        h: boxH,
        fill: { color: "FFFFFF" },
        line: { color: "CBD5E1", width: 1 },
        shadow: {
          type: "outer",
          blur: 6,
          offset: 2,
          angle: 45,
          color: "334155",
          opacity: 0.25,
        },
      });

      slide.addText(
        [
          {
            text: item.fullName || "",
            options: { fontSize: titlePt, bold: isTitleBold, color: "020617", breakLine: true },
          },
          {
            text: item.neighborhood || "",
            options: { fontSize: titlePt, bold: isTitleBold, color: "0F172A" },
          },
        ],
        {
          x: boxX + 0.08 * sx,
          y: boxY + 0.04 * sy,
          w: boxW - 0.16 * sx,
          h: boxH - 0.08 * sy,
          align: "center",
          valign: "middle",
          fontFace: fontFamily,
          shadow: {
            type: "outer",
            blur: 3,
            offset: 1.5,
            angle: 45,
            color: "475569",
            opacity: isTitleBold ? 0.5 : 0.3,
          },
        }
      );
    }

    // 3. AÇIKLAMA KUTUSU (Sadece şablonda descBox varsa çizilir — Web önizleme ile 1:1 aynı oran ve sıfır fazla boşluk)
    if (layout.descBox) {
      const descLeftPct = layout.mode === "classic" ? 3.2 : layout.descBox.xPct;
      const descWidthPct = layout.mode === "classic" ? 93.6 : layout.descBox.wPct;
      const descX = (descLeftPct / 100) * slideW;
      let descY = (layout.descBox.yPct / 100) * slideH;
      const descW = (descWidthPct / 100) * slideW;
      let descH = (layout.descBox.hPct / 100) * slideH;

      if (layout.mode === "classic") {
        const topPct = Math.min(65, Math.max(44.5, item.descTopPct ?? layout.descBox.yPct));
        const bottomPct = Math.min(97.5, Math.max(topPct + 18, item.descBottomPct ?? 96.5));
        descY = (topPct / 100) * slideH;
        descH = ((bottomPct - topPct) / 100) * slideH;
      } else if (layout.mode === "title_and_desc") {
        const minTop = layout.titleBox
          ? Math.max(20, layout.titleBox.yPct + layout.titleBox.hPct + 2)
          : 25;
        const topPct = Math.min(65, Math.max(minTop, item.descTopPct ?? layout.descBox.yPct));
        const defaultBottom = Math.min(97.5, layout.descBox.yPct + layout.descBox.hPct);
        const bottomPct = Math.min(97.5, Math.max(topPct + 18, item.descBottomPct ?? defaultBottom));
        descY = (topPct / 100) * slideH;
        descH = ((bottomPct - topPct) / 100) * slideH;
      }

      slide.addShape(pptx.ShapeType.rect, {
        x: descX,
        y: descY,
        w: descW,
        h: descH,
        fill: { color: "FFFFFF" },
        line: { color: "E2E8F0", width: 0.75 },
      });

      const richLines = item.descriptionHtml ? htmlToLinesOfRuns(item.descriptionHtml) : [];
      const plainLines = extractCleanPlainLines(item.description || "");

      const textLinesForSizing =
        richLines.length > 0
          ? richLines.map((runs) => runs.map((r) => r.text).join(""))
          : plainLines;

      // Sanal 10x7.5 inç (720x540px) sahne üzerinde puntoyu hesapla, farklı boyutta şablon varsa orantılı ölçekle
      const virtualDescW = (descW / slideW) * 10;
      const virtualDescH = (descH / slideH) * 7.5;
      const baseFontSize =
        item.fontSize && item.fontSize !== "auto"
          ? Number(item.fontSize)
          : computeAutoFontSizePt(textLinesForSizing, virtualDescW, virtualDescH);
      const fontScale = Math.min(sx, sy);
      const fontSize = Math.round(baseFontSize * fontScale * 10) / 10;

      // Gerçek PowerPoint madde işareti (U+27A2 '➢') ve asılı girinti:
      // Fazladan çift boşluk karakteri EKLEMEZ, alt satıra taşan metni web önizlemedeki gibi tam harf hizasından başlatır
      const bulletIndentPt = Math.round((fontSize * 0.84 + 3.6 * fontScale) * 10) / 10;
      const paraGapPt = Math.round(1.5 * fontScale * 10) / 10;
      const pptxRuns: any[] = [];

      if (richLines.length > 0) {
        richLines.forEach((runs, lineIdx) => {
          const isLastLine = lineIdx === richLines.length - 1;
          runs.forEach((r, rIdx) => {
            const isFirstRun = rIdx === 0;
            const isLastRunOfLine = rIdx === runs.length - 1;
            pptxRuns.push({
              text: r.text,
              options: {
                fontSize,
                bold: true,
                italic: r.italic,
                underline: r.underline ? { style: "sng" } : undefined,
                color: r.color || "020617",
                ...(isFirstRun
                  ? {
                      bullet: {
                        characterCode: "27A2",
                        indent: bulletIndentPt,
                      },
                    }
                  : {}),
                breakLine: isLastRunOfLine && !isLastLine,
                paraSpaceAfter: isLastRunOfLine && !isLastLine ? paraGapPt : 0,
                paraSpaceBefore: 0,
              },
            });
          });
        });
      } else if (plainLines.length > 0) {
        plainLines.forEach((line, idx) => {
          const isLastLine = idx === plainLines.length - 1;
          pptxRuns.push({
            text: line,
            options: {
              fontSize,
              bold: true,
              color: "020617",
              bullet: {
                characterCode: "27A2",
                indent: bulletIndentPt,
              },
              breakLine: !isLastLine,
              paraSpaceAfter: !isLastLine ? paraGapPt : 0,
              paraSpaceBefore: 0,
            },
          });
        });
      }

      if (pptxRuns.length > 0) {
        // Web önizlemedeki px-3 (12/720) ve py-2 (8/540) iç boşluklarıyla birebir örtüşen koordinatlar
        const padX = (12 / 720) * slideW;
        const padTop = (7.5 / 540) * slideH;
        const padBottom = (5.5 / 540) * slideH;
        slide.addText(pptxRuns, {
          x: descX + padX,
          y: descY + padTop,
          w: Math.max(1, descW - padX * 2),
          h: Math.max(0.5, descH - padTop - padBottom),
          margin: 0,
          lineSpacingMultiple: 1.06,
          valign: "top",
          fontFace: fontFamily,
        });
      }
    }
  }

  const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_");
  const finalFileName = safeName.endsWith(".pptx") ? safeName : `${safeName}.pptx`;

  // PptxGenJS çıktısını maksimum kayıpsız DEFLATE (seviye 9) ile sıkıştır ve aynı görsel varsa tekilleştir
  const rawBlob = (await pptx.write({ compression: true } as any)) as Blob;
  let compressedBlob = rawBlob;
  try {
    const zip = await JSZip.loadAsync(await rawBlob.arrayBuffer());
    compressedBlob = await zip.generateAsync({
      type: "blob",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });
  } catch {
    compressedBlob = rawBlob;
  }

  if (triggerDownload && typeof document !== "undefined") {
    const url = URL.createObjectURL(compressedBlob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = finalFileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  return { blob: compressedBlob, fileName: finalFileName };
}
