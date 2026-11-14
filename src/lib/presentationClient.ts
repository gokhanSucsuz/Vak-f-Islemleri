"use client";

import PptxGenJS from "pptxgenjs";

export interface SlideItem {
  fullName: string;
  neighborhood: string;
  photoCount: 0 | 1 | 2 | 4;
  photos: string[];
  description: string;
  descriptionHtml?: string;
  fontFamily?: string;
  fontSize?: number | "auto";
  descTopPct?: number;
  descBottomPct?: number;
  photoWidthPct?: number;
  photoHeightPct?: number;
  photoFitMode?: "contain" | "cover" | "fill";
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

function getImageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width || 4, h: img.height || 3 });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = dataUrl;
  });
}

export function computeAutoFontSizePt(
  lines: string[],
  boxWidthIn: number,
  boxHeightIn: number
): number {
  if (lines.length === 0) return 12.5;
  const usableW = Math.max(2, boxWidthIn - 0.32);
  const usableH = Math.max(1, boxHeightIn - 0.2);

  for (let pt = 13.5; pt >= 7; pt -= 0.5) {
    const charsPerLine = Math.max(14, Math.floor((usableW * 72) / (pt * 0.56)));
    let totalVisualLines = 0;
    for (const line of lines) {
      const len = line.length + 3;
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

function htmlToLinesOfRuns(html: string): RichRun[][] {
  if (typeof window === "undefined" || !html.trim()) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return [];

  const lines: RichRun[][] = [];
  let currentLine: RichRun[] = [];

  const flushLine = () => {
    const combined = currentLine.map((r) => r.text).join("").trim();
    if (combined) lines.push(currentLine);
    currentLine = [];
  };

  const walk = (
    node: Node,
    style: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string }
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent || "").replace(/\u00A0/g, " ");
      if (txt) currentLine.push({ text: txt, ...style });
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

    const isBlock = ["P", "DIV", "LI", "H1", "H2", "H3"].includes(tag);
    if (isBlock && currentLine.length > 0) flushLine();

    el.childNodes.forEach((child) => walk(child, nextStyle));

    if (isBlock) flushLine();
  };

  root.childNodes.forEach((child) => walk(child, {}));
  flushLine();
  return lines;
}

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
    const fontFamily = item.fontFamily || "Verdana";
    const slideTpl =
      (item.templateId && templates.find((t) => t._id === item.templateId)) ||
      defaultTpl;

    if (slideTpl?.backgroundImageBase64) {
      slide.background = { data: slideTpl.backgroundImageBase64 };
    } else {
      slide.background = { color: "E5E7EB" };
    }

    // Sol üst fotoğraf alanı (BEYAZ ARKA PLAN YOK, manuel genişlik/yükseklik destekli)
    const photos = (item.photos || []).filter(Boolean).slice(0, item.photoCount || 4);
    const wPct = Math.min(52, Math.max(20, item.photoWidthPct ?? 41));
    const hPct = Math.min(44, Math.max(22, item.photoHeightPct ?? 41.6));
    const areaX = 0.32 * sx;
    const areaY = 0.18 * sy;
    const areaW = (wPct / 100) * slideW;
    const areaH = (hPct / 100) * slideH;
    const fitMode = item.photoFitMode || "contain";

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

        let drawX = box.x;
        let drawY = box.y;
        let drawW = box.w;
        let drawH = box.h;

        if (fitMode !== "fill") {
          const dims = await getImageDimensions(photoData);
          const imgRatio = dims.w / dims.h;
          const boxRatio = box.w / box.h;
          if (imgRatio > boxRatio) {
            drawH = box.w / imgRatio;
          } else {
            drawW = box.h * imgRatio;
          }
          drawX = box.x + (box.w - drawW) / 2;
          drawY = box.y + (box.h - drawH) / 2;
        }

        slide.addImage({
          data: photoData,
          x: drawX,
          y: drawY,
          w: drawW,
          h: drawH,
          shadow: {
            type: "outer",
            blur: 4,
            offset: 2,
            angle: 45,
            color: "475569",
            opacity: 0.3,
          },
        });
      }
    }

    // Sağ üst Adı Soyadı + Mahalle kutusu (Resmi, kalın puntolu, hafif gölgeli)
    const boxX = Math.max(4.75 * sx, areaX + areaW + 0.25 * sx);
    const boxW = Math.min(4.65 * sx, slideW - boxX - 0.32 * sx);

    slide.addShape(pptx.ShapeType.rect, {
      x: boxX,
      y: 1.15 * sy,
      w: boxW,
      h: 0.92 * sy,
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
          options: {
            fontSize: 15,
            bold: true,
            color: "0F172A",
            breakLine: true,
          },
        },
        {
          text: item.neighborhood || "",
          options: {
            fontSize: 13.5,
            bold: true,
            color: "1E293B",
          },
        },
      ],
      {
        x: boxX + 0.08 * sx,
        y: 1.18 * sy,
        w: boxW - 0.16 * sx,
        h: 0.86 * sy,
        align: "center",
        valign: "middle",
        fontFace: fontFamily,
        shadow: {
          type: "outer",
          blur: 2,
          offset: 1,
          angle: 45,
          color: "94A3B8",
          opacity: 0.4,
        },
      }
    );

    // Açıklama kutusu
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
      line: { color: "E2E8F0", width: 0.75 },
    });

    const richLines = item.descriptionHtml ? htmlToLinesOfRuns(item.descriptionHtml) : [];
    const plainLines = (item.description || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const textLinesForSizing =
      richLines.length > 0
        ? richLines.map((runs) => runs.map((r) => r.text).join(""))
        : plainLines;

    const fontSize =
      item.fontSize && item.fontSize !== "auto"
        ? Number(item.fontSize)
        : computeAutoFontSizePt(textLinesForSizing, descW, descH);

    if (richLines.length > 0) {
      const pptxRuns: PptxGenJS.TextProps[] = [];
      richLines.forEach((runs, lineIdx) => {
        pptxRuns.push({
          text: "➢  ",
          options: { fontSize, bold: true, color: "334155" },
        });
        runs.forEach((r, rIdx) => {
          const isLastRunOfLine = rIdx === runs.length - 1;
          const isLastLine = lineIdx === richLines.length - 1;
          pptxRuns.push({
            text: r.text,
            options: {
              fontSize,
              bold: r.bold,
              italic: r.italic,
              underline: r.underline ? { style: "sng" } : undefined,
              color: r.color || "111827",
              breakLine: isLastRunOfLine && !isLastLine,
              paraSpaceAfter: isLastRunOfLine ? 2 : 0,
            },
          });
        });
      });

      slide.addText(pptxRuns, {
        x: descX + 0.14 * sx,
        y: descY + 0.1 * sy,
        w: descW - 0.28 * sx,
        h: descH - 0.2 * sy,
        valign: "top",
        fontFace: fontFamily,
      });
    } else if (plainLines.length > 0) {
      slide.addText(
        plainLines.map((line, idx) => ({
          text: `➢  ${line}`,
          options: {
            fontSize,
            color: "111827",
            breakLine: idx < plainLines.length - 1,
            paraSpaceAfter: 2,
          },
        })),
        {
          x: descX + 0.14 * sx,
          y: descY + 0.1 * sy,
          w: descW - 0.28 * sx,
          h: descH - 0.2 * sy,
          valign: "top",
          fontFace: fontFamily,
        }
      );
    }
  }

  const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_");
  await pptx.writeFile({
    fileName: safeName.endsWith(".pptx") ? safeName : `${safeName}.pptx`,
  });
}
