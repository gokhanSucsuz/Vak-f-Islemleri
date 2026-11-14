import zlib from "zlib";
import { promisify } from "util";
import JSZip from "jszip";
import Presentation, { ISlideData } from "@/models/Presentation";
import PresentationMeeting from "@/models/PresentationMeeting";

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

  // slideMaster veya slideLayout ilişkilerinde arka plan görseli ara
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
    // En büyük medya dosyasını seç (genellikle arka plan görselidir)
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

  return {
    backgroundImageBase64,
    slideWidthIn,
    slideHeightIn,
  };
}
