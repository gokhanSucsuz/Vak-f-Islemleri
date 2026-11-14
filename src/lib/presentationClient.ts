"use client";

import PptxGenJS from "pptxgenjs";

export interface SlideItem {
  fullName: string;
  neighborhood: string;
  photoCount: 0 | 1 | 2 | 4;
  photos: string[];
  description: string;
  fontSize?: number | "auto";
  descTopPct?: number;
  descBottomPct?: number;
  templateId?: string;
}

export interface PresentationTemplateClient {
  _id: string;
  name: string;
  fileName: string;
  backgroundImageBase64: string;
  slideWidthIn: number;
  slideHeightIn: number;
}

/**
 * Yüklenen fotoğrafı en-boy oranını bozmadan yeniden boyutlandırıp
 * sıkıştırılmış JPEG data URI formatına dönüştürür (~40-90 KB, net görüntü).
 */
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

function getImageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width || 4, h: img.height || 3 });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = dataUrl;
  });
}

/**
 * Açıklama satırlarını kutu genişliği ve yüksekliğine göre taşmayacak
 * en büyük puntoya (7pt - 14pt) otomatik sığdırır.
 */
export function computeAutoFontSizePt(
  lines: string[],
  boxWidthIn: number,
  boxHeightIn: number
): number {
  if (lines.length === 0) return 13;
  const usableW = Math.max(2, boxWidthIn - 0.32);
  const usableH = Math.max(1, boxHeightIn - 0.2);

  for (let pt = 14; pt >= 7; pt -= 0.5) {
    // Ortalama karakter genişliği ~ pt * 0.52 pt (1 inch = 72pt)
    const charsPerLine = Math.max(15, Math.floor((usableW * 72) / (pt * 0.52)));
    let totalVisualLines = 0;
    for (const line of lines) {
      const len = line.length + 3; // "➢  " dahil
      totalVisualLines += Math.max(1, Math.ceil(len / charsPerLine));
    }
    const lineHeightIn = (pt * 1.32) / 72;
    const totalHeightIn = totalVisualLines * lineHeightIn + lines.length * (2.5 / 72);
    if (totalHeightIn <= usableH) {
      return pt;
    }
  }
  return 7;
}

/**
 * Verilen slayt listesini (her slayt kendi seçili şablonuyla birlikte)
 * PowerPoint (.pptx) dosyası olarak indirir.
 */
export async function exportSlidesToPptx(params: {
  slides: SlideItem[];
  fileName: string;
  templates?: PresentationTemplateClient[];
  template?: PresentationTemplateClient | null;
}) {
  const { slides, fileName, templates = [], template = null } = params;
  const pptx = new PptxGenJS();

  const defaultTpl = templates[0] || template;
  const slideW = defaultTpl?.slideWidthIn || 10;
  const slideH = defaultTpl?.slideHeightIn || 7.5;
  const sx = slideW / 10;
  const sy = slideH / 7.5;

  pptx.defineLayout({ name: "CUSTOM_LAYOUT", width: slideW, height: slideH });
  pptx.layout = "CUSTOM_LAYOUT";

  for (const item of slides) {
    const slide = pptx.addSlide();
    const slideTpl =
      (item.templateId && templates.find((t) => t._id === item.templateId)) ||
      defaultTpl;

    if (slideTpl?.backgroundImageBase64) {
      slide.background = { data: slideTpl.backgroundImageBase64 };
    } else {
      slide.background = { color: "E5E7EB" };
    }

    // Sol üst fotoğraf alanı (yukarıdan aşağı slaydın ~yarısına denk gelen alan)
    const photos = (item.photos || []).filter(Boolean).slice(0, item.photoCount || 4);
    const areaX = 0.32 * sx;
    const areaY = 0.18 * sy;
    const areaW = 4.1 * sx;
    const areaH = 3.12 * sy;

    if (photos.length > 0) {
      const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
      if (photos.length === 1) {
        boxes.push({ x: areaX, y: areaY, w: areaW, h: areaH });
      } else if (photos.length === 2) {
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

      for (let i = 0; i < photos.length; i++) {
        const box = boxes[i];
        const photoData = photos[i];
        slide.addShape(pptx.ShapeType.rect, {
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          fill: { color: "FFFFFF" },
          line: { color: "CBD5E1", width: 1 },
        });

        const pad = 0.06 * Math.min(sx, sy);
        const innerW = box.w - pad * 2;
        const innerH = box.h - pad * 2;
        const dims = await getImageDimensions(photoData);
        const imgRatio = dims.w / dims.h;
        const boxRatio = innerW / innerH;

        let drawW = innerW;
        let drawH = innerH;
        if (imgRatio > boxRatio) {
          drawH = innerW / imgRatio;
        } else {
          drawW = innerH * imgRatio;
        }
        const drawX = box.x + pad + (innerW - drawW) / 2;
        const drawY = box.y + pad + (innerH - drawH) / 2;

        slide.addImage({
          data: photoData,
          x: drawX,
          y: drawY,
          w: drawW,
          h: drawH,
        });
      }
    }

    // Sağ üst Adı Soyadı + Mahalle kutusu
    slide.addShape(pptx.ShapeType.rect, {
      x: 4.75 * sx,
      y: 1.15 * sy,
      w: 4.62 * sx,
      h: 0.85 * sy,
      fill: { color: "FFFFFF" },
      line: { color: "D1D5DB", width: 0.75 },
    });

    slide.addText(
      [
        {
          text: item.fullName || "",
          options: { fontSize: 16, bold: true, color: "000000", breakLine: true },
        },
        {
          text: item.neighborhood || "",
          options: { fontSize: 15, bold: true, color: "000000" },
        },
      ],
      {
        x: 4.8 * sx,
        y: 1.18 * sy,
        w: 4.52 * sx,
        h: 0.79 * sy,
        align: "center",
        valign: "middle",
        fontFace: "Calibri",
      }
    );

    // Açıklama kutusu (fotoğraf alanının altına ve sayfa sınırına kelepçeli)
    const topPct = Math.min(65, Math.max(44.5, item.descTopPct ?? 46));
    const bottomPct = Math.min(97.5, Math.max(topPct + 18, item.descBottomPct ?? 96.5));
    const descX = 0.32 * sx;
    const descY = (topPct / 100) * slideH;
    const descW = 9.36 * sx;
    const descH = ((bottomPct - topPct) / 100) * slideH;

    slide.addShape(pptx.ShapeType.rect, {
      x: descX,
      y: descY,
      w: descW,
      h: descH,
      fill: { color: "FFFFFF" },
      line: { color: "E5E7EB", width: 0.75 },
    });

    const lines = (item.description || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const fontSize =
      item.fontSize && item.fontSize !== "auto"
        ? Number(item.fontSize)
        : computeAutoFontSizePt(lines, descW, descH);

    if (lines.length > 0) {
      slide.addText(
        lines.map((line, idx) => ({
          text: `➢  ${line}`,
          options: {
            fontSize,
            color: "111827",
            breakLine: idx < lines.length - 1,
            paraSpaceAfter: 2,
          },
        })),
        {
          x: descX + 0.14 * sx,
          y: descY + 0.1 * sy,
          w: descW - 0.28 * sx,
          h: descH - 0.2 * sy,
          valign: "top",
          fontFace: "Calibri",
        }
      );
    }
  }

  const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_");
  await pptx.writeFile({
    fileName: safeName.endsWith(".pptx") ? safeName : `${safeName}.pptx`,
  });
}
