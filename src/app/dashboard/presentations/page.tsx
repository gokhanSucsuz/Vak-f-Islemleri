"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  Presentation as PresentationIcon,
  Plus,
  Upload,
  FolderOpen,
  Lock,
  Unlock,
  Download,
  Search,
  Eye,
  Edit3,
  Trash2,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Layers,
  Clock,
  Save,
  Sparkles,
  Type,
  MoveVertical,
  Bold,
  Italic,
  Underline,
  Eraser,
  Maximize2,
} from "lucide-react";
import ModernConfirmDialog from "@/components/ModernConfirmDialog";
import {
  SlideItem,
  PresentationTemplateClient,
  DEFAULT_TEMPLATE_LAYOUT,
  SLIDE_FONT_OPTIONS,
  BACKGROUND_PRESETS,
  getPresetBackgroundDataUrl,
  cleanTemplateWatermark,
  compressImageToJpeg,
  exportSlidesToPptx,
} from "@/lib/presentationClient";

interface MeetingItem {
  _id: string;
  title: string;
  meetingDate: string;
  status: "open" | "closed";
  isLocked: boolean;
  authorizedUserId?: { _id: string; name: string; email?: string } | null;
  backgroundPreset?: string;
  openedBy?: { name: string };
  closedBy?: { name: string };
  closedAt?: string;
  downloadedAt?: string;
  photosExpireAt?: string;
  photosPurged: boolean;
  photosPurgedAt?: string;
  recordCount: number;
  totalSlides: number;
}

interface StaffUserOption {
  _id: string;
  name: string;
  email: string;
  role: string;
}

interface PresentationListItem {
  _id: string;
  meetingId: string;
  meetingTitle: string;
  meetingStatus: "open" | "closed";
  summaryTitle: string;
  slideCount: number;
  totalPhotos: number;
  firstPhoto: string;
  createdBy?: { _id: string; name: string };
  createdAt: string;
}

interface OrderedPresentationGroup {
  presentationId: string;
  summaryTitle: string;
  authorName: string;
  slideCount: number;
  firstPhoto: string;
  createdAt: string;
  slides: SlideItem[];
}

function activeSlideNameFallback(slides: SlideItem[]): string {
  return slides.find((s) => s.fullName.trim())?.fullName || "";
}

function emptySlide(defaultTemplateId?: string): SlideItem {
  return {
    fullName: "",
    neighborhood: "",
    photoCount: 1,
    photos: [],
    description: "",
    descriptionHtml: "",
    fontFamily: "Verdana",
    fontSize: "auto",
    titleFontSize: 20,
    titleBold: true,
    descTopPct: 46,
    descBottomPct: 96.5,
    photoWidthPct: 41,
    photoHeightPct: 41.6,
    photoFitMode: "contain",
    templateId: defaultTemplateId || undefined,
    backgroundPreset: "template",
  };
}

/**
 * Zengin Metin Editörü (Kalın, İtalik, Altı Çizili, Renk)
 */
