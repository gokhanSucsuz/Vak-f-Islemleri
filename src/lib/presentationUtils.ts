import zlib from "zlib";
import { promisify } from "util";
import JSZip from "jszip";
import Presentation, { ISlideData } from "@/models/Presentation";
import PresentationMeeting from "@/models/PresentationMeeting";
import type {
  ITemplateBox,
  ITemplateLayoutConfig,
  ICoverRenderSpec,
  ICoverImageItem,
  ICoverTextItem,
} from "@/models/PresentationTemplate";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const brotliCompress = promisify(zlib.brotliCompress);
const brotliDecompress = promisify(zlib.brotliDecompress);

// Kopyala-yapıştır kaynaklı yabancı font/boyut/bullet kirliliğini sunucu tarafında da temizler
const LEADING_BULLET_RE = /^\s*(?:[➢➤➔→•●▪▫◦❖✓✔✦»›]|[-–—*]+(?=\s))\s*/u;

export function sanitizeSlidePlainText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/\u00A0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\t+/g, " ").replace(LEADING_BULLET_RE, "").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function sanitizeSlideHtmlServer(rawHtml: string, fallbackPlain = ""): string {
  const source = (rawHtml || "").trim();
  if (!source) {
    const cleanPlain = sanitizeSlidePlainText(fallbackPlain);
    if (!cleanPlain) return "";
    return cleanPlain
      .split("\n")
      .map(
        (l) =>
          `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
      )
      .join("");
  }

  // Tüm yabancı font-family, font-size, line-height, background, class, <font> ve script/on* özniteliklerini temizle
  // NOT: Paragraf içi yumuşak <br> etiketlerini yeni maddeye bölmemek için boşluğa dönüştürürüz;
  // yalnızca blok kapanışları (</p>, </div>, </li>) yeni madde satırı oluşturur.
  const withoutDangerous = source
    .replace(/<(script|style|iframe|object|embed|meta|link)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
    .replace(/<(p|div|li|h[1-6]|tr|blockquote)\b[^>]*>/gi, "")
    .replace(/<\/?font\b[^>]*>/gi, "")
    .replace(/<\/?span\b[^>]*>/gi, "");

  // Sadece temiz <b>/<strong>, <i>/<em>, <u> etiketlerini koru, diğer tüm etiketleri soy
  const stripped = withoutDangerous.replace(
    /<(\/?)([a-z0-9-]+)(?:\s[^>]*)?>/gi,
    (_match, slash: string, tag: string) => {
      const lower = tag.toLowerCase();
      if (lower === "b" || lower === "strong") return `<${slash}strong>`;
      if (lower === "i" || lower === "em") return `<${slash}em>`;
      if (lower === "u") return `<${slash}u>`;
      return "";
    }
  );

  const lines = stripped
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/&nbsp;/gi, " ")
    .split(/\r?\n/)
    .map((line) => {
      // Satır başındaki olası etiketlerin içindeki ya da dışındaki madde işaretlerini temizle
      return line
        .replace(/^(\s*(?:<(?:strong|em|u)>)*)\s*(?:[➢➤➔→•●▪▫◦❖✓✔✦»›]|[-–—*]+(?=\s))\s*/u, "$1")
        .trim();
    })
    .filter((line) => line.replace(/<[^>]+>/g, "").trim().length > 0);

  if (lines.length === 0) return "";
  return lines.map((l) => `<p>${l}</p>`).join("");
}

// Sunucu içi açılmış slayt önbelleği (Tekil ve toplu önizleme hızını katlar)
const decompressedSlideCache = new Map<string, ISlideData[]>();

export async function decompressSlides(buf: Buffer): Promise<ISlideData[]> {
  if (!buf || buf.length === 0) return [];
  const isGzip = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const raw = isGzip ? await gunzip(buf) : await brotliDecompress(buf);
  const parsed = JSON.parse(raw.toString("utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

export async function decompressSlidesCached(
  recordId: string,
  updatedAt: Date | string | undefined,
  buf: Buffer
): Promise<ISlideData[]> {
  if (!buf || buf.length === 0) return [];
  const stamp = updatedAt ? new Date(updatedAt).getTime() : buf.length;
  const cacheKey = `${recordId}_${stamp}`;
  const hit = decompressedSlideCache.get(cacheKey);
  if (hit) return hit;

  const slides = await decompressSlides(buf);
  if (decompressedSlideCache.size >= 80) {
    const oldest = decompressedSlideCache.keys().next().value;
    if (oldest) decompressedSlideCache.delete(oldest);
  }
  decompressedSlideCache.set(cacheKey, slides);
  return slides;
}

export async function compressSlides(slides: ISlideData[]): Promise<Buffer> {
  const json = JSON.stringify(slides);
  // Maksimum kayıpsız sıkıştırma (VDS disk alanını minimumda tutar, resimleri hiç bozmaz)
  return gzip(Buffer.from(json, "utf8"), { level: 9 });
}

export async function compressPptxArchive(rawPptx: Buffer): Promise<Buffer> {
  if (!rawPptx || rawPptx.length === 0) return Buffer.alloc(0);
  return brotliCompress(rawPptx, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 6,
    },
  });
}

export async function decompressPptxArchive(compressedBuf: Buffer): Promise<Buffer> {
  if (!compressedBuf || compressedBuf.length === 0) return Buffer.alloc(0);
  const isGzip =
    compressedBuf.length >= 2 && compressedBuf[0] === 0x1f && compressedBuf[1] === 0x8b;
  // Eski/ham ZIP ('PK' = 0x50 0x4b) kontrolü
  const isRawZip =
    compressedBuf.length >= 2 && compressedBuf[0] === 0x50 && compressedBuf[1] === 0x4b;
  if (isRawZip) return compressedBuf;
  return isGzip ? gunzip(compressedBuf) : brotliDecompress(compressedBuf);
}

export function buildMeetingArchiveSignature(params: {
  orderedDocs: Array<{ _id: any; updatedAt?: Date | string }>;
  backgroundPreset?: string;
  photoFramePreset?: string;
  coverStamp?: string;
}): string {
  const parts = params.orderedDocs.map((d) => {
    const ts = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
    return `${String(d._id)}:${ts}`;
  });
  return `v3|cov=${params.coverStamp || "none"}|bg=${params.backgroundPreset || "template"}|fr=${params.photoFramePreset || "none"}|${parts.join(",")}`;
}

/**
 * VDS diskinde gereksiz birikimi önlemek için yalnızca son `keepCount` toplantının
 * sıkıştırılmış toplu .pptx önbelleğini tutar; daha eski arşiv ikililerini temizler.
 */
export async function pruneOldMeetingArchives(keepCount = 5): Promise<void> {
  try {
    const withArchive = await PresentationMeeting.find({
      combinedPptxSize: { $gt: 0 },
    })
      .select("_id updatedAt combinedPptxUpdatedAt")
      .sort({ combinedPptxUpdatedAt: -1, updatedAt: -1 })
      .lean();

    if (withArchive.length <= keepCount) return;
    const staleIds = withArchive.slice(keepCount).map((m: any) => m._id);
    await PresentationMeeting.updateMany(
      { _id: { $in: staleIds } },
      {
        $unset: { combinedPptxCompressed: 1 },
        $set: { combinedPptxSize: 0, combinedPptxHash: "" },
      }
    );
  } catch {
    // sessiz
  }
}

export function computeSlideStats(slides: ISlideData[], compressedLength: number) {
  const dataUriByteSize = (dataUri: string) => {
    if (!dataUri) return 0;
    const commaIdx = dataUri.indexOf(",");
    const b64 = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;
    const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
  };

  let totalPhotos = 0;
  let photoBytes = 0;
  let firstPhoto = "";

  for (const s of slides) {
    if (Array.isArray(s.photos) && s.photos.length > 0) {
      totalPhotos += s.photos.length;
      if (!firstPhoto) firstPhoto = s.photos[0] || "";
      for (const p of s.photos) {
        photoBytes += dataUriByteSize(p);
      }
    }
  }

  return {
    totalPhotos,
    photoBytes,
    presentationBytes: compressedLength,
    firstPhoto,
  };
}

/**
 * Toplantı slaydı indirildikten 12 saat sonra süresi dolmuş toplantıların
 * slayt fotoğraflarını otomatik olarak sistemden siler (metin kayıtları korunur).
 */
export async function purgeExpiredMeetingPhotos(): Promise<number> {
  // Otomatik fotoğraf silme işlemi devre dışı bırakıldı
  return 0;
}

/**
 * Yüklenen .pptx şablonundan slayt boyutlarını ve arka plan görselini çıkarır.
 */
export async function extractPptxTemplateInfo(buffer: Buffer): Promise<{
  backgroundImageBase64: string;
  slideWidthIn: number;
  slideHeightIn: number;
  layoutConfig: ITemplateLayoutConfig;
}> {
  const zip = await JSZip.loadAsync(buffer);
  let slideWidthIn = 10;
  let slideHeightIn = 7.5;

  // Slayt boyutunu ppt/presentation.xml içinden oku (1 inch = 914400 EMU)
  const presXmlFile = zip.file("ppt/presentation.xml");
  if (presXmlFile) {
    const presXml = await presXmlFile.async("string");
    const szMatch = presXml.match(/<p:sldSz[^>]*cx=["'](\d+)["'][^>]*cy=["'](\d+)["']/i);
    if (szMatch) {
      const cx = parseInt(szMatch[1], 10);
      const cy = parseInt(szMatch[2], 10);
      if (cx > 0 && cy > 0) {
        slideWidthIn = Math.round((cx / 914400) * 100) / 100;
        slideHeightIn = Math.round((cy / 914400) * 100) / 100;
      }
    }
  }

  // Arka plan görselini bul (önce slideMaster/slideLayout rels, yoksa ppt/media içindeki en uygun görsel)
  const mediaFiles = Object.keys(zip.files).filter(
    (name) =>
      name.startsWith("ppt/media/") &&
      /\.(png|jpe?g|webp)$/i.test(name) &&
      !zip.files[name].dir
  );

  let chosenMediaPath: string | null = null;

  const relFiles = Object.keys(zip.files).filter(
    (name) =>
      (name.startsWith("ppt/slideMasters/_rels/") ||
        name.startsWith("ppt/slideLayouts/_rels/")) &&
      name.endsWith(".rels")
  );

  for (const relPath of relFiles) {
    const relXml = await zip.file(relPath)!.async("string");
    const mediaMatch = relXml.match(/Target=["']\.\.\/media\/([^"']+\.(?:png|jpe?g|webp))["']/i);
    if (mediaMatch) {
      const candidate = `ppt/media/${mediaMatch[1]}`;
      if (zip.file(candidate)) {
        chosenMediaPath = candidate;
        break;
      }
    }
  }

  if (!chosenMediaPath && mediaFiles.length > 0) {
    let bestSize = -1;
    for (const mPath of mediaFiles) {
      const buf = await zip.file(mPath)!.async("nodebuffer");
      if (buf.length > bestSize) {
        bestSize = buf.length;
        chosenMediaPath = mPath;
      }
    }
  }

  let backgroundImageBase64 = "";
  if (chosenMediaPath) {
    const imgBuf = await zip.file(chosenMediaPath)!.async("nodebuffer");
    const ext = chosenMediaPath.split(".").pop()?.toLowerCase() || "png";
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : "image/png";
    backgroundImageBase64 = `data:${mime};base64,${imgBuf.toString("base64")}`;
  }

  // slide1.xml içindeki şekil (SP) ve fotoğraf (PIC) yerleşimlerini oku
  const photoSlots: ITemplateBox[] = [];
  const spBoxes: Array<ITemplateBox & { text: string }> = [];

  const slide1File = zip.file("ppt/slides/slide1.xml");
  if (slide1File) {
    const slide1Xml = await slide1File.async("string");
    const shapes = [...slide1Xml.matchAll(/<p:(sp|pic)\b[\s\S]*?<\/p:\1>/g)];

    for (const m of shapes) {
      const s = m[0];
      const isPic = m[1] === "pic";
      const spPr = s.match(/<p:spPr>[\s\S]*?<\/p:spPr>/)?.[0] || "";
      const off = spPr.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
      const ext = spPr.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
      if (!off || !ext) continue;

      const xIn = Number(off[1]) / 914400;
      const yIn = Number(off[2]) / 914400;
      const wIn = Number(ext[1]) / 914400;
      const hIn = Number(ext[2]) / 914400;
      if (wIn <= 0.1 || hIn <= 0.1) continue;

      const box: ITemplateBox = {
        xPct: Math.max(0, Math.min(98, Math.round((xIn / slideWidthIn) * 1000) / 10)),
        yPct: Math.max(0, Math.min(98, Math.round((yIn / slideHeightIn) * 1000) / 10)),
        wPct: Math.max(2, Math.min(100, Math.round((wIn / slideWidthIn) * 1000) / 10)),
        hPct: Math.max(2, Math.min(100, Math.round((hIn / slideHeightIn) * 1000) / 10)),
      };

      if (isPic) {
        photoSlots.push(box);
      } else {
        const text = [...s.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(" ");
        spBoxes.push({ ...box, text });
      }
    }
  }

  // Fotoğraf slotlarını üstten alta, soldan sağa sırala
  photoSlots.sort((a, b) => {
    const rowDiff = Math.round(a.yPct / 15) - Math.round(b.yPct / 15);
    return rowDiff !== 0 ? rowDiff : a.xPct - b.xPct;
  });

  // Şablon modunu ve kutularını otomatik belirle
  let titleBox: ITemplateBox | null = null;
  let descBox: ITemplateBox | null = null;
  let mode: ITemplateLayoutConfig["mode"] = "classic";

  if (photoSlots.length === 0 && spBoxes.length === 0) {
    // sablon2 / sablon3: Açıklama alanı yok; boş bırakılabilir veya fotoğraf alanı olarak kullanılabilir
    mode = "blank_text";
    titleBox = null;
    descBox = null;
  } else if (photoSlots.length === 0 && spBoxes.length === 1) {
    // sablon2: Üstte başlık kutusu var, açıklama kutusu yok (boş veya fotoğraf alanı)
    mode = "title_only";
    const sp = spBoxes[0];
    titleBox = { xPct: sp.xPct, yPct: sp.yPct, wPct: sp.wPct, hPct: Math.max(sp.hPct, 11) };
    descBox = null;
  } else if (photoSlots.length === 0 && spBoxes.length >= 2) {
    // sablon6: Fotoğrafsız, üst başlık kutusu + alt açıklama kutusu
    mode = "title_and_desc";
    const smallTitle =
      spBoxes.find((b) => /ad[ıi]\s*soyad|mahalle/i.test(b.text)) ||
      spBoxes.find((b) => b.hPct <= 18) ||
      spBoxes[0];
    const largeDesc =
      spBoxes.find((b) => b !== smallTitle && b.hPct > 20) ||
      spBoxes.find((b) => b !== smallTitle);

    titleBox = smallTitle
      ? {
          xPct: smallTitle.xPct,
          yPct: smallTitle.yPct,
          wPct: smallTitle.wPct,
          hPct: Math.max(smallTitle.hPct, 11.5),
        }
      : { xPct: 18.2, yPct: 14.5, wPct: 63.6, hPct: 11.5 };
    descBox = largeDesc
      ? { xPct: largeDesc.xPct, yPct: largeDesc.yPct, wPct: largeDesc.wPct, hPct: largeDesc.hPct }
      : { xPct: 1.3, yPct: 41.3, wPct: 97.5, hPct: 53.9 };
  } else if (photoSlots.length === 1 && spBoxes.length >= 1) {
    // sablon1 (classic): 1 üst-sol fotoğraf alanı + sağ üst başlık + alt açıklama
    mode = "classic";
    const smallTitle =
      spBoxes.find((b) => /ad[ıi]\s*soyad|mahalle/i.test(b.text)) ||
      spBoxes.find((b) => b.hPct <= 18) ||
      spBoxes[0];
    const largeDesc = spBoxes.find((b) => b !== smallTitle && b.hPct > 20);

    titleBox = smallTitle
      ? {
          xPct: smallTitle.xPct,
          yPct: smallTitle.yPct,
          wPct: smallTitle.wPct,
          hPct: Math.max(smallTitle.hPct, 11.5),
        }
      : { xPct: 47.5, yPct: 15.3, wPct: 46.2, hPct: 12.2 };
    descBox = largeDesc
      ? { xPct: largeDesc.xPct, yPct: largeDesc.yPct, wPct: largeDesc.wPct, hPct: largeDesc.hPct }
      : { xPct: 3.2, yPct: 46, wPct: 93.6, hPct: 50.5 };
  } else {
    // sablon4 (4'lü fotoğraf) ve sablon5 (2'li fotoğraf): Fotoğraf şablonu (açıklama alanı yok)
    mode = "multi_slot";
    titleBox = null;
    descBox = null;
  }

  return {
    backgroundImageBase64,
    slideWidthIn,
    slideHeightIn,
    layoutConfig: {
      version: 3,
      mode,
      titleBox,
      descBox,
      photoSlots,
    },
  };
}

function decodeXmlEntitiesServer(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Süper Admin tarafından yüklenen Kapak Şablonu (.pptx) dosyasından
 * arka plan görselini, gömülü logo/görselleri ve başlık/alt başlık metin kutularını çıkarır.
 */
export async function extractCoverPptxInfo(buffer: Buffer): Promise<{
  backgroundImageBase64: string;
  slideWidthIn: number;
  slideHeightIn: number;
  extractedTitle: string;
  coverSpec: ICoverRenderSpec;
}> {
  const zip = await JSZip.loadAsync(buffer);
  let slideWidthIn = 10;
  let slideHeightIn = 7.5;

  const presXmlFile = zip.file("ppt/presentation.xml");
  if (presXmlFile) {
    const presXml = await presXmlFile.async("string");
    const szMatch = presXml.match(/<p:sldSz[^>]*cx=["'](\d+)["'][^>]*cy=["'](\d+)["']/i);
    if (szMatch) {
      const cx = parseInt(szMatch[1], 10);
      const cy = parseInt(szMatch[2], 10);
      if (cx > 0 && cy > 0) {
        slideWidthIn = Math.round((cx / 914400) * 100) / 100;
        slideHeightIn = Math.round((cy / 914400) * 100) / 100;
      }
    }
  }

  const mediaAsDataUri = async (mediaRelTarget: string): Promise<string> => {
    const cleanName = mediaRelTarget.replace(/^(\.\.\/)+media\//i, "").replace(/^ppt\/media\//i, "");
    const path = `ppt/media/${cleanName}`;
    const f = zip.file(path);
    if (!f) return "";
    const imgBuf = await f.async("nodebuffer");
    const ext = cleanName.split(".").pop()?.toLowerCase() || "png";
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : "image/png";
    return `data:${mime};base64,${imgBuf.toString("base64")}`;
  };

  // Slide1 rels haritası (rId -> media/...)
  const slideRelsMap = new Map<string, string>();
  const slide1RelsFile = zip.file("ppt/slides/_rels/slide1.xml.rels");
  if (slide1RelsFile) {
    const relXml = await slide1RelsFile.async("string");
    for (const m of relXml.matchAll(/<Relationship\b[^>]*>/gi)) {
      const tag = m[0];
      const idM = tag.match(/\bId=["']([^"']+)["']/i);
      const targetM = tag.match(/\bTarget=["']([^"']+)["']/i);
      if (idM && targetM) {
        slideRelsMap.set(idM[1], targetM[1]);
      }
    }
  }

  let backgroundImageBase64 = "";

  // 1. Önce slide1 doğrudan arka plan görseli (p:bg -> a:blip r:embed)
  const slide1File = zip.file("ppt/slides/slide1.xml");
  const slide1Xml = slide1File ? await slide1File.async("string") : "";

  const bgSection = slide1Xml.match(/<p:bg\b[\s\S]*?<\/p:bg>/i)?.[0] || "";
  const bgEmbed = bgSection.match(/r:embed=["']([^"']+)["']/i)?.[1];
  if (bgEmbed && slideRelsMap.has(bgEmbed)) {
    backgroundImageBase64 = await mediaAsDataUri(slideRelsMap.get(bgEmbed)!);
  }

  // 2. Yoksa slideLayout / slideMaster arka plan görselini ara
  if (!backgroundImageBase64) {
    const relFiles = Object.keys(zip.files).filter(
      (name) =>
        (name.startsWith("ppt/slideLayouts/_rels/") ||
          name.startsWith("ppt/slideMasters/_rels/")) &&
        name.endsWith(".rels")
    );
    for (const rPath of relFiles) {
      const rXml = await zip.file(rPath)!.async("string");
      const mediaMatch = rXml.match(/Target=["']\.\.\/media\/([^"']+\.(?:png|jpe?g|webp))["']/i);
      if (mediaMatch) {
        backgroundImageBase64 = await mediaAsDataUri(mediaMatch[1]);
        if (backgroundImageBase64) break;
      }
    }
  }

  const images: ICoverImageItem[] = [];
  const texts: ICoverTextItem[] = [];
  const headerTextParts: string[] = [];

  if (slide1Xml) {
    const shapes = [...slide1Xml.matchAll(/<p:(sp|pic)\b[\s\S]*?<\/p:\1>/g)];
    for (const m of shapes) {
      const s = m[0];
      const isPic = m[1] === "pic";
      const spPr = s.match(/<p:spPr>[\s\S]*?<\/p:spPr>/)?.[0] || "";
      const off = spPr.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
      const ext = spPr.match(/<a:ext cx="(\d+)" cy="(\d+)"/);

      if (isPic) {
        if (!off || !ext) continue;
        const xIn = Number(off[1]) / 914400;
        const yIn = Number(off[2]) / 914400;
        const wIn = Number(ext[1]) / 914400;
        const hIn = Number(ext[2]) / 914400;
        if (wIn <= 0.05 || hIn <= 0.05) continue;

        const xPct = Math.max(0, Math.min(99, Math.round((xIn / slideWidthIn) * 1000) / 10));
        const yPct = Math.max(0, Math.min(99, Math.round((yIn / slideHeightIn) * 1000) / 10));
        const wPct = Math.max(1, Math.min(100, Math.round((wIn / slideWidthIn) * 1000) / 10));
        const hPct = Math.max(1, Math.min(100, Math.round((hIn / slideHeightIn) * 1000) / 10));

        const rId = s.match(/<a:blip[^>]*r:embed=["']([^"']+)["']/i)?.[1];
        if (rId && slideRelsMap.has(rId)) {
          const dataUrl = await mediaAsDataUri(slideRelsMap.get(rId)!);
          if (dataUrl) {
            // Tam sayfa kaplayan tek görselse ve arka plan boşsa doğrudan arka plan yap
            if (!backgroundImageBase64 && wPct >= 95 && hPct >= 95 && images.length === 0) {
              backgroundImageBase64 = dataUrl;
            } else {
              images.push({ dataUrl, xPct, yPct, wPct, hPct });
            }
          }
        }
      } else {
        const paragraphs = [...s.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)];
        const paraLines: string[] = [];
        let detectedSz = 0;
        let detectedBold = false;
        let detectedColor = "";
        let detectedAlign: "left" | "center" | "right" = "center";

        for (const pm of paragraphs) {
          const pXml = pm[0];
          const algn = pXml.match(/<a:pPr[^>]*\balgn=["'](l|ctr|r)["']/i)?.[1];
          if (algn === "l") detectedAlign = "left";
          else if (algn === "r") detectedAlign = "right";
          else if (algn === "ctr") detectedAlign = "center";

          const szM = pXml.match(/\bsz=["'](\d+)["']/i);
          if (szM && !detectedSz) {
            detectedSz = Math.round(Number(szM[1]) / 100);
          }
          if (/\bb=["']1["']/i.test(pXml)) {
            detectedBold = true;
          }
          const clrM = pXml.match(/<a:srgbClr[^>]*\bval=["']([0-9A-Fa-f]{6})["']/i);
          if (clrM && !detectedColor) {
            detectedColor = clrM[1].toUpperCase();
          }

          const runTexts = [...pXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
            .map((t) => decodeXmlEntitiesServer(t[1]))
            .join("");
          if (runTexts.trim()) {
            paraLines.push(runTexts.trim());
          }
        }

        const fullText = paraLines.join("\n").trim();
        if (!fullText) continue;

        if (!off || !ext) {
          // Placeholder başlık metin kutuları (koordinatı slideLayout/slideMaster içinde olan üst başlıklar)
          headerTextParts.push(fullText);
          continue;
        }

        const xIn = Number(off[1]) / 914400;
        const yIn = Number(off[2]) / 914400;
        const wIn = Number(ext[1]) / 914400;
        const hIn = Number(ext[2]) / 914400;
        if (wIn <= 0.05 || hIn <= 0.05) continue;

        const xPct = Math.max(0, Math.min(99, Math.round((xIn / slideWidthIn) * 1000) / 10));
        const yPct = Math.max(0, Math.min(99, Math.round((yIn / slideHeightIn) * 1000) / 10));
        const wPct = Math.max(1, Math.min(100, Math.round((wIn / slideWidthIn) * 1000) / 10));
        const hPct = Math.max(1, Math.min(100, Math.round((hIn / slideHeightIn) * 1000) / 10));

        // Üst bölgedeki (yPct < 38) başlık metinlerini kapak adına aktar (kapak adı üstte ortalı çizileceği için çift binmeyi önler)
        if (yPct < 38) {
          headerTextParts.push(fullText);
        } else {
          texts.push({
            text: fullText,
            xPct,
            yPct,
            wPct,
            hPct,
            fontSizePt: Math.min(54, Math.max(11, detectedSz || 24)),
            bold: detectedBold,
            colorHex: detectedColor || "0F172A",
            align: detectedAlign,
          });
        }
      }
    }
  }

  const extractedTitle = headerTextParts.join("\n").trim();

  return {
    backgroundImageBase64,
    slideWidthIn,
    slideHeightIn,
    extractedTitle,
    coverSpec: {
      images,
      texts,
    },
  };
}
