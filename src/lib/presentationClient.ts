"use client";

import PptxGenJS from "pptxgenjs";

const cleanedBgCache = new Map<string, string>();

/**
 * Şablon arka plan görselinin sol alt köşesindeki (fppt.com) filigran alanını
 * hemen üstündeki temiz arka plan dokusuyla pürüzsüzce kapatır.
 */
export async function cleanTemplateWatermark(dataUrl: string): Promise<string> {
  if (!dataUrl || typeof window === "undefined") return dataUrl;
  const cached = cleanedBgCache.get(dataUrl);
  if (cached) return cached;

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

    ctx.drawImage(img, 0, 0, w, h);

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
  descTopPct?: number;
  descBottomPct?: number;
  photoWidthPct?: number;
  photoHeightPct?: number;
  photoFitMode?: "contain" | "cover" | "fill";
  templateId?: string;
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
    const layout = slideTpl?.layoutConfig || DEFAULT_TEMPLATE_LAYOUT;

    if (slideTpl?.backgroundImageBase64) {
      const cleanedBg = await cleanTemplateWatermark(slideTpl.backgroundImageBase64);
      slide.background = { data: cleanedBg };
    } else {
      slide.background = { color: "E5E7EB" };
    }

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
      const areaX = (slot.xPct / 100) * slideW;
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
        const areaX = 0.32 * sx;
        const areaW = (wPct / 100) * slideW;
        boxX = Math.max(boxX, areaX + areaW + 0.25 * sx);
        boxW = Math.min(boxW, slideW - boxX - 0.32 * sx);
      }
      const boxY = (tb.yPct / 100) * slideH;
      const boxH = Math.max(0.85 * sy, (tb.hPct / 100) * slideH);

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
            options: { fontSize: 17, bold: true, color: "020617", breakLine: true },
          },
          {
            text: item.neighborhood || "",
            options: { fontSize: 15, bold: true, color: "0F172A" },
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
            opacity: 0.5,
          },
        }
      );
    }

    // 3. AÇIKLAMA KUTUSU (Sadece şablonda descBox varsa çizilir)
    if (layout.descBox) {
      let descX = (layout.descBox.xPct / 100) * slideW;
      let descY = (layout.descBox.yPct / 100) * slideH;
      let descW = (layout.descBox.wPct / 100) * slideW;
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

      const pptxRuns: PptxGenJS.TextProps[] = [];

      if (richLines.length > 0) {
        richLines.forEach((runs, lineIdx) => {
          pptxRuns.push({
            text: "➢  ",
            options: { fontSize, bold: true, color: "0F172A" },
          });
          runs.forEach((r, rIdx) => {
            const isLastRunOfLine = rIdx === runs.length - 1;
            const isLastLine = lineIdx === richLines.length - 1;
            pptxRuns.push({
              text: r.text,
              options: {
                fontSize,
                bold: true,
                italic: r.italic,
                underline: r.underline ? { style: "sng" } : undefined,
                color: r.color || "020617",
                breakLine: isLastRunOfLine && !isLastLine,
                paraSpaceAfter: isLastRunOfLine ? 2 : 0,
              },
            });
          });
        });
      } else if (plainLines.length > 0) {
        plainLines.forEach((line, idx) => {
          pptxRuns.push({
            text: `➢  ${line}`,
            options: {
              fontSize,
              bold: true,
              color: "020617",
              breakLine: idx < plainLines.length - 1,
              paraSpaceAfter: 2,
            },
          });
        });
      }

      if (pptxRuns.length > 0) {
        slide.addText(pptxRuns, {
          x: descX + 0.14 * sx,
          y: descY + 0.1 * sy,
          w: descW - 0.28 * sx,
          h: descH - 0.2 * sy,
          valign: "top",
          fontFace: fontFamily,
        });
      }
    }
  }

  const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_");
  await pptx.writeFile({
    fileName: safeName.endsWith(".pptx") ? safeName : `${safeName}.pptx`,
  });
}