function RichDescriptionEditor({
  slideKey,
  initialHtml,
  initialPlain,
  onChange,
}: {
  slideKey: string;
  initialHtml: string;
  initialPlain: string;
  onChange: (html: string, plain: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (initialHtml) {
      el.innerHTML = initialHtml;
    } else if (initialPlain) {
      el.innerHTML = initialPlain
        .split(/\r?\n/)
        .map((l) => `<p>${l.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
        .join("");
    } else {
      el.innerHTML = "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideKey]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    onChange(el.innerHTML, el.innerText || "");
  };

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    ref.current?.focus();
    emit();
  };

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
      <div className="flex flex-wrap items-center gap-1 px-2.5 py-2 bg-slate-50 border-b border-slate-200">
        <button
          type="button"
          onClick={() => exec("bold")}
          className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700"
          title="Kalın"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => exec("italic")}
          className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700"
          title="İtalik"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => exec("underline")}
          className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700"
          title="Altı Çizili"
        >
          <Underline className="w-3.5 h-3.5" />
        </button>
        <span className="h-4 w-px bg-slate-300 mx-1" />
        {[
          { color: "#111827", label: "Siyah" },
          { color: "#dc2626", label: "Kırmızı" },
          { color: "#1d4ed8", label: "Mavi" },
          { color: "#15803d", label: "Yeşil" },
        ].map((c) => (
          <button
            key={c.color}
            type="button"
            onClick={() => exec("foreColor", c.color)}
            className="w-5 h-5 rounded-full border border-slate-300"
            style={{ backgroundColor: c.color }}
            title={c.label}
          />
        ))}
        <button
          type="button"
          onClick={() => exec("removeFormat")}
          className="ml-auto p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 text-xs flex items-center gap-1"
          title="Biçimi Temizle"
        >
          <Eraser className="w-3.5 h-3.5" />
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        className="min-h-[140px] max-h-[240px] overflow-y-auto px-3.5 py-2.5 text-sm font-bold text-slate-950 focus:outline-none [&_p]:mb-1"
      />
    </div>
  );
}

function splitHtmlToVisualLines(html: string): string[] {
  if (typeof window === "undefined" || !html.trim()) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return [];

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
  const result: string[] = [];
  let buf = "";

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const flush = (wrappers: { open: string; close: string }[]) => {
    const closing = [...wrappers].reverse().map((w) => w.close).join("");
    const candidate = buf + closing;
    const tmp = document.createElement("div");
    tmp.innerHTML = candidate;
    if ((tmp.textContent || "").replace(/\u00A0/g, " ").trim()) {
      result.push(candidate);
    }
    buf = wrappers.map((w) => w.open).join("");
  };

  const walk = (node: Node, wrappers: { open: string; close: string }[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.textContent || "").split(/\r?\n/);
      parts.forEach((part, idx) => {
        if (idx > 0) flush(wrappers);
        buf += escapeHtml(part);
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === "BR") {
      flush(wrappers);
      return;
    }

    if (BLOCK_TAGS.has(tag)) {
      flush(wrappers);
      el.childNodes.forEach((child) => walk(child, wrappers));
      flush(wrappers);
      return;
    }

    const cloneShallow = el.cloneNode(false) as HTMLElement;
    const outer = cloneShallow.outerHTML;
    const gtIdx = outer.indexOf(">");
    const closeTag = `</${tag.toLowerCase()}>`;
    const openTag = gtIdx >= 0 ? outer.slice(0, gtIdx + 1) : "";
    if (openTag && outer.endsWith(closeTag)) {
      const nextWrappers = [...wrappers, { open: openTag, close: closeTag }];
      buf += openTag;
      el.childNodes.forEach((child) => walk(child, nextWrappers));
      buf += closeTag;
    } else {
      el.childNodes.forEach((child) => walk(child, wrappers));
    }
  };

  root.childNodes.forEach((child) => walk(child, []));
  flush([]);
  return result;
}

/**
 * Tek bir slaydın PowerPoint (4:3) canlı görsel önizleme bileşeni.
 * Fotoğraf arkasında beyaz alan yoktur, en-boy manuel ayarlanabilir,
 * başlık kutusu Verdana (veya seçili font) kalın ve gölgelidir.
 */
function SlidePreviewCard({
  slide,
  templates,
  meetingBackgroundPreset,
  onReorderPhotos,
}: {
  slide: SlideItem;
  templates: PresentationTemplateClient[];
  meetingBackgroundPreset?: string;
  onReorderPhotos?: (newPhotos: string[]) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const descBoxRef = useRef<HTMLDivElement>(null);
  const descListRef = useRef<HTMLUListElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const selectedTpl =
    (slide.templateId && templates.find((t) => t._id === slide.templateId)) ||
    templates[0] ||
    null;

  const layout = selectedTpl?.layoutConfig || DEFAULT_TEMPLATE_LAYOUT;
  const fontFamily = slide.fontFamily || "Verdana";
  const allPhotos = (slide.photos || []).filter(Boolean);
  const photos =
    layout.mode === "multi_slot"
      ? allPhotos.slice(0, layout.photoSlots.length)
      : (slide.photoCount || 0) > 0
        ? allPhotos.slice(0, slide.photoCount)
        : [];
  const canDragReorder = Boolean(onReorderPhotos) && photos.length > 1;

  const handlePhotoDrop = (targetIdx: number) => {
    if (
      !onReorderPhotos ||
      dragIdx === null ||
      dragIdx === targetIdx ||
      dragIdx < 0 ||
      targetIdx < 0
    ) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const next = [...allPhotos];
    if (dragIdx < next.length && targetIdx < next.length) {
      const temp = next[dragIdx];
      next[dragIdx] = next[targetIdx];
      next[targetIdx] = temp;
      onReorderPhotos(next);
    }
    setDragIdx(null);
    setOverIdx(null);
  };

  const richLinesHtml = slide.descriptionHtml
    ? splitHtmlToVisualLines(slide.descriptionHtml)
    : [];
  const plainLines = (slide.description || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const displayLines =
    richLinesHtml.length > 0
      ? richLinesHtml.map((h) => ({ isHtml: true, content: h }))
      : plainLines.map((t) => ({ isHtml: false, content: t }));

  const photoW = Math.min(52, Math.max(20, slide.photoWidthPct ?? 41));
  const photoH = Math.min(44, Math.max(22, slide.photoHeightPct ?? 41.6));
  const fitMode = slide.photoFitMode || "contain";

  const titleLeftPct =
    layout.mode === "classic"
      ? Math.max(layout.titleBox?.xPct ?? 47.5, 3.2 + photoW + 2.5)
      : layout.titleBox?.xPct ?? 19;
  const titleWidthPct =
    layout.mode === "classic"
      ? Math.min(46.5, 96.8 - titleLeftPct)
      : layout.titleBox?.wPct ?? 62.6;
  const titleTopPct = layout.titleBox?.yPct ?? 15.3;
  const titleHeightPct = Math.max(11, layout.titleBox?.hPct ?? 12.2);

  const hasDescBox = Boolean(layout.descBox);
  const descLeftPct = layout.mode === "classic" ? 3.2 : layout.descBox?.xPct ?? 3.2;
  const descWidthPct = layout.mode === "classic" ? 93.6 : layout.descBox?.wPct ?? 93.6;
  const minDescTop =
    layout.mode === "classic"
      ? 44.5
      : layout.titleBox
        ? Math.max(20, layout.titleBox.yPct + layout.titleBox.hPct + 2)
        : 25;
  const defaultDescTop = layout.descBox?.yPct ?? 46;
  const defaultDescBottom = Math.min(
    97.5,
    (layout.descBox?.yPct ?? 46) + (layout.descBox?.hPct ?? 50.5)
  );
  const topPct =
    layout.mode === "classic" || layout.mode === "title_and_desc"
      ? Math.min(65, Math.max(minDescTop, slide.descTopPct ?? defaultDescTop))
      : defaultDescTop;
  const bottomPct =
    layout.mode === "classic" || layout.mode === "title_and_desc"
      ? Math.min(97.5, Math.max(topPct + 18, slide.descBottomPct ?? (layout.mode === "classic" ? 96.5 : defaultDescBottom)))
      : Math.min(98, defaultDescBottom);
  const heightPct = bottomPct - topPct;

  const [fittedPx, setFittedPx] = useState(12);
  const [cardScale, setCardScale] = useState(1);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const scale = card.clientWidth / 720;
    setCardScale(scale);

    if (!hasDescBox) return;
    const box = descBoxRef.current;
    const list = descListRef.current;
    if (!box) return;

    if (slide.fontSize && slide.fontSize !== "auto") {
      setFittedPx(Math.max(5.5, Number(slide.fontSize) * scale));
      return;
    }

    if (!list || displayLines.length === 0) {
      setFittedPx(Math.max(8, 12.5 * scale));
      return;
    }

    let size = Math.max(8, 13 * scale);
    list.style.fontSize = `${size}px`;
    list.style.lineHeight = "1.28";

    while (box.scrollHeight > box.clientHeight && size > 5.5) {
      size -= 0.4;
      list.style.fontSize = `${size}px`;
    }
    setFittedPx(size);
  }, [hasDescBox, slide.description, slide.descriptionHtml, slide.fontSize, topPct, bottomPct, displayLines.length]);

  const effectiveDescPt =
    slide.fontSize && slide.fontSize !== "auto"
      ? Number(slide.fontSize)
      : cardScale > 0
        ? Math.round(fittedPx / cardScale)
        : 13;
  const effectiveTitlePt = Math.min(
    26,
    Math.max(effectiveDescPt + 1, Number(slide.titleFontSize ?? 20))
  );
  const titleFontPx = Math.max(10, effectiveTitlePt * cardScale);
  const isTitleBold = slide.titleBold !== false;

  const optionalPhotoArea = layout.titleBox
    ? {
        xPct: 3,
        yPct: Math.min(35, layout.titleBox.yPct + layout.titleBox.hPct + 3),
        wPct: 94,
        hPct: Math.max(40, 95 - (layout.titleBox.yPct + layout.titleBox.hPct + 3)),
      }
    : { xPct: 3, yPct: 4, wPct: 94, hPct: 92 };

  const effectiveBgPreset =
    meetingBackgroundPreset ?? slide.backgroundPreset ?? "template";
  const activeBgImage =
    effectiveBgPreset && effectiveBgPreset !== "template"
      ? getPresetBackgroundDataUrl(effectiveBgPreset) ||
        selectedTpl?.backgroundImageBase64
      : selectedTpl?.backgroundImageBase64;

  return (
    <div
      ref={cardRef}
      className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-slate-300 shadow-md select-none bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300"
      style={{
        fontFamily,
        ...(activeBgImage
          ? {
              backgroundImage: `url(${activeBgImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : {}),
      }}
    >
      {/* 1. FOTOĞRAF ALANLARI (Şablon moduna göre) */}
      {(layout.mode === "classic" ||
        ((layout.mode === "blank_text" || layout.mode === "title_only") &&
          (slide.photoCount || 0) > 0)) && (
        <div
          style={
            layout.mode === "classic"
              ? { left: "3.2%", top: "2.4%", width: `${photoW}%`, height: `${photoH}%` }
              : {
                  left: `${optionalPhotoArea.xPct}%`,
                  top: `${optionalPhotoArea.yPct}%`,
                  width: `${optionalPhotoArea.wPct}%`,
                  height: `${optionalPhotoArea.hPct}%`,
                }
          }
          className="absolute"
        >
          {photos.length > 0 ? (
            <div
              className={`w-full h-full grid gap-1.5 ${
                photos.length === 1
                  ? "grid-cols-1 grid-rows-1"
                  : photos.length === 2
                    ? "grid-cols-2 grid-rows-1"
                    : "grid-cols-2 grid-rows-2"
              }`}
            >
              {photos.map((src, idx) => (
                <div
                  key={idx}
                  draggable={canDragReorder}
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => {
                    if (!canDragReorder) return;
                    e.preventDefault();
                    setOverIdx(idx);
                  }}
                  onDragLeave={() => {
                    if (overIdx === idx) setOverIdx(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handlePhotoDrop(idx);
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setOverIdx(null);
                  }}
                  title={canDragReorder ? "Sürükleyerek yerini değiştirin" : undefined}
                  className={`w-full h-full flex items-center justify-center overflow-hidden rounded-lg transition-all ${
                    canDragReorder ? "cursor-grab active:cursor-grabbing" : ""
                  } ${overIdx === idx && dragIdx !== idx ? "ring-2 ring-blue-500 bg-blue-50/40 scale-[0.98]" : ""} ${
                    dragIdx === idx ? "opacity-50" : ""
                  }`}
                >
                  <img
                    src={src}
                    alt={`Slayt fotoğrafı ${idx + 1}`}
                    draggable={false}
                    className={`drop-shadow-md pointer-events-none rounded-xl ${
                      fitMode === "fill"
                        ? "w-full h-full object-fill"
                        : fitMode === "cover"
                          ? "w-full h-full object-cover"
                          : "max-w-full max-h-full w-auto h-auto object-contain"
                    }`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-full border-2 border-dashed border-slate-400/50 rounded-lg flex flex-col items-center justify-center text-slate-500/80 bg-white/25">
              <ImageIcon className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-medium">
                {slide.photoCount === 0 ? "Fotoğrafsız Slayt" : "Fotoğraf Alanı"}
              </span>
            </div>
          )}
        </div>
      )}

      {layout.mode === "multi_slot" &&
        layout.photoSlots.map((slot, idx) => {
          const src = photos[idx];
          const canDragThis = canDragReorder && Boolean(src);
          return (
            <div
              key={idx}
              draggable={canDragThis}
              onDragStart={() => {
                if (canDragThis) setDragIdx(idx);
              }}
              onDragOver={(e) => {
                if (!canDragReorder || !src) return;
                e.preventDefault();
                setOverIdx(idx);
              }}
              onDragLeave={() => {
                if (overIdx === idx) setOverIdx(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (src) handlePhotoDrop(idx);
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
              title={canDragThis ? "Sürükleyerek yerini değiştirin" : undefined}
              style={{
                left: `${slot.xPct}%`,
                top: `${slot.yPct}%`,
                width: `${slot.wPct}%`,
                height: `${slot.hPct}%`,
              }}
              className={`absolute flex items-center justify-center overflow-hidden rounded-lg transition-all ${
                canDragThis ? "cursor-grab active:cursor-grabbing" : ""
              } ${overIdx === idx && dragIdx !== idx ? "ring-2 ring-blue-500 bg-blue-50/40 scale-[0.98]" : ""} ${
                dragIdx === idx ? "opacity-50" : ""
              }`}
            >
              {src ? (
                <img
                  src={src}
                  alt={`Slot ${idx + 1}`}
                  draggable={false}
                  className={`drop-shadow-md pointer-events-none rounded-xl ${
                    fitMode === "fill"
                      ? "w-full h-full object-fill"
                      : fitMode === "cover"
                        ? "w-full h-full object-cover"
                        : "max-w-full max-h-full w-auto h-auto object-contain"
                  }`}
                />
              ) : (
                <div className="w-full h-full border-2 border-dashed border-slate-400/50 rounded-lg flex flex-col items-center justify-center text-slate-500/80 bg-white/25">
                  <ImageIcon className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-medium">
                    Fotoğraf {idx + 1}
                  </span>
                </div>
              )}
            </div>
          );
        })}

      {/* 2. BAŞLIK KUTUSU (classic, title_only ve title_and_desc şablonlarında — yazıya göre esnek genişler) */}
      {layout.titleBox &&
        (layout.mode === "classic" ||
          layout.mode === "title_only" ||
          layout.mode === "title_and_desc") && (
        <div
          style={
            layout.mode === "classic"
              ? {
                  left: `${titleLeftPct}%`,
                  top: `${titleTopPct}%`,
                  minWidth: `${titleWidthPct}%`,
                  maxWidth: `${Math.max(titleWidthPct, 96.8 - titleLeftPct)}%`,
                  width: "fit-content",
                  minHeight: `${titleHeightPct}%`,
                  height: "auto",
                }
              : {
                  left: "50%",
                  transform: "translateX(-50%)",
                  top: `${titleTopPct}%`,
                  minWidth: `${titleWidthPct}%`,
                  maxWidth: "94%",
                  width: "fit-content",
                  minHeight: `${titleHeightPct}%`,
                  height: "auto",
                }
          }
          className="absolute bg-gradient-to-b from-white via-slate-50 to-slate-100 border border-slate-300 shadow-[0_4px_12px_rgba(15,23,42,0.18)] flex flex-col items-center justify-center px-3 py-1.5 text-center rounded-[4px]"
        >
          <div
            style={{
              fontSize: `${titleFontPx}px`,
              fontWeight: isTitleBold ? 800 : 500,
              textShadow: isTitleBold
                ? "0 1.5px 3px rgba(15, 23, 42, 0.36), 0 0 1px rgba(15, 23, 42, 0.2)"
                : "0 1px 2px rgba(15, 23, 42, 0.2)",
            }}
            className="text-slate-950 leading-tight tracking-tight break-words max-w-full"
          >
            {slide.fullName || "Adı Soyadı"}
          </div>
          <div
            style={{
              fontSize: `${titleFontPx}px`,
              fontWeight: isTitleBold ? 800 : 500,
              textShadow: isTitleBold
                ? "0 1.5px 2.5px rgba(15, 23, 42, 0.28), 0 0 1px rgba(15, 23, 42, 0.14)"
                : "0 1px 2px rgba(15, 23, 42, 0.16)",
            }}
            className="text-slate-900 leading-tight tracking-tight break-words max-w-full mt-0.5"
          >
            {slide.neighborhood || "...... Mahallesi"}
          </div>
        </div>
      )}

      {/* 3. AÇIKLAMA ALANI (Sadece şablonda descBox varsa) */}
      {hasDescBox && (
        <div
          ref={descBoxRef}
          style={{
            left: `${descLeftPct}%`,
            top: `${topPct}%`,
            width: `${descWidthPct}%`,
            height: `${heightPct}%`,
          }}
          className="absolute bg-white border border-slate-200 shadow-sm px-3 py-2 overflow-hidden"
        >
          {displayLines.length > 0 ? (
            <ul
              ref={descListRef}
              style={{ fontSize: `${fittedPx}px`, lineHeight: 1.28, fontFamily }}
              className="space-y-0.5 font-bold text-slate-950"
            >
              {displayLines.map((line, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-slate-900 font-extrabold shrink-0">➢</span>
                  {line.isHtml ? (
                    <span
                      className="break-words"
                      dangerouslySetInnerHTML={{ __html: line.content }}
                    />
                  ) : (
                    <span className="break-words">{line.content}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-slate-400 text-xs space-y-1">
              <p>➢ Açıklama maddeleri burada görünecek...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PresentationsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  const isManager =
    role === "superadmin" ||
    role === "manager" ||
    Boolean((session?.user as any)?.authorizedModules?.includes("presentations"));

  const [templates, setTemplates] = useState<PresentationTemplateClient[]>([]);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [insideFolder, setInsideFolder] = useState<boolean>(true);
  const [staffUsers, setStaffUsers] = useState<StaffUserOption[]>([]);
  const [presentations, setPresentations] = useState<PresentationListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Şablon Modalı
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  // Yeni Toplantı Modalı
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [newMeetingAuthorizedId, setNewMeetingAuthorizedId] = useState("");
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  // Editör State
  const [editorMode, setEditorMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorMeetingId, setEditorMeetingId] = useState<string>("");
  const [slides, setSlides] = useState<SlideItem[]>([emptySlide()]);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [compressingPhotos, setCompressingPhotos] = useState(false);

  // Önizleme Modalı (Tekil)
  const [previewRecord, setPreviewRecord] = useState<{
    item: PresentationListItem;
    title: string;
    authorName: string;
    canModify: boolean;
    slides: SlideItem[];
  } | null>(null);
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0);

  // Toplantı Toplu Önizleme & Anında Açıklama Düzenleme Modalı
  const [bulkPreviewModal, setBulkPreviewModal] = useState<{
    meeting: MeetingItem;
    groups: OrderedPresentationGroup[];
    flatSlides: Array<{
      presentationId: string;
      slideIndex: number;
      authorName: string;
      slide: SlideItem;
    }>;
  } | null>(null);
  const [bulkIdx, setBulkIdx] = useState(0);
  const [savingBulkEdit, setSavingBulkEdit] = useState(false);

  // Toplantı Yönetimi / Sıralama / Birleştirme / İndirme Modalı
  const [manageMeetingModal, setManageMeetingModal] = useState<{
    meeting: MeetingItem;
    orderedPresentations: OrderedPresentationGroup[];
  } | null>(null);
  const [loadingMeetingSlides, setLoadingMeetingSlides] = useState(false);
  const [exportingMeeting, setExportingMeeting] = useState(false);
  const [isBgPickerOpen, setIsBgPickerOpen] = useState(false);

  // Silme Onayı
  const [deleteTarget, setDeleteTarget] = useState<PresentationListItem | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, meetRes] = await Promise.all([
        fetch("/api/presentations/template"),
        fetch("/api/presentations/meetings"),
      ]);
      const tplData = await tplRes.json();
      const meetData = await meetRes.json();

      if (tplRes.ok) {
        const rawTpls: PresentationTemplateClient[] =
          tplData.templates || (tplData.template ? [tplData.template] : []);
        const cleanedTpls = await Promise.all(
          rawTpls.map(async (t) =>
            t.backgroundImageBase64
              ? {
                  ...t,
                  backgroundImageBase64: await cleanTemplateWatermark(
                    t.backgroundImageBase64
                  ),
                }
              : t
          )
        );
        setTemplates(cleanedTpls);
      }
      if (meetRes.ok) {
        const list: MeetingItem[] = meetData.meetings || [];
        setMeetings(list);
        setSelectedMeetingId((prev) => {
          if (prev && list.some((m) => m._id === prev)) return prev;
          const openOne = list.find((m) => m.status === "open");
          return openOne?._id || list[0]?._id || "";
        });
      }
    } catch {
      toast.error("Veriler yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPresentations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedMeetingId) params.set("meetingId", selectedMeetingId);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/presentations?${params.toString()}`);
      const data = await res.json();
      if (res.ok) setPresentations(data.presentations || []);
    } catch {
      // sessiz
    }
  }, [selectedMeetingId, search]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!isManager) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.users)) setStaffUsers(d.users);
      })
      .catch(() => {});
  }, [isManager]);

  useEffect(() => {
    fetchPresentations();
  }, [fetchPresentations]);

  const selectedMeeting = meetings.find((m) => m._id === selectedMeetingId) || null;
  const hasOpenMeeting = meetings.some((m) => m.status === "open");
  const isAuthorizedForSelected =
    Boolean(selectedMeeting?.authorizedUserId?._id) &&
    String(selectedMeeting?.authorizedUserId?._id) === String(userId);
  const canManageSelectedMeeting = isManager || isAuthorizedForSelected;

  // Yeni Şablon Yükle (Birden fazla şablon destekli)
  const handleUploadTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTemplate(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (newTemplateName.trim()) fd.append("name", newTemplateName.trim());
      const res = await fetch("/api/presentations/template", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Şablon yüklenemedi");
      setNewTemplateName("");
      toast.success("Sunu şablonu eklendi.");
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingTemplate(false);
      e.target.value = "";
    }
  };

  const handleDeleteTemplate = async (tplId: string) => {
    try {
      const res = await fetch(`/api/presentations/template?id=${tplId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Şablon silinemedi");
      toast.success("Şablon silindi.");
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Toplantı Aç (Açık toplantı varken açılamaz)
  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeetingTitle.trim()) return;
    setCreatingMeeting(true);
    try {
      const res = await fetch("/api/presentations/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newMeetingTitle.trim(),
          authorizedUserId: newMeetingAuthorizedId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toplantı açılamadı");
      toast.success("Yeni toplantı açıldı.");
      setNewMeetingTitle("");
      setNewMeetingAuthorizedId("");
      setIsNewMeetingOpen(false);
      await fetchAll();
      if (data.meeting?._id) {
        setSelectedMeetingId(data.meeting._id);
        setInsideFolder(true);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreatingMeeting(false);
    }
  };

  // Yeni Sunu Başlat
  const handleStartNew = () => {
    const openMeeting =
      (selectedMeeting?.status === "open" ? selectedMeeting : null) ||
      meetings.find((m) => m.status === "open");

    if (!openMeeting) {
      toast.error("Şu anda açık bir toplantı yok. Önce yöneticinin toplantı açması gerekir.");
      return;
    }

    const isAuthForOpen =
      Boolean(openMeeting.authorizedUserId?._id) &&
      String(openMeeting.authorizedUserId?._id) === String(userId);

    if (openMeeting.isLocked && !isManager && !isAuthForOpen) {
      toast.error(
        "Toplantı slaytları sıralama/kapatma için kilitlenmiştir. Sadece yönetici ve yetkili personel slayt ekleyebilir."
      );
      return;
    }

    setEditingId(null);
    setEditorMeetingId(openMeeting._id);
    setSlides([emptySlide(templates[0]?._id)]);
    setActiveSlideIdx(0);
    setEditorMode(true);
  };

  // Mevcut Sunuyu Düzenle / Önizle / İndir
  const handleOpenRecord = async (
    item: PresentationListItem,
    mode: "preview" | "edit" | "download"
  ) => {
    try {
      const res = await fetch(`/api/presentations/${item._id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sunu alınamadı");
      const loadedSlides: SlideItem[] = data.presentation.slides || [];

      if (mode === "preview") {
        const canModifyItem =
          selectedMeeting?.status === "open" &&
          (canManageSelectedMeeting ||
            (!selectedMeeting.isLocked &&
              String(item.createdBy?._id) === String(userId)));
        setPreviewRecord({
          item,
          title: item.summaryTitle,
          authorName: item.createdBy?.name || "Personel",
          canModify: Boolean(canModifyItem),
          slides: loadedSlides,
        });
        setPreviewSlideIdx(0);
      } else if (mode === "edit") {
        setEditingId(item._id);
        setEditorMeetingId(data.presentation.meetingId);
        setSlides(loadedSlides.length > 0 ? loadedSlides : [emptySlide(templates[0]?._id)]);
        setActiveSlideIdx(0);
        setEditorMode(true);
      } else if (mode === "download") {
        await exportSlidesToPptx({
          slides: loadedSlides,
          fileName: `${item.summaryTitle}.pptx`,
          templates,
          meetingBackgroundPreset: selectedMeeting?.backgroundPreset || "template",
        });
        toast.success("Sunu (.pptx) indirildi.");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Fotoğraf Sıkıştırma & Ekleme
  const handleSlidePhotosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const current = slides[activeSlideIdx];
    const maxAllowed = current.photoCount || 1;
    const remaining = Math.max(0, maxAllowed - current.photos.length);
    const toProcess = files.slice(0, remaining || maxAllowed);

    setCompressingPhotos(true);
    try {
      const maxDim = maxAllowed === 1 ? 1150 : 880;
      const compressed = await Promise.all(
        toProcess.map((f) => compressImageToJpeg(f, maxDim, 0.76))
      );
      setSlides((prev) =>
        prev.map((s, idx) => {
          if (idx !== activeSlideIdx) return s;
          const merged =
            s.photos.length >= maxAllowed
              ? compressed.slice(0, maxAllowed)
              : [...s.photos, ...compressed].slice(0, maxAllowed);
          return { ...s, photos: merged };
        })
      );
      toast.success(`${compressed.length} fotoğraf sıkıştırılarak eklendi.`);
    } catch (err: any) {
      toast.error(err.message || "Fotoğraf işlenemedi.");
    } finally {
      setCompressingPhotos(false);
      e.target.value = "";
    }
  };

  const updateCurrentSlide = (patch: Partial<SlideItem>) => {
    setSlides((prev) =>
      prev.map((s, idx) => (idx === activeSlideIdx ? { ...s, ...patch } : s))
    );
  };

  const updateAllSlidesPerson = (patch: { fullName?: string; neighborhood?: string }) => {
    setSlides((prev) => prev.map((s) => ({ ...s, ...patch })));
  };

  const handleSavePresentation = async () => {
    const primaryName = (slides[0]?.fullName || activeSlideNameFallback(slides)).trim();
    if (!primaryName) {
      toast.error("Lütfen Adı Soyadı alanını doldurun.");
      return;
    }

    const primaryNeighborhood = (slides[0]?.neighborhood || "").trim();
    const normalizedSlides = slides.map((s) => ({
      ...s,
      fullName: s.fullName.trim() || primaryName,
      neighborhood: s.neighborhood.trim() || primaryNeighborhood,
    }));

    setSaving(true);
    try {
      const url = editingId ? `/api/presentations/${editingId}` : "/api/presentations";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: editorMeetingId, slides: normalizedSlides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sunu kaydedilemedi");

      toast.success(editingId ? "Sunu güncellendi." : "Sunu toplantı klasörüne kaydedildi.");
      setEditorMode(false);
      await fetchAll();
      await fetchPresentations();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Kapatılmış Toplantıyı 12 Saat İçinde Tekrar Aç (Yönetici veya Yetkili Personel)
  const handleReopenMeeting = async (meeting: MeetingItem) => {
    try {
      const res = await fetch(`/api/presentations/meetings/${meeting._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toplantı tekrar açılamadı");
      toast.success("Toplantı tekrar açıldı. Artık slayt eklenip düzenlenebilir.");
      await fetchAll();
      await fetchPresentations();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Toplantı Arka Plan Temasını Değiştir (Yönetici veya Yetkili Personel - Tüm Slaytlara Uygulanır)
  const handleSetMeetingBackground = async (meetingId: string, presetId: string) => {
    try {
      const res = await fetch(`/api/presentations/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setBackgroundPreset", backgroundPreset: presetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Arka plan güncellenemedi");
      setMeetings((prev) =>
        prev.map((m) => (m._id === meetingId ? { ...m, backgroundPreset: presetId } : m))
      );
      const label =
        BACKGROUND_PRESETS.find((p) => p.id === presetId)?.label || presetId;
      toast.success(`Tüm toplantı slaytları için arka plan güncellendi: ${label}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Toplantı Toplu Önizleme Modalını Aç
  const openBulkPreview = async (meeting: MeetingItem) => {
    setLoadingMeetingSlides(true);
    try {
      const res = await fetch(`/api/presentations/meetings/${meeting._id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toplantı slaytları alınamadı");
      const groups: OrderedPresentationGroup[] = data.orderedPresentations || [];
      const flatSlides: Array<{
        presentationId: string;
        slideIndex: number;
        authorName: string;
        slide: SlideItem;
      }> = [];
      for (const grp of groups) {
        grp.slides.forEach((s, idx) => {
          flatSlides.push({
            presentationId: grp.presentationId,
            slideIndex: idx,
            authorName: grp.authorName,
            slide: s,
          });
        });
      }
      if (flatSlides.length === 0) {
        toast.error("Bu toplantıda önizlenecek slayt bulunmuyor.");
        return;
      }
      setBulkPreviewModal({
        meeting: data.meeting,
        groups,
        flatSlides,
      });
      setBulkIdx(0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingMeetingSlides(false);
    }
  };

  // Toplu Önizleme Modunda Anında Açıklama Güncelleme (Yönetici & Yetkili Personel)
  const handleBulkSlideInstantSave = async () => {
    if (!bulkPreviewModal) return;
    const current = bulkPreviewModal.flatSlides[bulkIdx];
    if (!current) return;

    const targetGroup = bulkPreviewModal.groups.find(
      (g) => g.presentationId === current.presentationId
    );
    if (!targetGroup) return;

    const updatedGroupSlides = targetGroup.slides.map((s, idx) =>
      idx === current.slideIndex ? current.slide : s
    );

    setSavingBulkEdit(true);
    try {
      const res = await fetch(`/api/presentations/${current.presentationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides: updatedGroupSlides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Slayt güncellenemedi");

      setBulkPreviewModal((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          groups: prev.groups.map((g) =>
            g.presentationId === current.presentationId
              ? { ...g, slides: updatedGroupSlides }
              : g
          ),
        };
      });
      toast.success("Slayt açıklaması anında güncellendi.");
      await fetchPresentations();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingBulkEdit(false);
    }
  };

  // Toplantı Yönetimi Modalını Aç (Kayıt bazlı sıralama - çok sayfalı slaytlar kopmaz!)
  const openManageMeeting = async (meeting: MeetingItem) => {
    setLoadingMeetingSlides(true);
    try {
      const res = await fetch(`/api/presentations/meetings/${meeting._id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Toplantı slaytları alınamadı");
      setManageMeetingModal({
        meeting: data.meeting,
        orderedPresentations: data.orderedPresentations || [],
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingMeetingSlides(false);
    }
  };

  const moveOrderedGroup = (idx: number, dir: -1 | 1) => {
    if (!manageMeetingModal) return;
    const list = [...manageMeetingModal.orderedPresentations];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const temp = list[idx];
    list[idx] = list[target];
    list[target] = temp;
    setManageMeetingModal({ ...manageMeetingModal, orderedPresentations: list });
  };

  const handleAssignAuthorizedUser = async (meetingId: string, authUserId: string) => {
    try {
      const res = await fetch(`/api/presentations/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setAuthorizedUser",
          authorizedUserId: authUserId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Yetkili personel güncellenemedi");
      toast.success("Yetkili personel güncellendi.");
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleMeetingAction = async (
    action: "reorder" | "lock" | "unlock" | "close" | "downloadCombined"
  ) => {
    if (!manageMeetingModal) return;
    const { meeting, orderedPresentations } = manageMeetingModal;
    const presentationOrder = orderedPresentations.map((g) => g.presentationId);

    if (action === "downloadCombined") {
      const combinedSlides = orderedPresentations.flatMap((g) => g.slides);
      if (combinedSlides.length === 0) {
        toast.error("Bu toplantıda indirilecek slayt bulunmuyor.");
        return;
      }
      setExportingMeeting(true);
      try {
        await fetch(`/api/presentations/meetings/${meeting._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reorder", presentationOrder }),
        });

        await exportSlidesToPptx({
          slides: combinedSlides,
          fileName: `${meeting.title}.pptx`,
          templates,
          meetingBackgroundPreset: meeting.backgroundPreset || "template",
        });

        await fetch(`/api/presentations/meetings/${meeting._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "markDownloaded" }),
        });

        toast.success(
          "Tüm slaytlar belirlenen sırayla tek dosya (.pptx) olarak indirildi. Fotoğraflar 12 saat sonra otomatik silinecek."
        );
        await fetchAll();
        const refreshed = await fetch(`/api/presentations/meetings/${meeting._id}`);
        const refData = await refreshed.json();
        if (refreshed.ok) {
          setManageMeetingModal({
            meeting: refData.meeting,
            orderedPresentations: refData.orderedPresentations || [],
          });
        }
      } catch (err: any) {
        toast.error(err.message || "Toplu sunu indirilemedi.");
      } finally {
        setExportingMeeting(false);
      }
      return;
    }

    try {
      const res = await fetch(`/api/presentations/meetings/${meeting._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, presentationOrder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "İşlem başarısız");

      toast.success(
        action === "close"
          ? "Toplantı kapatıldı ve salt okunur hale getirildi. Birleştirilmiş sunuyu indirebilirsiniz."
          : action === "lock"
            ? "Toplantı slaytları sıralama/kapatma için kilitlendi."
            : action === "unlock"
              ? "Toplantı slayt kilidi açıldı."
              : "Slayt sıralaması kaydedildi."
      );
      setManageMeetingModal({
        ...manageMeetingModal,
        meeting: { ...meeting, ...data.meeting },
      });
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeletePresentation = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/presentations/${deleteTarget._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Silinemedi");
      toast.success("Sunu kaydı silindi.");
      setDeleteTarget(null);
      await fetchAll();
      await fetchPresentations();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // EDİTÖR GÖRÜNÜMÜ
  if (editorMode) {
    const activeSlide = slides[activeSlideIdx] || emptySlide(templates[0]?._id);
    const activeTpl =
      (activeSlide.templateId && templates.find((t) => t._id === activeSlide.templateId)) ||
      templates[0] ||
      null;
    const activeLayout = activeTpl?.layoutConfig || DEFAULT_TEMPLATE_LAYOUT;
    const isClassic = activeLayout.mode === "classic";
    const isMultiSlot = activeLayout.mode === "multi_slot";
    const isTitleAndDesc = activeLayout.mode === "title_and_desc";
    const hasDescBox = Boolean(activeLayout.descBox);
    const canChoosePhotoCount = !isMultiSlot && !isTitleAndDesc;
    const hasPhotoFeature = isMultiSlot || (canChoosePhotoCount && activeSlide.photoCount > 0);

    const editorMeeting =
      meetings.find((m) => m._id === editorMeetingId) || selectedMeeting;
    const canManageEditorMeeting =
      isManager ||
      (Boolean(editorMeeting?.authorizedUserId?._id) &&
        String(editorMeeting?.authorizedUserId?._id) === String(userId));
    const editorBgPreset = editorMeeting?.backgroundPreset || "template";
    const currentTop = activeSlide.descTopPct ?? 46;
    const currentBottom = activeSlide.descBottomPct ?? 96.5;
    const currentPhotoW = activeSlide.photoWidthPct ?? 41;
    const currentPhotoH = activeSlide.photoHeightPct ?? 41.6;
    const currentFit = activeSlide.photoFitMode || "contain";

    return (
      <div className="space-y-5 max-w-[1440px] mx-auto">
        <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditorMode(false)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                {editingId ? "Sunuyu Düzenle" : "Yeni Sunu Slaytları Hazırla"}
              </h1>
              <p className="text-xs text-slate-500">
                Çok sayfalı slaytlar hazırlayabilir, şablon ve yazı puntosunu dilediğiniz gibi ayarlayabilirsiniz
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                exportSlidesToPptx({
                  slides,
                  fileName: `${activeSlide.fullName || "sunu"}.pptx`,
                  templates,
                  meetingBackgroundPreset: editorBgPreset,
                })
              }
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              Önizleme İndir (.pptx)
            </button>
            <button
              onClick={handleSavePresentation}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 disabled:opacity-60 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? "Kaydediliyor..." : "Sisteme Kaydet"}
            </button>
          </div>
        </div>

        {/* Slayt Sayfa Sekmeleri */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-wrap items-center gap-2">
          {slides.map((s, idx) => (
            <button
              key={idx}
              onClick={() => setActiveSlideIdx(idx)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                idx === activeSlideIdx
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <span>Sayfa {idx + 1}</span>
              {s.fullName && (
                <span className="opacity-80 max-w-[110px] truncate">
                  ({s.fullName})
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => {
              const first = slides[0];
              setSlides((prev) => [
                ...prev,
                {
                  ...emptySlide(activeSlide.templateId || templates[0]?._id),
                  fullName: first?.fullName || activeSlide.fullName || "",
                  neighborhood: first?.neighborhood || activeSlide.neighborhood || "",
                  fontFamily: activeSlide.fontFamily || "Verdana",
                },
              ]);
              setActiveSlideIdx(slides.length);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Yeni Sayfa Ekle
          </button>
          {slides.length > 1 && (
            <button
              onClick={() => {
                const next = slides.filter((_, i) => i !== activeSlideIdx);
                setSlides(next);
                setActiveSlideIdx(Math.max(0, activeSlideIdx - 1));
              }}
              className="ml-auto px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            >
              Bu Sayfayı Sil
            </button>
          )}
        </div>

        {/* Editör Formu + Canlı Slayt Önizlemesi */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            {/* Şablon ve Yazı Tipi Seçimi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {templates.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Slayt Şablonu
                  </label>
                  <select
                    value={activeSlide.templateId || templates[0]?._id || ""}
                    onChange={(e) => {
                      const nextTplId = e.target.value;
                      const nextTpl = templates.find((t) => t._id === nextTplId);
                      const nextLayout = nextTpl?.layoutConfig || DEFAULT_TEMPLATE_LAYOUT;
                      let nextPhotoCount: 0 | 1 | 2 | 4 = activeSlide.photoCount;
                      if (
                        nextLayout.mode === "title_only" ||
                        nextLayout.mode === "blank_text" ||
                        nextLayout.mode === "title_and_desc"
                      ) {
                        nextPhotoCount = 0;
                      } else if (nextLayout.mode === "multi_slot") {
                        nextPhotoCount = (
                          nextLayout.photoSlots.length >= 3
                            ? 4
                            : nextLayout.photoSlots.length === 2
                              ? 2
                              : 1
                        ) as 0 | 1 | 2 | 4;
                      } else if (nextPhotoCount === 0) {
                        nextPhotoCount = 1;
                      }
                      updateCurrentSlide({
                        templateId: nextTplId,
                        photoCount: nextPhotoCount,
                      });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {templates.map((tpl) => (
                      <option key={tpl._id} value={tpl._id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Yazı Tipi (Font)
                </label>
                <select
                  value={activeSlide.fontFamily || "Verdana"}
                  onChange={(e) => updateCurrentSlide({ fontFamily: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {SLIDE_FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Kurumsal Arka Plan Teması (Sadece Yönetici veya Yetkili Personel — Tüm Slaytlara Uygulanır) */}
            {canManageEditorMeeting ? (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Toplantı Arka Planı (Tüm Slaytlara Uygulanır)
                  </span>
                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                    Yönetici / Yetkili
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {BACKGROUND_PRESETS.map((preset) => {
                    const isActive = editorBgPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          editorMeetingId &&
                          handleSetMeetingBackground(editorMeetingId, preset.id)
                        }
                        title={preset.label}
                        className={`p-1.5 rounded-xl border text-left transition-all ${
                          isActive
                            ? "border-blue-600 ring-2 ring-blue-500/30 bg-white shadow-xs"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div
                          className="w-full aspect-[4/3] rounded-md border border-slate-200 relative overflow-hidden mb-1"
                          style={{ background: preset.previewBg }}
                        >
                          <div
                            className="absolute inset-x-0 top-0 h-1.5"
                            style={{ backgroundColor: preset.accentColor }}
                          />
                        </div>
                        <div className="text-[10px] font-semibold text-slate-700 truncate">
                          {preset.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between">
                <span>
                  Toplantı Arka Planı:{" "}
                  <strong>
                    {BACKGROUND_PRESETS.find((p) => p.id === editorBgPreset)?.label ||
                      "Şablon Varsayılanı"}
                  </strong>
                </span>
                <span className="text-[10px] text-slate-400">
                  Sadece yönetici / yetkili değiştirebilir
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Adı Soyadı <span className="text-red-500">*</span>{" "}
                  <span className="text-[10px] font-normal text-slate-400">
                    (Tüm sayfalara uygulanır)
                  </span>
                </label>
                <input
                  type="text"
                  value={activeSlide.fullName}
                  onChange={(e) => updateAllSlidesPerson({ fullName: e.target.value })}
                  placeholder="Örn: Ahmet YILMAZ"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mahalle / Köy
                </label>
                <input
                  type="text"
                  value={activeSlide.neighborhood}
                  onChange={(e) => updateAllSlidesPerson({ neighborhood: e.target.value })}
                  placeholder="Örn: Karaağaç Mahallesi"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Şablona Özgü Aktif Düzen Bilgisi */}
            <div className="text-[11px] font-medium px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100">
              {activeLayout.mode === "title_only"
                ? "Düzen: Üst Başlık (Açıklama Alanı Yok — Boş veya Fotoğraf Alanı)"
                : activeLayout.mode === "blank_text"
                  ? "Düzen: Serbest Slayt (Açıklama Alanı Yok — Boş veya Fotoğraf Alanı)"
                  : activeLayout.mode === "title_and_desc"
                    ? "Düzen: Fotoğrafsız Üst Başlık + Alt Açıklama"
                    : activeLayout.mode === "multi_slot"
                      ? `Düzen: ${activeLayout.photoSlots.length}'lü Fotoğraf Şablonu (Açıklama Alanı Yok)`
                      : "Düzen: Klasik Üst-Sol Fotoğraf + Sağ Üst Başlık + Alt Açıklama"}
            </div>

            {canChoosePhotoCount && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Slayt Fotoğraf Sayısı
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {([0, 1, 2, 4] as const).map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() =>
                        updateCurrentSlide({
                          photoCount: cnt,
                          photos: cnt === 0 ? [] : activeSlide.photos.slice(0, cnt),
                        })
                      }
                      className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                        activeSlide.photoCount === cnt
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {cnt === 0 ? "Boş (0)" : `${cnt} Foto`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasPhotoFeature && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    {isMultiSlot
                      ? `Şablon Fotoğrafları (${activeSlide.photos.length}/${activeLayout.photoSlots.length} Slot)`
                      : `Fotoğraflar (${activeSlide.photos.length}/${activeSlide.photoCount})`}
                  </label>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    {compressingPhotos ? "Sıkıştırılıyor..." : "Fotoğraf Seç"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple={
                        isMultiSlot
                          ? activeLayout.photoSlots.length > 1
                          : activeSlide.photoCount > 1
                      }
                      disabled={compressingPhotos}
                      onChange={handleSlidePhotosUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {activeSlide.photos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {activeSlide.photos.map((src, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-xl border border-slate-200 overflow-hidden bg-slate-50 group"
                      >
                        <img
                          src={src}
                          alt={`Foto ${idx + 1}`}
                          className="w-full h-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateCurrentSlide({
                              photos: activeSlide.photos.filter((_, i) => i !== idx),
                            })
                          }
                          className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white opacity-90 hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Fotoğraf Manuel En/Boy & Sığdırma Ayarları */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                      {isClassic ? "Fotoğraf Boyutu & En-Boy Modu" : "En-Boy Modu"}
                    </span>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: "contain", label: "Oranı Koru" },
                          { id: "cover", label: "Kırparak Doldur" },
                          { id: "fill", label: "Serbest Yay" },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => updateCurrentSlide({ photoFitMode: m.id })}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                            currentFit === m.id
                              ? "bg-blue-600 text-white"
                              : "bg-white border border-slate-200 text-slate-700"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {isClassic && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 flex justify-between mb-1">
                          <span>Genişlik</span>
                          <span>%{currentPhotoW.toFixed(0)}</span>
                        </label>
                        <input
                          type="range"
                          min={20}
                          max={52}
                          step={1}
                          value={currentPhotoW}
                          onChange={(e) =>
                            updateCurrentSlide({ photoWidthPct: Number(e.target.value) })
                          }
                          className="w-full accent-blue-600"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 flex justify-between mb-1">
                          <span>Yükseklik</span>
                          <span>%{currentPhotoH.toFixed(0)}</span>
                        </label>
                        <input
                          type="range"
                          min={22}
                          max={44}
                          step={1}
                          value={currentPhotoH}
                          onChange={(e) =>
                            updateCurrentSlide({ photoHeightPct: Number(e.target.value) })
                          }
                          className="w-full accent-blue-600"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Başlık Alanı Yazı Ayarları (Başlık kutusu olan şablonlarda) */}
            {activeLayout.titleBox && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-indigo-600" />
                    Başlık Alanı (Adı Soyadı & Mahalle)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateCurrentSlide({ titleBold: true })}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                        activeSlide.titleBold !== false
                          ? "bg-indigo-600 text-white"
                          : "bg-white border border-slate-200 text-slate-700"
                      }`}
                    >
                      Çok Kalın
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentSlide({ titleBold: false })}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                        activeSlide.titleBold === false
                          ? "bg-indigo-600 text-white"
                          : "bg-white border border-slate-200 text-slate-700"
                      }`}
                    >
                      Normal
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
                  <span className="text-[11px] text-slate-500">
                    Başlık Puntosu (Açıklama puntosundan büyük olmalı)
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const minTitlePt =
                        activeSlide.fontSize && activeSlide.fontSize !== "auto"
                          ? Number(activeSlide.fontSize) + 1
                          : 14;
                      const currentTitlePt = Math.min(
                        26,
                        Math.max(minTitlePt, Number(activeSlide.titleFontSize ?? 20))
                      );
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              updateCurrentSlide({
                                titleFontSize: Math.max(minTitlePt, currentTitlePt - 1),
                              })
                            }
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
                          >
                            -
                          </button>
                          <span className="text-xs font-bold w-12 text-center text-slate-800">
                            {currentTitlePt} pt
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateCurrentSlide({
                                titleFontSize: Math.min(26, currentTitlePt + 1),
                              })
                            }
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
                          >
                            +
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Punto ve Açıklama Alanı Boyut Ayarları (Sadece açıklama alanı olan şablonlarda) */}
            {hasDescBox && (
              <>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-blue-600" />
                      Yazı Puntosu
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateCurrentSlide({ fontSize: "auto" })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          !activeSlide.fontSize || activeSlide.fontSize === "auto"
                            ? "bg-blue-600 text-white"
                            : "bg-white border border-slate-200 text-slate-700"
                        }`}
                      >
                        Otomatik Sığdır
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const base =
                            activeSlide.fontSize && activeSlide.fontSize !== "auto"
                              ? Number(activeSlide.fontSize)
                              : 12;
                          updateCurrentSlide({ fontSize: Math.max(7, base - 0.5) });
                        }}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
                      >
                        -
                      </button>
                      <span className="text-xs font-semibold w-12 text-center text-slate-700">
                        {!activeSlide.fontSize || activeSlide.fontSize === "auto"
                          ? "Oto"
                          : `${activeSlide.fontSize} pt`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const base =
                            activeSlide.fontSize && activeSlide.fontSize !== "auto"
                              ? Number(activeSlide.fontSize)
                              : 12;
                          const nextDesc = Math.min(24, base + 0.5);
                          const currentTitle = Number(activeSlide.titleFontSize ?? 20);
                          updateCurrentSlide({
                            fontSize: nextDesc,
                            ...(currentTitle <= nextDesc
                              ? { titleFontSize: Math.min(26, Math.ceil(nextDesc) + 1) }
                              : {}),
                          });
                        }}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {(isClassic || isTitleAndDesc) && (
                    <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/70">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1">
                            <MoveVertical className="w-3 h-3" /> Üst Sınır
                          </span>
                          <span>%{currentTop.toFixed(1)}</span>
                        </label>
                        <input
                          type="range"
                          min={isClassic ? 44.5 : 28}
                          max={62}
                          step={0.5}
                          value={currentTop}
                          onChange={(e) =>
                            updateCurrentSlide({ descTopPct: Number(e.target.value) })
                          }
                          className="w-full accent-blue-600"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1">
                            <MoveVertical className="w-3 h-3" /> Alt Sınır
                          </span>
                          <span>%{currentBottom.toFixed(1)}</span>
                        </label>
                        <input
                          type="range"
                          min={72}
                          max={97.5}
                          step={0.5}
                          value={currentBottom}
                          onChange={(e) =>
                            updateCurrentSlide({ descBottomPct: Number(e.target.value) })
                          }
                          className="w-full accent-blue-600"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="xl:col-span-7 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Canlı Slayt Önizlemesi — Sayfa {activeSlideIdx + 1} / {slides.length}
                </span>
                <div className="flex items-center gap-2">
                  {activeSlide.photos.length > 1 && (
                    <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      Fotoğrafları sürükleyerek yerini değiştirebilirsiniz
                    </span>
                  )}
                  {hasDescBox && (
                    <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Scroll Yok • Sayfaya Otomatik Sığar
                    </span>
                  )}
                </div>
              </div>
              <SlidePreviewCard
                slide={activeSlide}
                templates={templates}
                meetingBackgroundPreset={editorBgPreset}
                onReorderPhotos={(newPhotos) => updateCurrentSlide({ photos: newPhotos })}
              />
            </div>

            {hasDescBox && (
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Açıklama Alanı (Metin Editörü — Her satır otomatik ➢ işareti alır)
                </label>
                <RichDescriptionEditor
                  slideKey={`${editingId || "new"}_${activeSlideIdx}`}
                  initialHtml={activeSlide.descriptionHtml || ""}
                  initialPlain={activeSlide.description || ""}
                  onChange={(html, plain) =>
                    updateCurrentSlide({ descriptionHtml: html, description: plain })
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      {/* Başlık ve Aksiyonlar */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg shadow-blue-500/20">
            <PresentationIcon className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Sunular & Toplantı Slaytları
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Tüm personellerin hazırladığı slaytları tek ekranda görün, sıralayın ve toplantı sonunda tek .pptx dosyası olarak indirin.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isManager && (
            <>
              <button
                onClick={() => setIsTemplateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold transition-colors"
              >
                <Upload className="w-4 h-4" />
                Şablonları Yönet ({templates.length})
              </button>
              <button
                onClick={() => {
                  if (hasOpenMeeting) {
                    toast.error(
                      "Açık bir toplantı varken yeni toplantı açılamaz. Önce mevcut toplantıyı kapatın."
                    );
                    return;
                  }
                  setIsNewMeetingOpen(true);
                }}
                disabled={hasOpenMeeting}
                title={
                  hasOpenMeeting
                    ? "Açık toplantı kapatılmadan yeni toplantı açılamaz"
                    : "Yeni Toplantı Aç"
                }
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-sm font-semibold shadow-md shadow-emerald-500/20 disabled:shadow-none transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Toplantı Aç
              </button>
            </>
          )}
          <button
            onClick={handleStartNew}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Sunu Hazırla
          </button>
        </div>
      </div>

      {/* Toplantı Dosyaları Klasör Görünümü veya Seçili Toplantı Dosyasının İçi */}
      {(!insideFolder || !selectedMeeting) ? (
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-blue-600" />
              Toplantı Dosyaları (Klasörler) — Önce bir toplantı dosyasına girin
            </h2>
          </div>

          {loading ? (
            <div className="text-sm text-slate-500 py-4">Toplantılar yükleniyor...</div>
          ) : meetings.length === 0 ? (
            <div className="text-sm text-slate-500 bg-slate-50 rounded-2xl p-6 text-center border border-dashed border-slate-200">
              Henüz açılmış toplantı bulunmuyor. Yönetici <strong>Toplantı Aç</strong> butonundan toplantı oluşturabilir.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {meetings.map((m) => (
                <div
                  key={m._id}
                  onClick={() => {
                    setSelectedMeetingId(m._id);
                    setInsideFolder(true);
                  }}
                  className="cursor-pointer p-4 rounded-2xl border-2 border-slate-100 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-1.5">
                        <FolderOpen className="w-4 h-4 text-blue-600 shrink-0" />
                        {m.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {new Date(m.meetingDate).toLocaleDateString("tr-TR")} •{" "}
                        {m.recordCount} Kayıt • {m.totalSlides} Slayt
                      </div>
                      {m.authorizedUserId?.name && (
                        <div className="text-[11px] text-indigo-700 font-medium mt-1">
                          Yetkili Personel: {m.authorizedUserId.name}
                        </div>
                      )}
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        m.status === "open"
                          ? m.isLocked
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {m.status === "open" ? (
                        m.isLocked ? (
                          <>
                            <Lock className="w-3 h-3" /> Kilitli
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3 h-3" /> Açık
                          </>
                        )
                      ) : (
                        <>
                          <Lock className="w-3 h-3" /> Salt Okunur
                        </>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toplantı Dosyası Üst Bilgi & Yetki / Kilit Çubuğu */}
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setInsideFolder(false)}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Tüm Toplantı Klasörleri
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">
                      {selectedMeeting.title}
                    </h2>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        selectedMeeting.status === "open"
                          ? selectedMeeting.isLocked
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {selectedMeeting.status === "open"
                        ? selectedMeeting.isLocked
                          ? "Sıralama Kilidi Aktif"
                          : "Açık Toplantı"
                        : "Kapatıldı • Salt Okunur"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(selectedMeeting.meetingDate).toLocaleDateString("tr-TR")} •{" "}
                    {selectedMeeting.recordCount} Kayıt • {selectedMeeting.totalSlides} Slayt
                    {selectedMeeting.authorizedUserId?.name &&
                      ` • Yetkili Personel: ${selectedMeeting.authorizedUserId.name}`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openBulkPreview(selectedMeeting)}
                  disabled={loadingMeetingSlides}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Toplu Önizle ({selectedMeeting.totalSlides})
                </button>

                {isManager && selectedMeeting.status === "open" && (
                  <select
                    value={selectedMeeting.authorizedUserId?._id || ""}
                    onChange={(e) =>
                      handleAssignAuthorizedUser(selectedMeeting._id, e.target.value)
                    }
                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                    title="Yönetici ile birlikte sıralama, düzenleme ve silme yetkisi verilecek personel"
                  >
                    <option value="">Yetkili Personel Seç (Opsiyonel)</option>
                    {staffUsers.map((u) => (
                      <option key={u._id} value={u._id}>
                        Yetkili: {u.name}
                      </option>
                    ))}
                  </select>
                )}

                {canManageSelectedMeeting && selectedMeeting.status === "open" && (
                  <button
                    type="button"
                    onClick={() => setIsBgPickerOpen((p) => !p)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors border ${
                      isBgPickerOpen
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    <ImageIcon className="w-4 h-4" />
                    Arka Plan:{" "}
                    {BACKGROUND_PRESETS.find(
                      (p) => p.id === (selectedMeeting.backgroundPreset || "template")
                    )?.label || "Şablon Varsayılanı"}
                  </button>
                )}

                {canManageSelectedMeeting && selectedMeeting.status === "open" && (
                  <button
                    type="button"
                    onClick={() => openManageMeeting(selectedMeeting)}
                    disabled={loadingMeetingSlides}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                  >
                    <Layers className="w-4 h-4" />
                    Sırala / Kilitle & Toplantıyı Kapat
                  </button>
                )}

                {selectedMeeting.status === "closed" && (
                  <>
                    <button
                      type="button"
                      onClick={() => openManageMeeting(selectedMeeting)}
                      disabled={loadingMeetingSlides}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Birleştirilmiş Sunuyu İndir (.pptx)
                    </button>
                    {canManageSelectedMeeting &&
                      selectedMeeting.closedAt &&
                      Date.now() - new Date(selectedMeeting.closedAt).getTime() <=
                        12 * 60 * 60 * 1000 && (
                        <button
                          type="button"
                          onClick={() => handleReopenMeeting(selectedMeeting)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                          title="Kapatıldıktan sonraki 12 saat içinde tekrar açılabilir"
                        >
                          <Unlock className="w-4 h-4" />
                          Toplantıyı Tekrar Aç
                        </button>
                      )}
                  </>
                )}
              </div>
            </div>

            {canManageSelectedMeeting &&
              selectedMeeting.status === "open" &&
              isBgPickerOpen && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Toplantı Arka Planını Seç (Tüm Slaytlara Uygulanır)
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsBgPickerOpen(false)}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      Kapat
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                    {BACKGROUND_PRESETS.map((preset) => {
                      const isActive =
                        (selectedMeeting.backgroundPreset || "template") === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            handleSetMeetingBackground(selectedMeeting._id, preset.id)
                          }
                          className={`p-1.5 rounded-xl border text-left transition-all ${
                            isActive
                              ? "border-blue-600 ring-2 ring-blue-500/30 bg-white shadow-xs"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div
                            className="w-full aspect-[4/3] rounded-md border border-slate-200 relative overflow-hidden mb-1"
                            style={{ background: preset.previewBg }}
                          >
                            <div
                              className="absolute inset-x-0 top-0 h-1.5"
                              style={{ backgroundColor: preset.accentColor }}
                            />
                          </div>
                          <div className="text-[10px] font-semibold text-slate-700 truncate">
                            {preset.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            {selectedMeeting.status === "closed" && (
              <div className="text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-600 shrink-0" />
                <span>
                  Bu toplantı kapatılmıştır. Sistem üzerinde <strong>salt okunurdur</strong>; ekleme, silme veya düzenleme yapılamaz. Sadece birleştirilmiş sunu indirilip bilgisayarınızda düzenlenebilir.
                </span>
              </div>
            )}

            {selectedMeeting.status === "open" && selectedMeeting.isLocked && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Toplantı slaytları sıralama ve kapatma işlemi için <strong>kilitlenmiştir</strong>. Sadece Yönetici ve Yetkili Personel ({selectedMeeting.authorizedUserId?.name || "belirlenmedi"}) işlem yapabilir.
                </span>
              </div>
            )}

            {selectedMeeting.downloadedAt && (
              <div className="text-xs flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2">
                <Clock className="w-4 h-4 shrink-0" />
                {selectedMeeting.photosPurged ? (
                  <span>Bu toplantının fotoğrafları indirmeden 12 saat sonra otomatik olarak silindi.</span>
                ) : selectedMeeting.photosExpireAt ? (
                  <span>
                    Fotoğraflar{" "}
                    {new Date(selectedMeeting.photosExpireAt).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    tarihinde sistemden otomatik silinecek.
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Toplantı İçindeki Tüm Slaytlar */}
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-base font-bold text-slate-900">
                Toplantıdaki Tüm Slaytlar ({presentations.length})
              </h3>
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Adı Soyadı, mahalle veya personel ara..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {presentations.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                Bu toplantı dosyasında henüz slayt bulunmuyor.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {presentations.map((item) => {
                  const canModify =
                    selectedMeeting.status === "open" &&
                    (canManageSelectedMeeting ||
                      (!selectedMeeting.isLocked &&
                        String(item.createdBy?._id) === String(userId)));
                  return (
                    <div
                      key={item._id}
                      onClick={() => handleOpenRecord(item, "preview")}
                      title="Önizlemek için tıklayın"
                      className="p-4 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md bg-white shadow-sm flex flex-col justify-between gap-3 transition-all cursor-pointer group"
                    >
                      <div className="flex items-start gap-3">
                        {item.firstPhoto ? (
                          <img
                            src={item.firstPhoto}
                            alt="Slayt Thumbnail"
                            className="w-20 h-15 rounded-xl object-cover border border-slate-200 shrink-0 shadow-xs"
                          />
                        ) : (
                          <div className="w-20 h-15 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                            <PresentationIcon className="w-6 h-6" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 group-hover:text-blue-700 text-sm line-clamp-2 transition-colors">
                            {item.summaryTitle}
                          </div>
                          <div className="text-xs font-medium text-blue-700 mt-1">
                            Hazırlayan: {item.createdBy?.name || "Personel"}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {new Date(item.createdAt).toLocaleDateString("tr-TR")}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700">
                            {item.slideCount} Sayfa
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                            {item.totalPhotos} Fotoğraf
                          </span>
                        </div>

                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleOpenRecord(item, "preview")}
                            title="Önizle"
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenRecord(item, "download")}
                            title=".pptx İndir"
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {canModify && (
                            <>
                              <button
                                onClick={() => handleOpenRecord(item, "edit")}
                                title="Düzenle"
                                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(item)}
                                title="Sil"
                                className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Çoklu Şablon Yönetim Modalı (Yönetici) */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                Sunu Şablonlarını Yönet (Birden Fazla Eklenebilir)
              </h3>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Şablon adı (Örn: Klasik Gri, Mavi Tema...)"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <label className="cursor-pointer py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0">
                <Upload className="w-4 h-4" />
                {uploadingTemplate ? "Yükleniyor..." : "Şablon Ekle (.pptx / Görsel)"}
                <input
                  type="file"
                  accept=".pptx,.png,.jpg,.jpeg,.webp"
                  disabled={uploadingTemplate}
                  onChange={handleUploadTemplate}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {templates.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Henüz yüklenmiş şablon yok.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {templates.map((tpl) => (
                    <div
                      key={tpl._id}
                      className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {tpl.name}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {tpl.fileName}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteTemplate(tpl._id)}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-100"
                          title="Şablonu Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {tpl.backgroundImageBase64 && (
                        <img
                          src={tpl.backgroundImageBase64}
                          alt={tpl.name}
                          className="w-full aspect-[4/3] object-cover rounded-xl border border-slate-200"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toplantı Açma Modalı */}
      {isNewMeetingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleCreateMeeting}
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Yeni Toplantı Aç</h3>
              <button
                type="button"
                onClick={() => setIsNewMeetingOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Toplantı Adı
              </label>
              <input
                type="text"
                required
                value={newMeetingTitle}
                onChange={(e) => setNewMeetingTitle(e.target.value)}
                placeholder="Örn: 14.11.2026 Mütevelli Heyeti Toplantısı"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Yetkili Personel (Opsiyonel)
              </label>
              <select
                value={newMeetingAuthorizedId}
                onChange={(e) => setNewMeetingAuthorizedId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Seçilmedi (Sonradan atanabilir)</option>
                {staffUsers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewMeetingOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={creatingMeeting}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
              >
                {creatingMeeting ? "Açılıyor..." : "Toplantıyı Aç"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Slayt Önizleme Modalı */}
      {previewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {previewRecord.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hazırlayan:{" "}
                  <span className="font-semibold text-blue-700">
                    {previewRecord.authorName}
                  </span>{" "}
                  • Sayfa {previewSlideIdx + 1} / {previewRecord.slides.length}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewRecord.canModify ? (
                  <>
                    <button
                      onClick={() => {
                        const target = previewRecord.item;
                        setPreviewRecord(null);
                        handleOpenRecord(target, "edit");
                      }}
                      className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Düzenle
                    </button>
                    <button
                      onClick={() => {
                        const target = previewRecord.item;
                        setPreviewRecord(null);
                        setDeleteTarget(target);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Sil
                    </button>
                  </>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                    Salt Önizleme
                  </span>
                )}
                <button
                  onClick={() => setPreviewRecord(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {previewRecord.slides.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {previewRecord.slides.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPreviewSlideIdx(idx)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors ${
                      idx === previewSlideIdx
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {idx + 1}. Sayfa{s.fullName ? ` • ${s.fullName}` : ""}
                  </button>
                ))}
              </div>
            )}

            <SlidePreviewCard
              slide={previewRecord.slides[previewSlideIdx] || emptySlide()}
              templates={templates}
              meetingBackgroundPreset={selectedMeeting?.backgroundPreset || "template"}
            />

            <div className="flex items-center justify-between">
              <button
                disabled={previewSlideIdx === 0}
                onClick={() => setPreviewSlideIdx((p) => Math.max(0, p - 1))}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Önceki
              </button>
              <button
                disabled={previewSlideIdx >= previewRecord.slides.length - 1}
                onClick={() =>
                  setPreviewSlideIdx((p) =>
                    Math.min(previewRecord.slides.length - 1, p + 1)
                  )
                }
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold disabled:opacity-40 flex items-center gap-1"
              >
                Sonraki <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toplantı Sıralama (Çok Sayfalı Kayıtlar Kopmadan), Kapatma ve Birleştirip İndirme Modalı */}
      {manageMeetingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {manageMeetingModal.meeting.title}
                </h3>
                <p className="text-xs text-slate-500">
                  {manageMeetingModal.orderedPresentations.length} Sunu Kaydı • Çok sayfalı kayıtlar bir arada kalır ve sırası bozulmaz
                </p>
              </div>
              <button
                onClick={() => setManageMeetingModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {manageMeetingModal.orderedPresentations.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-500">
                  Bu toplantıda henüz slayt yok.
                </div>
              ) : (
                manageMeetingModal.orderedPresentations.map((grp, idx) => (
                  <div
                    key={grp.presentationId}
                    className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      {grp.firstPhoto ? (
                        <img
                          src={grp.firstPhoto}
                          alt="Thumb"
                          className="w-14 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 truncate">
                          {grp.summaryTitle}
                        </div>
                        <div className="text-xs text-slate-500">
                          Hazırlayan: <strong className="text-slate-700">{grp.authorName}</strong> •{" "}
                          <span className="text-indigo-700 font-semibold">
                            {grp.slideCount} Sayfa (Birlikte Sıralanır)
                          </span>
                        </div>
                      </div>
                    </div>

                    {manageMeetingModal.meeting.status === "open" && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => moveOrderedGroup(idx, -1)}
                          disabled={idx === 0}
                          className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                          title="Yukarı Taşı"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveOrderedGroup(idx, 1)}
                          disabled={idx === manageMeetingModal.orderedPresentations.length - 1}
                          className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                          title="Aşağı Taşı"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              {manageMeetingModal.meeting.status === "open" ? (
                <div className="flex flex-wrap items-center gap-2">
                  {!manageMeetingModal.meeting.isLocked ? (
                    <button
                      onClick={() => handleMeetingAction("lock")}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Sıralama İçin Kilitle
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMeetingAction("unlock")}
                      className="px-4 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Kilidi Aç
                    </button>
                  )}
                  <button
                    onClick={() => handleMeetingAction("reorder")}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
                  >
                    Sıralamayı Kaydet
                  </button>
                  <button
                    onClick={() => handleMeetingAction("close")}
                    className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Toplantıyı Kapat (Salt Okunur Yap)
                  </button>
                </div>
              ) : (
                <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Kapatılmış Toplantı • Sistem Üzerinde Salt Okunur
                </div>
              )}

              <button
                onClick={() => handleMeetingAction("downloadCombined")}
                disabled={
                  exportingMeeting ||
                  manageMeetingModal.orderedPresentations.length === 0
                }
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {exportingMeeting
                  ? "Birleştiriliyor..."
                  : "Birleştirilmiş Sunuyu İndir (.pptx)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toplu Önizleme & Anında Açıklama Güncelleme Modalı */}
      {bulkPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/75 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-6xl w-full max-h-[94vh] flex flex-col p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-600" />
                  {bulkPreviewModal.meeting.title} — Toplu Slayt Önizleme
                </h3>
                <p className="text-xs text-slate-500">
                  Slayt {bulkIdx + 1} / {bulkPreviewModal.flatSlides.length} • Hazırlayan:{" "}
                  <strong className="text-slate-700">
                    {bulkPreviewModal.flatSlides[bulkIdx]?.authorName}
                  </strong>
                  {bulkPreviewModal.meeting.status === "closed"
                    ? " • Kapatılmış (Salt Okunur)"
                    : canManageSelectedMeeting
                      ? " • Açıklamaları anında düzenleyebilirsiniz"
                      : ""}
                </p>
              </div>
              <button
                onClick={() => setBulkPreviewModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Slayt Önizleme Sahnesi */}
              <div
                className={
                  bulkPreviewModal.meeting.status === "open" && canManageSelectedMeeting
                    ? "lg:col-span-7 space-y-3"
                    : "lg:col-span-12 space-y-3"
                }
              >
                <SlidePreviewCard
                  slide={
                    bulkPreviewModal.flatSlides[bulkIdx]?.slide || emptySlide()
                  }
                  templates={templates}
                  meetingBackgroundPreset={
                    bulkPreviewModal.meeting.backgroundPreset || "template"
                  }
                />

                {/* Slayt Geçiş ve Hızlı Seçim Çubuğu */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    disabled={bulkIdx === 0}
                    onClick={() => setBulkIdx((p) => Math.max(0, p - 1))}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold disabled:opacity-40 flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" /> Önceki Slayt
                  </button>

                  <div className="flex flex-wrap items-center gap-1">
                    {bulkPreviewModal.flatSlides.map((item, idx) => (
                      <button
                        key={`${item.presentationId}_${item.slideIndex}`}
                        onClick={() => setBulkIdx(idx)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          idx === bulkIdx
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                        title={`${item.slide.fullName} (${item.authorName})`}
                      >
                        {idx + 1}. {item.slide.fullName.split(" ")[0]}
                      </button>
                    ))}
                  </div>

                  <button
                    disabled={bulkIdx >= bulkPreviewModal.flatSlides.length - 1}
                    onClick={() =>
                      setBulkIdx((p) =>
                        Math.min(bulkPreviewModal.flatSlides.length - 1, p + 1)
                      )
                    }
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold disabled:opacity-40 flex items-center gap-1"
                  >
                    Sonraki Slayt <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Yönetici / Yetkili Personel İçin Anında Açıklama Düzenleme Paneli */}
              {bulkPreviewModal.meeting.status === "open" && canManageSelectedMeeting && (
                <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Anında Açıklama Düzenle
                    </h4>
                    <span className="text-[11px] font-semibold text-blue-700">
                      {bulkPreviewModal.flatSlides[bulkIdx]?.slide.fullName}
                    </span>
                  </div>

                  <RichDescriptionEditor
                    slideKey={`bulk_${bulkPreviewModal.flatSlides[bulkIdx]?.presentationId}_${bulkPreviewModal.flatSlides[bulkIdx]?.slideIndex}`}
                    initialHtml={
                      bulkPreviewModal.flatSlides[bulkIdx]?.slide.descriptionHtml || ""
                    }
                    initialPlain={
                      bulkPreviewModal.flatSlides[bulkIdx]?.slide.description || ""
                    }
                    onChange={(html, plain) => {
                      setBulkPreviewModal((prev) => {
                        if (!prev) return null;
                        return {
                          ...prev,
                          flatSlides: prev.flatSlides.map((fs, i) =>
                            i === bulkIdx
                              ? {
                                  ...fs,
                                  slide: {
                                    ...fs.slide,
                                    descriptionHtml: html,
                                    description: plain,
                                  },
                                }
                              : fs
                          ),
                        };
                      });
                    }}
                  />

                  <button
                    type="button"
                    onClick={handleBulkSlideInstantSave}
                    disabled={savingBulkEdit}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {savingBulkEdit
                      ? "Güncelleniyor..."
                      : "Değişikliği Kaydet (Anında Güncelle)"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Silme Onayı */}
      <ModernConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeletePresentation}
        title="Sunu Kaydını Sil"
        message={`"${deleteTarget?.summaryTitle || ""}" sunu kaydını silmek istediğinizden emin misiniz?`}
        confirmText="Evet, Sil"
        cancelText="Vazgeç"
      />
    </div>
  );
}
