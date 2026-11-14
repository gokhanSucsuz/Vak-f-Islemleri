import zlib from "zlib";
import { promisify } from "util";
import JSZip from "jszip";
import Presentation, { ISlideData } from "@/models/Presentation";
import PresentationMeeting from "@/models/PresentationMeeting";
import type { ITemplateBox, ITemplateLayoutConfig } from "@/models/PresentationTemplate";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export async function compressSlides(slides: ISlideData[]): Promise<Buffer> {
  const json = JSON.stringify(slides);
  return gzip(Buffer.from(json, "utf8"), { level: 9 });
}

export async function decompressSlides(buf: Buffer): Promise<ISlideData[]> {
  if (!buf || buf.length === 0) return [];
  const raw = await gunzip(buf);
  const parsed = JSON.parse(raw.toString("utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Toplantı slaydı indirildikten 12 saat sonra süresi dolmuş toplantıların
 * slayt fotoğraflarını otomatik olarak sistemden siler (metin kayıtları korunur).
 */
export async function purgeExpiredMeetingPhotos(): Promise<number> {
  const now = new Date();
  const expiredMeetings = await PresentationMeeting.find({
    photosPurged: false,
    photosExpireAt: { $lte: now },
  });

  if (expiredMeetings.length === 0) return 0;

  let purgedCount = 0;
  for (const meeting of expiredMeetings) {
    const presentations = await Presentation.find({ meetingId: meeting._id });
    for (const pres of presentations) {
      const slides = await decompressSlides(pres.slidesCompressed);
      const cleaned = slides.map((s) => ({
        ...s,
        photos: [],
      }));
      pres.slidesCompressed = await compressSlides(cleaned);
      await pres.save();
    }
    meeting.photosPurged = true;
    meeting.photosPurgedAt = now;
    await meeting.save();
    purgedCount++;
  }

  return purgedCount;
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
