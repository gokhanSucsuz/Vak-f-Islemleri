"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from "react";
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
  MoveHorizontal,
  Bold,
  Italic,
  Underline,
  Eraser,
  Maximize2,
  Minimize2,
  Play,
  Crosshair,
  LayoutGrid,
  List,
  GripVertical,
  Crop,
  Scissors,
  Sun,
  Frame,
  Copy,
  CopyPlus,
} from "lucide-react";
import ModernConfirmDialog from "@/components/ModernConfirmDialog";
import PaginationControls from "@/components/PaginationControls";
import PhotoCropModal from "@/components/PhotoCropModal";
import ProtectedCanvasImage from "@/components/ProtectedCanvasImage";
import {
  SlideItem,
  PresentationTemplateClient,
  DEFAULT_TEMPLATE_LAYOUT,
  BACKGROUND_PRESETS,
  PHOTO_FRAME_PRESETS,
  SLIDESHOW_TRANSITION_PRESETS,
  getPhotoFrameWebStyle,
  getPresetBackgroundDataUrl,
  cleanTemplateWatermark,
  compressImageToJpeg,
  exportSlidesToPptx,
  computeCoverTitleFontSizePt,
  extractCleanPlainLines,
  sanitizeSlideDescriptionHtml,
  shieldedFetchJson,
  shieldedSendJson,
  clearProtectedBitmapCache,
} from "@/lib/presentationClient";

interface MeetingItem {
  _id: string;
  title: string;
  meetingDate: string;
  status: "open" | "closed";
  isLocked: boolean;
  authorizedUserId?: { _id: string; name: string; email?: string } | null;
  backgroundPreset?: string;
  photoFramePreset?: string;
  transitionPreset?: string;
  openedBy?: { name: string };
  closedBy?: { name: string };
  closedAt?: string;
  downloadedAt?: string;
  photosExpireAt?: string;
  photosPurged: boolean;
  photosPurgedAt?: string;
  combinedPptxSize?: number;
  combinedPptxUpdatedAt?: string | null;
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
  meetingDate?: string | null;
  meetingBackgroundPreset?: string;
  meetingPhotoFramePreset?: string;
  summaryTitle: string;
  slideCount: number;
  totalPhotos: number;
  photoBytes?: number;
  presentationBytes?: number;
  firstPhoto: string;
  createdBy?: { _id: string; name: string };
  lockedBy?: { _id: string; name: string } | null;
  createdAt: string;
}

interface OrderedPresentationGroup {
  presentationId: string;
  summaryTitle: string;
  authorName: string;
  slideCount: number;
  firstPhoto: string;
  createdAt: string;
  isPartial?: boolean;
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
    photoLeftPct: 3.2,
    photoFitMode: "contain",
    templateId: defaultTemplateId || undefined,
    backgroundPreset: "template",
  };
}

/**
 * Modern Zengin Metin Editörü (Kalın, İtalik, Altı Çizili, Kurumsal Renkler + Her Satırda Canlı ➢ Simgesi)
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
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [formatState, setFormatState] = useState({
    bold: false,
    italic: false,
    underline: false,
  });
  const [isEmpty, setIsEmpty] = useState(true);
  const [lineCount, setLineCount] = useState(0);
  const [statusAnnouncement, setStatusAnnouncement] = useState("");

  const normalizeRootParagraphs = (el: HTMLDivElement) => {
    const rawText = (el.innerText || "").replace(/\u00A0/g, " ").trim();
    if (!rawText) {
      if (el.innerHTML !== "<p><br></p>") {
        el.innerHTML = "<p><br></p>";
      }
      return;
    }
    // İlk satır çıplak text node olarak yazıldıysa <p> içine sar ki ➢ simgesi 1. satırda da anında görünsün
    const first = el.firstChild;
    if (first && first.nodeType === Node.TEXT_NODE) {
      const p = document.createElement("p");
      while (el.firstChild && el.firstChild.nodeType !== Node.ELEMENT_NODE) {
        p.appendChild(el.firstChild);
      }
      el.insertBefore(p, el.firstChild);
      const sel = window.getSelection();
      if (sel && document.activeElement === el) {
        const range = document.createRange();
        range.selectNodeContents(p);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  const syncMetrics = (el: HTMLDivElement) => {
    const plain = (el.innerText || "").replace(/\u00A0/g, " ");
    const lines = plain
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    setIsEmpty(lines.length === 0);
    setLineCount(lines.length);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Eski veya kopyala-yapıştır ile gelmiş tüm yabancı font/boyut HTML etiketlerini temizleyerek yükle
    const cleanHtml = sanitizeSlideDescriptionHtml(initialHtml || "", initialPlain || "");
    el.innerHTML = cleanHtml || "<p><br></p>";
    syncMetrics(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideKey]);

  // Toolbar klavye erişilebilirliği: focusgroup desteklemeyen tarayıcılarda roving tabindex yedeği
  useEffect(() => {
    const bar = toolbarRef.current;
    if (!bar || typeof HTMLElement === "undefined") return;
    if ("focusGroup" in HTMLElement.prototype) return;

    const getItems = () =>
      Array.from(bar.querySelectorAll<HTMLButtonElement>("button"));
    const initItems = getItems();
    initItems.forEach((b, i) => {
      b.tabIndex = i === 0 ? 0 : -1;
    });

    const onFocusIn = (e: FocusEvent) => {
      const items = getItems();
      const target = e.target as HTMLButtonElement;
      if (items.includes(target)) {
        items.forEach((b) => {
          b.tabIndex = b === target ? 0 : -1;
        });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const items = getItems();
      const idx = items.indexOf(document.activeElement as HTMLButtonElement);
      if (idx < 0 || items.length === 0) return;
      const rtl = getComputedStyle(bar).direction === "rtl";
      let nextIdx = -1;
      if (e.key === "ArrowRight") {
        nextIdx = (idx + (rtl ? -1 : 1) + items.length) % items.length;
      } else if (e.key === "ArrowLeft") {
        nextIdx = (idx + (rtl ? 1 : -1) + items.length) % items.length;
      } else if (e.key === "Home") {
        nextIdx = 0;
      } else if (e.key === "End") {
        nextIdx = items.length - 1;
      }
      if (nextIdx >= 0) {
        e.preventDefault();
        items[nextIdx]?.focus();
      }
    };

    bar.addEventListener("focusin", onFocusIn);
    bar.addEventListener("keydown", onKeyDown);
    return () => {
      bar.removeEventListener("focusin", onFocusIn);
      bar.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const refreshSelectionState = useCallback(() => {
    const el = ref.current;
    const sel = typeof document !== "undefined" ? document.getSelection() : null;
    if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
    try {
      setFormatState({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshSelectionState);
    return () => document.removeEventListener("selectionchange", refreshSelectionState);
  }, [refreshSelectionState]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    normalizeRootParagraphs(el);
    syncMetrics(el);
    const cleanedLines = extractCleanPlainLines(el.innerText || "");
    const cleanedPlain = cleanedLines.join("\n");
    if (!cleanedPlain) {
      onChange("", "");
    } else {
      const cleanHtml = sanitizeSlideDescriptionHtml(el.innerHTML, cleanedPlain);
      onChange(cleanHtml, cleanedPlain);
    }
  };

  const insertPlainTextSafely = (rawPlain: string, rawHtmlFallback = "") => {
    let sourceText = rawPlain;
    if (!sourceText && rawHtmlFallback && typeof window !== "undefined") {
      const parsed = new DOMParser().parseFromString(rawHtmlFallback, "text/html");
      sourceText = parsed.body?.innerText || parsed.body?.textContent || "";
    }
    const lines = extractCleanPlainLines(sourceText);
    if (lines.length === 0) return;

    ref.current?.focus();
    const html = lines
      .map(
        (l) =>
          `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
      )
      .join("");
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
      document.execCommand("insertHTML", false, html);
    } catch {
      if (ref.current) {
        ref.current.innerHTML =
          ref.current.innerHTML === "<p><br></p>"
            ? html
            : `${ref.current.innerHTML}${html}`;
      }
    }
    emit();
    setStatusAnnouncement("Yapıştırılan yazı düz metin olarak tek tip Verdana fontuyla eklendi");
  };

  const exec = (cmd: string, val?: string, announceMsg?: string) => {
    ref.current?.focus();
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
      document.execCommand(cmd, false, val);
    } catch {
      // ignore
    }
    refreshSelectionState();
    emit();
    if (announceMsg) {
      setStatusAnnouncement(announceMsg);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/95 overflow-hidden bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/12 transition-all">
      <p role="status" className="visually-hidden">
        {statusAnnouncement}
      </p>

      {/* Modern Kurumsal Biçimlendirme Araç Çubuğu */}
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Açıklama metni biçimlendirme araçları"
        {...({ focusgroup: "toolbar wrap" } as any)}
        className="pres-editor-toolbar flex flex-wrap items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-slate-200/90"
      >
        <div role="group" aria-label="Yazı stili" className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={formatState.bold}
            aria-label="Kalın"
            title="Kalın (Ctrl+B)"
            onClick={() => exec("bold")}
            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 flex items-center justify-center transition-colors"
          >
            <Bold className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={formatState.italic}
            aria-label="İtalik"
            title="İtalik (Ctrl+I)"
            onClick={() => exec("italic")}
            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 flex items-center justify-center transition-colors"
          >
            <Italic className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={formatState.underline}
            aria-label="Altı çizili"
            title="Altı Çizili (Ctrl+U)"
            onClick={() => exec("underline")}
            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 flex items-center justify-center transition-colors"
          >
            <Underline className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <span
          role="separator"
          aria-orientation="vertical"
          className="h-5 border-l border-slate-300/90 mx-0.5"
        />

        <div role="group" aria-label="Metin rengi" className="flex items-center gap-1.5">
          {[
            { color: "#0f172a", label: "Kurum Siyahı" },
            { color: "#dc2626", label: "Vurgu Kırmızısı" },
            { color: "#1d4ed8", label: "Kurumsal Mavi" },
            { color: "#15803d", label: "Zümrüt Yeşili" },
            { color: "#881337", label: "Resmi Bordo" },
          ].map((c) => (
            <button
              key={c.color}
              type="button"
              aria-label={`Renk: ${c.label}`}
              title={`Yazı Rengi: ${c.label}`}
              onClick={() => exec("foreColor", c.color, `Yazı rengi ${c.label} yapıldı`)}
              className="w-6 h-6 rounded-lg border border-slate-200 bg-white hover:scale-105 flex items-center justify-center transition-transform"
            >
              <span
                aria-hidden="true"
                className="w-3.5 h-3.5 rounded-full shadow-2xs ring-1 ring-black/10"
                style={{ backgroundColor: c.color }}
              />
            </button>
          ))}
        </div>

        <span
          role="separator"
          aria-orientation="vertical"
          className="h-5 border-l border-slate-300/90 mx-0.5 ml-auto"
        />

        <button
          type="button"
          aria-label="Biçimi temizle"
          title="Biçimi Temizle"
          onClick={() => exec("removeFormat", undefined, "Metin biçimlendirmesi temizlendi")}
          className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200/80 hover:border-rose-200 text-[11px] font-bold flex items-center gap-1 transition-colors"
        >
          <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Temizle</span>
        </button>
      </div>

      {/* Canlı ➢ Madde İmli Modern Metin Yazım Alanı */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-empty={isEmpty ? "true" : "false"}
        data-placeholder="Açıklama maddesini yazın (Enter ile yeni ➢ satırı eklenir)..."
        onFocus={() => {
          const el = ref.current;
          if (!el) return;
          try {
            document.execCommand("defaultParagraphSeparator", false, "p");
          } catch {
            // ignore
          }
          normalizeRootParagraphs(el);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) {
            // Shift+Enter da yeni ➢ satırı oluştursun ki slayttaki madde yapısıyla %100 aynı kalsın
            e.preventDefault();
            document.execCommand("insertParagraph", false);
            emit();
          }
        }}
        onPaste={(e) => {
          // Her türlü Word/Excel/PowerPoint/Web kopyala-yapıştır işleminde yabancı fontları %100 engelle; düz metin yapıştır
          e.preventDefault();
          const plain = e.clipboardData?.getData("text/plain") || "";
          const htmlFallback = e.clipboardData?.getData("text/html") || "";
          insertPlainTextSafely(plain, htmlFallback);
        }}
        onDrop={(e) => {
          // Sürükle-bırak ile metin bırakıldığında da yabancı font/biçim girmesini engelle
          e.preventDefault();
          const plain = e.dataTransfer?.getData("text/plain") || "";
          const htmlFallback = e.dataTransfer?.getData("text/html") || "";
          insertPlainTextSafely(plain, htmlFallback);
        }}
        onInput={emit}
        className="pres-rich-editor min-h-[156px] max-h-[260px] overflow-y-auto px-3.5 py-3 text-sm font-bold text-slate-950 bg-gradient-to-b from-white to-slate-50/40 focus:outline-none leading-relaxed"
      />

      {/* Alt Bilgi Çubuğu */}
      <div className="px-3.5 py-1.5 bg-slate-50/90 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-slate-500 flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-100 text-blue-800 font-black text-[10px]">
            ➢
          </span>
          Yapıştırılan yazılar otomatik düz metne çevrilir (Tek Tip: Verdana)
        </span>
        <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 tabular-nums shrink-0">
          {lineCount} Madde
        </span>
      </div>
    </div>
  );
}

function formatBytesLabel(bytes?: number): string {
  const b = Number(bytes || 0);
  if (b <= 0) return "0 KB";
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function splitHtmlToVisualLines(html: string): string[] {
  if (typeof window === "undefined" || !html.trim()) return [];
  // Önce tüm yabancı font-family, font-size, arka plan ve kopyalanmış madde işaretlerini arındır!
  const cleanHtml = sanitizeSlideDescriptionHtml(html);
  if (!cleanHtml) return [];
  const doc = new DOMParser().parseFromString(`<div>${cleanHtml}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return [];

  return Array.from(root.querySelectorAll("p"))
    .map((p) => p.innerHTML)
    .filter((inner) => inner.replace(/<[^>]+>/g, "").trim().length > 0);
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
  meetingPhotoFramePreset,
  projectorMode = false,
  onReorderPhotos,
  onMaxSafeFontSizeChange,
}: {
  slide: SlideItem;
  templates: PresentationTemplateClient[];
  meetingBackgroundPreset?: string;
  meetingPhotoFramePreset?: string;
  projectorMode?: boolean;
  onReorderPhotos?: (newPhotos: string[]) => void;
  onMaxSafeFontSizeChange?: (maxPt: number) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
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
  // Tüm sistemde tek tip kurumsal standart yazı tipi (Verdana)
  const fontFamily = "Verdana, Geneva, sans-serif";
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
  const plainLines = extractCleanPlainLines(slide.description || "");

  const displayLines =
    richLinesHtml.length > 0
      ? richLinesHtml.map((h) => ({ isHtml: true, content: h }))
      : plainLines.map((t) => ({ isHtml: false, content: t }));

  const photoW = Math.min(52, Math.max(20, slide.photoWidthPct ?? 41));
  const photoH = Math.min(44, Math.max(22, slide.photoHeightPct ?? 41.6));
  const photoLeft = Math.min(30, Math.max(0, slide.photoLeftPct ?? 3.2));
  const fitMode = slide.photoFitMode || "contain";

  const titleLeftPct =
    layout.mode === "classic"
      ? Math.max(layout.titleBox?.xPct ?? 47.5, photoLeft + photoW + 2.5)
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

  const [fittedPx, setFittedPx] = useState(12.5);
  const [cardScale, setCardScale] = useState(1);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const updateScale = () => {
      if (wrapper.clientWidth > 0) {
        setCardScale(wrapper.clientWidth / 720);
      }
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!hasDescBox) return;
    const box = descBoxRef.current;
    const list = descListRef.current;
    if (!box) return;

    const runFit = () => {
      const boxEl = descBoxRef.current;
      const listEl = descListRef.current;
      if (!boxEl) return;

      if (!listEl || displayLines.length === 0) {
        setFittedPx(
          slide.fontSize && slide.fontSize !== "auto"
            ? Math.max(5.5, Number(slide.fontSize))
            : 13.5
        );
        onMaxSafeFontSizeChange?.(24);
        return;
      }

      // Önce bu kutu ve metin için taşmayan mutlak maksimum güvenli puntoyu bul
      // py-2 (8px üst + 8px alt = 16px) + 2px güvenlik payı = 18px iç boşluk garantisi
      const innerMaxH = Math.max(20, boxEl.clientHeight - 18);
      listEl.style.lineHeight = "1.26";

      let maxSafe = 22;
      listEl.style.fontSize = `${maxSafe}px`;
      while (
        (listEl.scrollHeight > innerMaxH || boxEl.scrollHeight > boxEl.clientHeight) &&
        maxSafe > 5.25
      ) {
        maxSafe = Math.round((maxSafe - 0.25) * 100) / 100;
        listEl.style.fontSize = `${maxSafe}px`;
      }
      onMaxSafeFontSizeChange?.(maxSafe);

      // Manuel punto seçilmiş olsa dahi ASLA kutu dışına taşmasına izin verme (maxSafe ile sınırla!)
      const requested =
        slide.fontSize && slide.fontSize !== "auto"
          ? Math.max(5.25, Number(slide.fontSize))
          : Math.min(15, maxSafe);
      const finalPx = Math.min(requested, maxSafe);
      listEl.style.fontSize = `${finalPx}px`;
      setFittedPx(finalPx);
    };

    runFit();
    const ro = new ResizeObserver(runFit);
    ro.observe(box);
    if (typeof document !== "undefined" && (document as any).fonts?.ready) {
      (document as any).fonts.ready.then(runFit).catch(() => {});
    }
    return () => ro.disconnect();
  }, [
    hasDescBox,
    slide.description,
    slide.descriptionHtml,
    slide.fontSize,
    topPct,
    bottomPct,
    displayLines.length,
    onMaxSafeFontSizeChange,
  ]);

  const effectiveDescPt = Math.round(fittedPx * 10) / 10;
  const effectiveTitlePt = Math.min(
    26,
    Math.max(effectiveDescPt + 1, Number(slide.titleFontSize ?? 20))
  );
  const titleFontPx = effectiveTitlePt;
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
  const activeFramePreset = meetingPhotoFramePreset || "none";
  const hasActiveFrame = activeFramePreset !== "none";
  const frameImgStyle = getPhotoFrameWebStyle(activeFramePreset, false);

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full aspect-[4/3] overflow-hidden select-none bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 ${
        projectorMode
          ? "rounded-none border-0 shadow-[0_0_90px_rgba(0,0,0,0.92)]"
          : "rounded-xl border border-slate-300 shadow-md"
      }`}
    >
      <div
        ref={cardRef}
        className="relative origin-top-left"
        style={{
          width: "720px",
          height: "540px",
          transform: `scale(${cardScale})`,
          fontFamily,
        }}
      >
      {activeBgImage && (
        <ProtectedCanvasImage
          src={activeBgImage}
          fit="cover"
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      )}
      {/* 1. FOTOĞRAF ALANLARI (Şablon moduna göre) */}
      {(layout.mode === "classic" ||
        ((layout.mode === "blank_text" || layout.mode === "title_only") &&
          (slide.photoCount || 0) > 0)) && (
        <div
          style={
            layout.mode === "classic"
              ? { left: `${photoLeft}%`, top: "2.4%", width: `${photoW}%`, height: `${photoH}%` }
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
                  className={`w-full h-full flex items-center justify-center ${
                    hasActiveFrame ? "overflow-visible p-1" : "overflow-hidden rounded-lg"
                  } transition-all ${
                    canDragReorder ? "cursor-grab active:cursor-grabbing" : ""
                  } ${overIdx === idx && dragIdx !== idx ? "ring-2 ring-blue-500 bg-blue-50/40 scale-[0.98]" : ""} ${
                    dragIdx === idx ? "opacity-50" : ""
                  }`}
                >
                  <ProtectedCanvasImage
                    src={src}
                    alt={`Slayt fotoğrafı ${idx + 1}`}
                    fit={fitMode}
                    fillSlotAspect={fitMode === "contain"}
                    style={frameImgStyle}
                    className={`${hasActiveFrame ? "" : "drop-shadow-md rounded-xl"} pointer-events-none ${
                      fitMode === "contain" ? "max-w-full max-h-full" : "w-full h-full"
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
              className={`absolute flex items-center justify-center ${
                hasActiveFrame ? "overflow-visible p-1" : "overflow-hidden rounded-lg"
              } transition-all ${
                canDragThis ? "cursor-grab active:cursor-grabbing" : ""
              } ${overIdx === idx && dragIdx !== idx ? "ring-2 ring-blue-500 bg-blue-50/40 scale-[0.98]" : ""} ${
                dragIdx === idx ? "opacity-50" : ""
              }`}
            >
              {src ? (
                <ProtectedCanvasImage
                  src={src}
                  alt={`Slot ${idx + 1}`}
                  fit={fitMode}
                  fillSlotAspect={fitMode === "contain"}
                  style={frameImgStyle}
                  className={`${hasActiveFrame ? "" : "drop-shadow-md rounded-xl"} pointer-events-none ${
                    fitMode === "contain" ? "max-w-full max-h-full" : "w-full h-full"
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
    </div>
  );
}

/**
 * Süper Admin tarafından yüklenen Kapak Şablonunu (Sayfa 1) 4:3 sahnede birebir çizen bileşen.
 */
function CoverSlidePreviewCard({
  cover,
  projectorMode = false,
}: {
  cover: PresentationTemplateClient;
  projectorMode?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [cardScale, setCardScale] = useState(1);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const updateScale = () => {
      if (wrapper.clientWidth > 0) {
        setCardScale(wrapper.clientWidth / 720);
      }
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full aspect-[4/3] overflow-hidden select-none bg-[#0b192c] ${
        projectorMode
          ? "rounded-none border-0 shadow-[0_0_90px_rgba(0,0,0,0.92)]"
          : "rounded-xl border border-slate-300 shadow-md"
      }`}
    >
      <div
        className="relative origin-top-left"
        style={{
          width: "720px",
          height: "540px",
          transform: `scale(${cardScale})`,
          fontFamily: "Verdana, Geneva, sans-serif",
        }}
      >
        {cover.backgroundImageBase64 && (
          <ProtectedCanvasImage
            src={cover.backgroundImageBase64}
            fit="cover"
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
        )}

        {(cover.coverSpec?.images || []).map((imgBox, idx) => (
          <div
            key={idx}
            style={{
              left: `${imgBox.xPct}%`,
              top: `${imgBox.yPct}%`,
              width: `${imgBox.wPct}%`,
              height: `${imgBox.hPct}%`,
            }}
            className="absolute flex items-center justify-center pointer-events-none"
          >
            <ProtectedCanvasImage
              src={imgBox.dataUrl}
              fit="contain"
              className="w-full h-full"
            />
          </div>
        ))}

        {/* Kapak Adı: Slaytın En Üstünden Başlayarak Yatayda Tam Ortalı, Kalın & Gölgeli Kurumsal Başlık */}
        {Boolean((cover.name || "").trim()) && (
          <div
            style={{
              left: "1.8%",
              top: "2.8%",
              width: "96.4%",
              maxHeight: "36.5%",
              fontSize: `${computeCoverTitleFontSizePt(cover.name)}px`,
              fontWeight: 800,
              lineHeight: 1.54,
              color: "#0A0F1A",
              textShadow:
                "0 2px 4px rgba(15, 23, 42, 0.42), 0 0 1.5px rgba(15, 23, 42, 0.28)",
            }}
            className="absolute flex items-start justify-center text-center whitespace-pre-line overflow-hidden pointer-events-none z-10 px-1"
          >
            <span className="w-full">{cover.name.trim()}</span>
          </div>
        )}

        {(cover.coverSpec?.texts || [])
          .filter((txtBox) => txtBox.yPct >= 38)
          .map((txtBox, idx) => (
            <div
              key={idx}
              style={{
                left: `${txtBox.xPct}%`,
                top: `${txtBox.yPct}%`,
                width: `${txtBox.wPct}%`,
                height: `${txtBox.hPct}%`,
                fontSize: `${txtBox.fontSizePt}px`,
                fontWeight: txtBox.bold ? 800 : 600,
                color: `#${txtBox.colorHex || "0F172A"}`,
                textAlign: txtBox.align || "center",
              }}
              className="absolute flex items-center justify-center px-2 leading-snug whitespace-pre-line pointer-events-none"
            >
              <span className="w-full">{txtBox.text}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

type BulkFlatSlideItem = {
  presentationId: string;
  slideIndex: number;
  groupIndex: number;
  groupSlideCount: number;
  authorName: string;
  slide: SlideItem;
  isCoverSlide?: boolean;
  coverTemplate?: PresentationTemplateClient;
};

function buildBulkFlatSlides(
  groups: OrderedPresentationGroup[],
  activeCover?: PresentationTemplateClient | null
): BulkFlatSlideItem[] {
  const flat: BulkFlatSlideItem[] = [];
  if (activeCover) {
    flat.push({
      presentationId: "__COVER__",
      slideIndex: 0,
      groupIndex: -1,
      groupSlideCount: 1,
      authorName: "Kurumsal Kapak",
      isCoverSlide: true,
      coverTemplate: activeCover,
      slide: {
        ...emptySlide(),
        fullName:
          (activeCover.name || "Toplantı Kapak Slaytı")
            .replace(/\s*\n+\s*/g, " — ")
            .trim() || "Toplantı Kapak Slaytı",
        neighborhood: "",
        description: "",
        descriptionHtml: "",
      },
    });
  }
  groups.forEach((grp, gIdx) => {
    grp.slides.forEach((s, idx) => {
      flat.push({
        presentationId: grp.presentationId,
        slideIndex: idx,
        groupIndex: gIdx,
        groupSlideCount: grp.slides.length,
        authorName: grp.authorName,
        slide: s,
      });
    });
  });
  return flat;
}

/**
 * PowerPoint Sol Şerit İçin Hafif, Çok Hızlı ve Tut-Sürükle Sıralama Destekli Mini Slayt Önizleme Kartı
 */
function SlideMiniThumbnail({
  index,
  isActive,
  slide,
  authorName,
  templates,
  isCoverSlide = false,
  coverTemplate,
  meetingBackgroundPreset,
  meetingPhotoFramePreset,
  onClick,
  groupIndex,
  groupSlideIndex,
  groupSlideCount,
  canReorder,
  canMovePrev,
  canMoveNext,
  isBeingDragged,
  dragTranslateX,
  dragTranslateY,
  showDropBefore,
  showDropAfter,
  onDragHandlePointerDown,
  onMoveGroupStep,
}: {
  index: number;
  isActive: boolean;
  slide: SlideItem;
  authorName?: string;
  templates: PresentationTemplateClient[];
  isCoverSlide?: boolean;
  coverTemplate?: PresentationTemplateClient;
  meetingBackgroundPreset?: string;
  meetingPhotoFramePreset?: string;
  onClick: () => void;
  groupIndex?: number;
  groupSlideIndex?: number;
  groupSlideCount?: number;
  canReorder?: boolean;
  canMovePrev?: boolean;
  canMoveNext?: boolean;
  isBeingDragged?: boolean;
  dragTranslateX?: number;
  dragTranslateY?: number;
  showDropBefore?: boolean;
  showDropAfter?: boolean;
  onDragHandlePointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onMoveGroupStep?: (delta: -1 | 1) => void;
}) {
  const defaultTpl = templates[0] || null;
  const activeTpl =
    (slide.templateId && templates.find((t) => t._id === slide.templateId)) ||
    defaultTpl;
  const presetId = meetingBackgroundPreset || slide.backgroundPreset || "template";
  const presetObj = BACKGROUND_PRESETS.find((p) => p.id === presetId);
  const usePresetBg = presetId !== "template" && presetObj;
  const firstPhoto = slide.photos?.[0] || "";
  const secondPhoto = slide.photos?.[1] || "";
  const plainLines = (slide.description || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3);

  const isMultiSlideGroup = (groupSlideCount || 1) > 1;
  const isFirstInGroup = (groupSlideIndex || 0) === 0;

  return (
    <div
      data-filmstrip-idx={index}
      data-filmstrip-group-idx={groupIndex}
      style={
        isBeingDragged
          ? {
              transform: `translate3d(${dragTranslateX || 0}px, ${dragTranslateY || 0}px, 0)`,
              zIndex: 35,
            }
          : undefined
      }
      className={`group w-36 sm:w-44 lg:w-full shrink-0 rounded-2xl p-1.5 sm:p-2 transition-shadow duration-150 relative flex items-start gap-1.5 sm:gap-2 ${
        isBeingDragged
          ? "bg-blue-50 ring-2 ring-blue-600 shadow-2xl shadow-blue-900/25 opacity-95"
          : isActive
            ? "bg-blue-600/12 ring-2 ring-blue-600 shadow-md shadow-blue-900/10"
            : "bg-white hover:bg-slate-100/90 border border-slate-200/80 hover:border-slate-300"
      }`}
    >
      {/* PowerPoint Bırakma Hedefi Çizgisi (Üst / Sol Boşluk) */}
      {showDropBefore && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-1.5 inset-y-1 w-1 lg:inset-x-1 lg:-top-1.5 lg:bottom-auto lg:w-auto lg:h-1 rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.85)] z-40"
        />
      )}

      {/* PowerPoint Bırakma Hedefi Çizgisi (Alt / Sağ Boşluk) */}
      {showDropAfter && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-1.5 inset-y-1 w-1 lg:inset-x-1 lg:-bottom-1.5 lg:top-auto lg:w-auto lg:h-1 rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.85)] z-40"
        />
      )}

      {/* Sol Şerit: Sıra Numarası + Tut-Sürükle Tutamacı + Hızlı Taşıma Okları */}
      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
        <span
          className={`w-5 h-5 rounded-md text-[10px] font-extrabold flex items-center justify-center transition-colors ${
            isActive
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-slate-200/80 text-slate-600 group-hover:bg-slate-300"
          }`}
        >
          {index + 1}
        </span>

        {canReorder && isFirstInGroup && (
          <>
            <button
              type="button"
              data-drag-handle="true"
              aria-label={`${index + 1}. slaytı tut ve sürükleyerek sırala (${slide.fullName || "Slayt"})`}
              title="Tut ve sürükleyerek sırala (Alt + Yukarı/Aşağı Ok ile klavyeden taşı)"
              onPointerDown={onDragHandlePointerDown}
              onKeyDown={(e) => {
                if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowLeft")) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (canMovePrev) onMoveGroupStep?.(-1);
                } else if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowRight")) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (canMoveNext) onMoveGroupStep?.(1);
                }
              }}
              style={{
                touchAction: "none",
                WebkitUserSelect: "none",
                userSelect: "none",
              }}
              className="w-6 h-7 rounded-lg bg-slate-100 hover:bg-blue-100 active:bg-blue-200 text-slate-500 hover:text-blue-700 border border-slate-200/90 flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>

            <div className="flex lg:flex-col items-center gap-0.5">
              <button
                type="button"
                disabled={!canMovePrev}
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveGroupStep?.(-1);
                }}
                aria-label={`${slide.fullName || "Slayt"} kaydını bir sıra yukarı taşı`}
                title="Bir sıra öne taşı"
                className="w-5 h-5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-700 disabled:opacity-30 flex items-center justify-center transition-colors"
              >
                <ArrowUp className="w-3 h-3 -rotate-90 lg:rotate-0" />
              </button>
              <button
                type="button"
                disabled={!canMoveNext}
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveGroupStep?.(1);
                }}
                aria-label={`${slide.fullName || "Slayt"} kaydını bir sıra aşağı taşı`}
                title="Bir sıra arkaya taşı"
                className="w-5 h-5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-700 disabled:opacity-30 flex items-center justify-center transition-colors"
              >
                <ArrowDown className="w-3 h-3 -rotate-90 lg:rotate-0" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Ana Tıklanabilir Önizleme Gövdesi */}
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 text-left space-y-1 sm:space-y-1.5 cursor-pointer focus:outline-none"
      >
        {/* 4:3 Mini Slayt Sahnesi */}
        {isCoverSlide && coverTemplate ? (
          <div
            className={`w-full aspect-[4/3] rounded-lg overflow-hidden relative border transition-all bg-[#0b192c] ${
              isActive ? "border-amber-500 shadow-xs" : "border-amber-300/80"
            }`}
          >
            {coverTemplate.backgroundImageBase64 && (
              <ProtectedCanvasImage
                src={coverTemplate.backgroundImageBase64}
                fit="cover"
                className="absolute inset-0 w-full h-full pointer-events-none"
              />
            )}
            {(coverTemplate.coverSpec?.images || []).map((imgBox, idx) => (
              <div
                key={idx}
                style={{
                  left: `${imgBox.xPct}%`,
                  top: `${imgBox.yPct}%`,
                  width: `${imgBox.wPct}%`,
                  height: `${imgBox.hPct}%`,
                }}
                className="absolute flex items-center justify-center pointer-events-none"
              >
                <ProtectedCanvasImage
                  src={imgBox.dataUrl}
                  fit="contain"
                  className="w-full h-full"
                />
              </div>
            ))}
            {Boolean((coverTemplate.name || "").trim()) && (
              <div
                style={{
                  textShadow: "0 1px 2px rgba(15, 23, 42, 0.35)",
                }}
                className="absolute inset-x-1 top-[3.5%] z-10 text-center text-[5px] sm:text-[5.5px] font-black leading-[1.3] text-slate-950 whitespace-pre-line line-clamp-3 pointer-events-none"
              >
                {coverTemplate.name.trim()}
              </div>
            )}
            <span className="absolute right-1 bottom-1 z-10 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[6.5px] font-black uppercase tracking-wider shadow-xs">
              KAPAK
            </span>
          </div>
        ) : (
        <div
          className={`w-full aspect-[4/3] rounded-lg overflow-hidden relative border transition-all ${
            isActive ? "border-blue-500 shadow-xs" : "border-slate-200/90"
          }`}
          style={{
            background: usePresetBg
              ? presetObj.previewBg
              : "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
          }}
        >
          {!usePresetBg && activeTpl?.backgroundImageBase64 && (
            <ProtectedCanvasImage
              src={activeTpl.backgroundImageBase64}
              fit="cover"
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
          )}
          {usePresetBg && (
            <div
              className="absolute inset-x-0 top-0 h-1"
              style={{ backgroundColor: presetObj.accentColor }}
            />
          )}

          {isMultiSlideGroup && (
            <span className="absolute right-1 top-1 z-10 px-1 py-0.5 rounded bg-slate-900/75 text-white text-[7px] font-bold leading-none">
              {(groupSlideIndex || 0) + 1}/{groupSlideCount}
            </span>
          )}

          {/* Üst Kısım: Fotoğraf + Başlık */}
          <div className="absolute inset-x-1.5 top-1.5 h-[42%] flex items-center gap-1.5">
            {firstPhoto ? (
              <div
                style={
                  meetingPhotoFramePreset && meetingPhotoFramePreset !== "none"
                    ? getPhotoFrameWebStyle(meetingPhotoFramePreset, true)
                    : undefined
                }
                className="w-[42%] h-full rounded-[4px] overflow-hidden border border-white/80 shadow-2xs bg-slate-200 flex gap-0.5 shrink-0"
              >
                <ProtectedCanvasImage
                  src={firstPhoto}
                  alt=""
                  fit="cover"
                  className={secondPhoto ? "w-1/2 h-full" : "w-full h-full"}
                />
                {secondPhoto && (
                  <ProtectedCanvasImage
                    src={secondPhoto}
                    alt=""
                    fit="cover"
                    className="w-1/2 h-full"
                  />
                )}
              </div>
            ) : (
              <div className="w-[34%] h-full rounded-[4px] bg-slate-900/5 border border-slate-400/20 flex items-center justify-center shrink-0">
                <PresentationIcon className="w-3 h-3 text-slate-400" />
              </div>
            )}

            <div className="flex-1 min-w-0 px-0.5">
              <div className="text-[7px] leading-[9px] font-extrabold text-slate-900 truncate">
                {slide.fullName || "İsimsiz Slayt"}
              </div>
              {slide.neighborhood && (
                <div className="text-[6px] leading-[8px] font-semibold text-slate-600 truncate">
                  ({slide.neighborhood})
                </div>
              )}
            </div>
          </div>

          {/* Alt Kısım: Mini Açıklama Satırları */}
          <div className="absolute inset-x-1.5 bottom-1.5 top-[48%] rounded-[4px] bg-white/75 backdrop-blur-[1px] px-1.5 py-1 overflow-hidden border border-slate-900/5 space-y-0.5">
            {plainLines.length > 0 ? (
              plainLines.map((line, lIdx) => (
                <div
                  key={lIdx}
                  className="text-[5.5px] leading-[7.5px] text-slate-700 truncate font-medium"
                >
                  ➢ {line}
                </div>
              ))
            ) : (
              <div className="space-y-1 pt-0.5">
                <div className="h-1 w-4/5 rounded-full bg-slate-300/70" />
                <div className="h-1 w-3/5 rounded-full bg-slate-300/60" />
              </div>
            )}
          </div>
        </div>
        )}

        {/* Alt Etiket */}
        <div className="px-0.5">
          <div
            className={`text-[11px] font-bold truncate leading-tight ${
              isActive ? "text-blue-800" : "text-slate-800"
            }`}
          >
            {slide.fullName || `${index + 1}. Slayt`}
          </div>
          {authorName && (
            <div className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
              {authorName}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

export default function PresentationsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  const isSuperAdmin = role === "superadmin";
  const isManager =
    role === "superadmin" ||
    role === "manager" ||
    Boolean((session?.user as any)?.authorizedModules?.includes("presentations"));

  const [templates, setTemplates] = useState<PresentationTemplateClient[]>([]);
  const [coverTemplates, setCoverTemplates] = useState<PresentationTemplateClient[]>([]);
  const [activeCoverTemplate, setActiveCoverTemplate] =
    useState<PresentationTemplateClient | null>(null);
  const activeCoverRef = useRef<PresentationTemplateClient | null>(null);
  activeCoverRef.current = activeCoverTemplate;
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [insideFolder, setInsideFolder] = useState<boolean>(false);
  const [staffUsers, setStaffUsers] = useState<StaffUserOption[]>([]);
  const [presentations, setPresentations] = useState<PresentationListItem[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [debouncedGlobalSearch, setDebouncedGlobalSearch] = useState("");
  const [globalResults, setGlobalResults] = useState<PresentationListItem[]>([]);
  const [globalTotalMatched, setGlobalTotalMatched] = useState(0);
  const [searchingGlobal, setSearchingGlobal] = useState(false);
  const [copyingRecordId, setCopyingRecordId] = useState<string | null>(null);
  const [editorCopySourceInfo, setEditorCopySourceInfo] = useState<{
    fromMeetingTitle: string;
    summaryTitle: string;
  } | null>(null);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>("");
  const [presPage, setPresPage] = useState(1);
  const [presPageSize, setPresPageSize] = useState(12);
  const [presViewMode, setPresViewMode] = useState<"card" | "list">("card");
  const [loading, setLoading] = useState(true);

  // Şablon Modalı & Kapak Şablonu Modalı (Süper Admin)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [newCoverName, setNewCoverName] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [editingCoverTitles, setEditingCoverTitles] = useState<Record<string, string>>({});
  const [savingCoverTitleId, setSavingCoverTitleId] = useState<string | null>(null);
  const [editorMaxSafePt, setEditorMaxSafePt] = useState<number>(22);

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

  // Fotoğraf Kırpma / Kesme / Işıklandırma Modalı State
  const [cropModal, setCropModal] = useState<{
    isOpen: boolean;
    photoIdx: number;
    initialTab: "crop" | "adjust";
  }>({
    isOpen: false,
    photoIdx: 0,
    initialTab: "crop",
  });

  // Önizleme Modalı (Tekil)
  const [previewRecord, setPreviewRecord] = useState<{
    item: PresentationListItem;
    title: string;
    authorName: string;
    canModify: boolean;
    meetingTitle?: string;
    meetingStatus?: "open" | "closed";
    meetingBackgroundPreset?: string;
    meetingPhotoFramePreset?: string;
    slides: SlideItem[];
  } | null>(null);
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0);

  // Toplantı Toplu Önizleme & Anında Açıklama Düzenleme Modalı
  const [bulkPreviewModal, setBulkPreviewModal] = useState<{
    meeting: MeetingItem;
    allGroups: OrderedPresentationGroup[];
    initialOrderIds: string[];
    groups: OrderedPresentationGroup[];
    flatSlides: BulkFlatSlideItem[];
  } | null>(null);
  const [bulkIdx, setBulkIdx] = useState(0);
  const [savingBulkEdit, setSavingBulkEdit] = useState(false);
  const [savingBulkOrder, setSavingBulkOrder] = useState(false);
  const [isBulkOrderConfirmOpen, setIsBulkOrderConfirmOpen] = useState(false);
  const [mobileBulkTab, setMobileBulkTab] = useState<"preview" | "edit">("preview");
  const [reorderLiveMsg, setReorderLiveMsg] = useState("");
  const [filmstripDrag, setFilmstripDrag] = useState<{
    fromGroupIdx: number;
    dropInsertIdx: number;
    dx: number;
    dy: number;
  } | null>(null);
  const filmstripDragRef = useRef<{
    pointerId: number;
    fromGroupIdx: number;
    dropInsertIdx: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    isHorizontal: boolean;
    rafId: number | null;
  } | null>(null);
  const touchSwipeRef = useRef<{ x: number; y: number } | null>(null);

  // Toplantı Yönetimi / Sıralama / Birleştirme / İndirme Modalı
  const [manageMeetingModal, setManageMeetingModal] = useState<{
    meeting: MeetingItem;
    orderedPresentations: OrderedPresentationGroup[];
  } | null>(null);
  const [loadingMeetingSlides, setLoadingMeetingSlides] = useState(false);
  const [isHydratingBulkSlides, setIsHydratingBulkSlides] = useState(false);
  const [exportingMeeting, setExportingMeeting] = useState(false);
  const [isBgPickerOpen, setIsBgPickerOpen] = useState(false);
  const [isFramePickerOpen, setIsFramePickerOpen] = useState(false);

  // Anlık Yükleme Ekranı (0ms gecikme ile açılan hareketli önizleme hazırlık penceresi)
  const [previewLoadingModal, setPreviewLoadingModal] = useState<{
    title: string;
    subtitle: string;
  } | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  // Tekil Sunu Slayt Önbelleği & Hover Önyükleme (0ms açılış için)
  const slideCacheRef = useRef<
    Map<string, { meetingId: string; slides: SlideItem[] }>
  >(new Map());
  const inflightPrefetchRef = useRef<Set<string>>(new Set());

  // Silme Onayı
  const [deleteTarget, setDeleteTarget] = useState<PresentationListItem | null>(null);
  const bulkFilmstripRef = useRef<HTMLDivElement | null>(null);
  const singleFilmstripRef = useRef<HTMLDivElement | null>(null);

  // PowerPoint Tam Ekran Projeksiyon Sunum Gösterisi Modu
  const [isSlideshowOpen, setIsSlideshowOpen] = useState(false);
  const [slideshowHudVisible, setSlideshowHudVisible] = useState(true);
  const [isLaserActive, setIsLaserActive] = useState(false);
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [projectorStageBox, setProjectorStageBox] = useState<{ w: number; h: number }>({
    w: 960,
    h: 720,
  });
  const slideshowStageRef = useRef<HTMLDivElement | null>(null);
  const slideshowLaunchBtnRef = useRef<HTMLButtonElement | null>(null);
  const isSlideshowActiveRef = useRef(false);
  const lastSlideshowExitAtRef = useRef(0);
  const slideshowIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wakeSlideshowHud = useCallback(() => {
    setSlideshowHudVisible(true);
    if (slideshowIdleTimerRef.current) {
      clearTimeout(slideshowIdleTimerRef.current);
    }
    slideshowIdleTimerRef.current = setTimeout(() => {
      setSlideshowHudVisible(false);
    }, 2400);
  }, []);

  const exitSlideshowMode = useCallback(() => {
    isSlideshowActiveRef.current = false;
    lastSlideshowExitAtRef.current = Date.now();
    setIsSlideshowOpen(false);
    setIsLaserActive(false);
    setLaserPos(null);
    if (slideshowIdleTimerRef.current) {
      clearTimeout(slideshowIdleTimerRef.current);
      slideshowIdleTimerRef.current = null;
    }
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setTimeout(() => {
      slideshowLaunchBtnRef.current?.focus();
    }, 30);
  }, []);

  const enterSlideshowMode = useCallback(() => {
    isSlideshowActiveRef.current = true;
    setIsSlideshowOpen(true);
    wakeSlideshowHud();
    if (typeof document !== "undefined" && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, [wakeSlideshowHud]);

  const navigateSlideshow = useCallback(
    (deltaOrTarget: number, isAbsolute = false) => {
      if (!bulkPreviewModal) return;
      const total = bulkPreviewModal.flatSlides.length;
      if (total <= 1) return;

      setBulkIdx((prev) => {
        const next = isAbsolute
          ? Math.max(0, Math.min(total - 1, deltaOrTarget))
          : Math.max(0, Math.min(total - 1, prev + deltaOrTarget));
        if (next === prev) return prev;
        return next;
      });
    },
    [bulkPreviewModal]
  );

  const stepSlideshowWithTransition = useCallback(
    (dir: -1 | 1) => {
      if (!bulkPreviewModal) return;
      const total = bulkPreviewModal.flatSlides.length;
      if (total <= 1) return;
      const targetIdx = Math.max(0, Math.min(total - 1, bulkIdx + dir));
      if (targetIdx === bulkIdx) return;

      const updateDOM = () => {
        setBulkIdx(targetIdx);
      };

      const effectId =
        bulkPreviewModal.meeting.transitionPreset || "kurumsal_kaydir";
      if (effectId === "anlik_kesme") {
        updateDOM();
        return;
      }

      const docAny = typeof document !== "undefined" ? (document as any) : null;
      if (!docAny?.startViewTransition) {
        updateDOM();
        return;
      }
      try {
        docAny.startViewTransition({
          update: updateDOM,
          types: [`${effectId}-${dir === 1 ? "fwd" : "bwd"}`],
        });
      } catch {
        updateDOM();
      }
    },
    [bulkPreviewModal, bulkIdx]
  );

  // Tarayıcı tam ekranından ESC ile çıkıldığında otomatik olarak önizleme penceresine geri dön
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && isSlideshowActiveRef.current) {
        isSlideshowActiveRef.current = false;
        lastSlideshowExitAtRef.current = Date.now();
        setIsSlideshowOpen(false);
        setIsLaserActive(false);
        setLaserPos(null);
        setTimeout(() => {
          slideshowLaunchBtnRef.current?.focus();
        }, 30);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Projeksiyon sahnesi boyutunu ekran/projeksiyon çözünürlüğüne göre 4:3 tam sığacak şekilde hesapla
  useLayoutEffect(() => {
    if (!isSlideshowOpen) return;
    const updateStageSize = () => {
      const stage = slideshowStageRef.current;
      const vw = stage?.clientWidth || window.innerWidth || 1024;
      const vh = stage?.clientHeight || window.innerHeight || 768;
      const fitW = Math.min(vw, (vh * 4) / 3);
      const fitH = (fitW * 3) / 4;
      setProjectorStageBox({
        w: Math.max(240, Math.floor(fitW)),
        h: Math.max(180, Math.floor(fitH)),
      });
    };
    updateStageSize();
    const ro = new ResizeObserver(updateStageSize);
    if (slideshowStageRef.current) ro.observe(slideshowStageRef.current);
    window.addEventListener("resize", updateStageSize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateStageSize);
    };
  }, [isSlideshowOpen]);

  // Tam ekran sunum modunda PowerPoint klavye & kumanda kısayolları (ESC -> Önizlemeye dön!)
  useEffect(() => {
    if (!isSlideshowOpen || !bulkPreviewModal) return;
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        exitSlideshowMode();
        return;
      }
      if (
        e.key === "ArrowRight" ||
        e.key === "ArrowDown" ||
        e.key === "PageDown" ||
        e.key === " " ||
        e.key === "Enter"
      ) {
        const target = e.target as HTMLElement | null;
        if (target && target.closest("[data-slideshow-hud='true']") && e.key === "Enter") {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        stepSlideshowWithTransition(1);
      } else if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowUp" ||
        e.key === "PageUp" ||
        e.key === "Backspace"
      ) {
        e.preventDefault();
        e.stopPropagation();
        stepSlideshowWithTransition(-1);
      } else if (e.key === "Home") {
        e.preventDefault();
        e.stopPropagation();
        navigateSlideshow(0, true);
      } else if (e.key === "End") {
        e.preventDefault();
        e.stopPropagation();
        navigateSlideshow(bulkPreviewModal.flatSlides.length - 1, true);
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        e.stopPropagation();
        setIsLaserActive((prev) => !prev);
        wakeSlideshowHud();
      }
    };
    window.addEventListener("keydown", onKeyDownCapture, true);
    return () => window.removeEventListener("keydown", onKeyDownCapture, true);
  }, [
    isSlideshowOpen,
    bulkPreviewModal,
    exitSlideshowMode,
    stepSlideshowWithTransition,
    navigateSlideshow,
    wakeSlideshowHud,
  ]);

  const isBulkOrderDirty = useMemo(() => {
    if (!bulkPreviewModal) return false;
    return (
      bulkPreviewModal.allGroups.map((g) => g.presentationId).join(",") !==
      bulkPreviewModal.initialOrderIds.join(",")
    );
  }, [bulkPreviewModal]);

  const requestCloseBulkPreview = useCallback(() => {
    if (!bulkPreviewModal) return;
    if (isBulkOrderDirty) {
      setIsBulkOrderConfirmOpen(true);
      return;
    }
    setBulkPreviewModal(null);
  }, [bulkPreviewModal, isBulkOrderDirty]);

  // Aktif slayt değiştiğinde sol PowerPoint film şeridinde ilgili küçük slaytı görünür alana kaydır
  useEffect(() => {
    if (!bulkPreviewModal || !bulkFilmstripRef.current || filmstripDrag) return;
    const activeBtn = bulkFilmstripRef.current.querySelector<HTMLElement>(
      `[data-filmstrip-idx="${bulkIdx}"]`
    );
    activeBtn?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [bulkIdx, bulkPreviewModal, filmstripDrag]);

  useEffect(() => {
    if (!previewRecord || !singleFilmstripRef.current) return;
    const activeBtn = singleFilmstripRef.current.querySelector<HTMLElement>(
      `[data-filmstrip-idx="${previewSlideIdx}"]`
    );
    activeBtn?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [previewSlideIdx, previewRecord]);

  // Toplu ve Tekil Slayt Önizleme Modallarında Klavye Yön Tuşları (← → ↑ ↓) ve Esc Desteği
  useEffect(() => {
    if (!bulkPreviewModal && !previewRecord) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        isSlideshowActiveRef.current ||
        Date.now() - lastSlideshowExitAtRef.current < 450 ||
        isBulkOrderConfirmOpen ||
        filmstripDragRef.current
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "F5" && bulkPreviewModal) {
        e.preventDefault();
        enterSlideshowMode();
        return;
      }
      if (e.altKey) return;
      if (e.key === "Escape") {
        if (bulkPreviewModal) requestCloseBulkPreview();
        else if (previewRecord) setPreviewRecord(null);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        if (bulkPreviewModal) {
          setBulkIdx((p) => Math.max(0, p - 1));
        } else if (previewRecord) {
          setPreviewSlideIdx((p) => Math.max(0, p - 1));
        }
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        if (bulkPreviewModal) {
          setBulkIdx((p) => Math.min(bulkPreviewModal.flatSlides.length - 1, p + 1));
        } else if (previewRecord) {
          setPreviewSlideIdx((p) => Math.min(previewRecord.slides.length - 1, p + 1));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bulkPreviewModal, previewRecord, isBulkOrderConfirmOpen, requestCloseBulkPreview]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 180);
    return () => clearTimeout(t);
  }, [search]);

  // KVKK Bellek Koruması: Sayfadan ayrılındığında çözülmüş ImageBitmap ve slayt önbelleğini temizle
  useEffect(() => {
    return () => {
      slideCacheRef.current.clear();
      clearProtectedBitmapCache();
    };
  }, []);

  // Mobil & Masaüstü Donanım / Tarayıcı "Geri" Tuşu Desteği (Önizleme açıkken sayfadan çıkmak yerine önizlemeyi kapatır)
  const hasAnyPreviewOpen = Boolean(previewRecord || bulkPreviewModal);
  useEffect(() => {
    if (!hasAnyPreviewOpen || typeof window === "undefined") return;
    if (!window.history.state?.vakifPresPreview) {
      window.history.pushState({ vakifPresPreview: true }, "");
    }
    const onPopState = () => {
      if (isSlideshowActiveRef.current) {
        void exitSlideshowMode();
        return;
      }
      if (previewRecord) {
        setPreviewRecord(null);
        return;
      }
      if (bulkPreviewModal) {
        requestCloseBulkPreview();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [hasAnyPreviewOpen, previewRecord, bulkPreviewModal, exitSlideshowMode, requestCloseBulkPreview]);

  const fetchTemplates = useCallback(async () => {
    try {
      const tplRes = await shieldedFetchJson("/api/presentations/template");
      if (!tplRes.ok) return;
      const tplData = tplRes.data;
      const rawTpls: PresentationTemplateClient[] =
        tplData.templates || (tplData.template ? [tplData.template] : []);
      const rawCovers: PresentationTemplateClient[] = tplData.coverTemplates || [];
      const rawActiveCover: PresentationTemplateClient | null =
        tplData.activeCoverTemplate ||
        rawCovers.find((c) => c.isActiveCover) ||
        null;

      setTemplates(rawTpls);
      setCoverTemplates(rawCovers);
      setActiveCoverTemplate(rawActiveCover);

      // Aktif toplu önizleme açıksa kapak slaydını senkronize et
      setBulkPreviewModal((prev) =>
        prev
          ? {
              ...prev,
              flatSlides: buildBulkFlatSlides(prev.groups, rawActiveCover),
            }
          : null
      );

      setTimeout(() => {
        void Promise.all(
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
        ).then((cleaned) => setTemplates(cleaned));

        void Promise.all(
          rawCovers.map(async (c) =>
            c.backgroundImageBase64
              ? {
                  ...c,
                  backgroundImageBase64: await cleanTemplateWatermark(
                    c.backgroundImageBase64
                  ),
                }
              : c
          )
        ).then((cleanedCovers) => {
          setCoverTemplates(cleanedCovers);
          const nextActive =
            cleanedCovers.find((c) => c.isActiveCover) || null;
          setActiveCoverTemplate(nextActive);
        });
      }, 0);
    } catch {
      // sessiz
    }
  }, []);

  const fetchAll = useCallback(
    async (opts?: { includeTemplates?: boolean; silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const tasks: Promise<any>[] = [fetch("/api/presentations/meetings")];
        if (opts?.includeTemplates) {
          tasks.push(fetchTemplates());
        }
        const [meetRes] = await Promise.all(tasks);
        const meetData = await meetRes.json();

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
        if (!opts?.silent) toast.error("Veriler yüklenirken hata oluştu.");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [fetchTemplates]
  );

  const fetchPresentations = useCallback(async () => {
    if (!selectedMeetingId || !insideFolder) return;
    try {
      const params = new URLSearchParams();
      params.set("meetingId", selectedMeetingId);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await shieldedFetchJson(`/api/presentations?${params.toString()}`);
      if (res.ok) setPresentations(res.data?.presentations || []);
    } catch {
      // sessiz
    }
  }, [selectedMeetingId, insideFolder, debouncedSearch]);

  useEffect(() => {
    void fetchAll({ includeTemplates: true });
  }, [fetchAll]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.users)) setStaffUsers(d.users);
      })
      .catch(() => {});
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchPresentations();
  }, [fetchPresentations]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedGlobalSearch(globalSearch), 200);
    return () => clearTimeout(t);
  }, [globalSearch]);

  // Tüm Toplantı Klasörleri genelinde şifreli Sunu Ara-Bul
  useEffect(() => {
    const q = debouncedGlobalSearch.trim();
    if (!q) {
      setGlobalResults([]);
      setGlobalTotalMatched(0);
      setSearchingGlobal(false);
      return;
    }

    const controller = new AbortController();
    setSearchingGlobal(true);
    const params = new URLSearchParams({
      globalSearch: "1",
      search: q,
    });

    shieldedFetchJson(`/api/presentations?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (res.ok) {
          setGlobalResults(res.data?.presentations || []);
          setGlobalTotalMatched(
            typeof res.data?.totalMatched === "number"
              ? res.data.totalMatched
              : (res.data?.presentations || []).length
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) {
          setSearchingGlobal(false);
        }
      });

    return () => controller.abort();
  }, [debouncedGlobalSearch]);

  const selectedMeeting = meetings.find((m) => m._id === selectedMeetingId) || null;
  const activeOpenMeeting = meetings.find((m) => m.status === "open") || null;
  const hasOpenMeeting = Boolean(activeOpenMeeting);
  const isAuthorizedForSelected =
    Boolean(selectedMeeting?.authorizedUserId?._id) &&
    String(selectedMeeting?.authorizedUserId?._id) === String(userId);
  const canManageSelectedMeeting = isManager || isAuthorizedForSelected;
  const isAuthorizedForOpenMeeting =
    Boolean(activeOpenMeeting?.authorizedUserId?._id) &&
    String(activeOpenMeeting?.authorizedUserId?._id) === String(userId);
  const canAddToOpenMeeting = Boolean(
    activeOpenMeeting &&
      (!activeOpenMeeting.isLocked || isManager || isAuthorizedForOpenMeeting)
  );

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
      await fetchTemplates();
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
      await fetchTemplates();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Süper Admin: Kapak Şablonu Yükle (Slaytların En Başında Sayfa 1 Olarak Görünür)
  const handleUploadCoverTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "cover");
      if (newCoverName.trim()) fd.append("name", newCoverName.trim());
      const res = await fetch("/api/presentations/template", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kapak şablonu yüklenemedi");
      setNewCoverName("");
      toast.success(
        "Kapak şablonu yüklendi ve tüm toplantı slaytlarının en başına (1. sayfa) eklendi."
      );
      await fetchTemplates();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingCover(false);
      e.target.value = "";
    }
  };

  // Süper Admin: Aktif Kapak Şablonunu Değiştir veya Devre Dışı Bırak
  const handleSelectActiveCover = async (coverId: string | null) => {
    try {
      const res = await fetch("/api/presentations/template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeCoverId: coverId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kapak şablonu güncellenemedi");
      toast.success(
        coverId
          ? "Seçilen kapak şablonu slaytların en başında gösterilecek şekilde aktif edildi."
          : "Kapak şablonu devre dışı bırakıldı."
      );
      await fetchTemplates();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Süper Admin: Mevcut Kapak Şablonunun Üst Başlık Yazısını (Kapak Adını) Güncelle
  const handleRenameCoverTemplate = async (coverId: string, rawDraft: string) => {
    const cleaned = (rawDraft || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");
    if (!cleaned) {
      toast.error("Kapak adı boş bırakılamaz.");
      return;
    }
    setSavingCoverTitleId(coverId);
    try {
      const res = await fetch("/api/presentations/template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          renameCoverId: coverId,
          newName: cleaned,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kapak adı güncellenemedi");

      setEditingCoverTitles((prev) => {
        const next = { ...prev };
        delete next[coverId];
        return next;
      });
      toast.success("Kapak üst başlık yazısı güncellendi.");
      await fetchTemplates();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingCoverTitleId(null);
    }
  };

  // Süper Admin: Tam Ekran Sunum Slaytlar Arası Geçiş Efektini Değiştir
  const handleSetMeetingTransition = async (meetingId: string, presetId: string) => {
    try {
      const res = await fetch(`/api/presentations/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setTransitionPreset",
          transitionPreset: presetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Geçiş efekti güncellenemedi");

      setMeetings((prev) =>
        prev.map((m) =>
          m._id === meetingId ? { ...m, transitionPreset: presetId } : m
        )
      );
      setBulkPreviewModal((prev) =>
        prev && prev.meeting._id === meetingId
          ? { ...prev, meeting: { ...prev.meeting, transitionPreset: presetId } }
          : prev
      );
      const label =
        SLIDESHOW_TRANSITION_PRESETS.find((p) => p.id === presetId)?.label || presetId;
      toast.success(`Tam ekran sunum geçiş efekti güncellendi: ${label}`);
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
    setEditorCopySourceInfo(null);
    setEditorMeetingId(openMeeting._id);
    setSlides([emptySlide(templates[0]?._id)]);
    setActiveSlideIdx(0);
    setEditorMode(true);
  };

  // Eski / Kapatılmış veya Mevcut Bir Sunuyu Doğrudan Açık Toplantıya Aynen Kopyala (Orijinal Sunu Değişmez!)
  const handleCopyToOpenMeetingDirect = async (
    item: PresentationListItem,
    slideIndices?: number[]
  ) => {
    if (!activeOpenMeeting) {
      toast.error(
        "Şu anda açık bir toplantı bulunmuyor. Kopyalama yapabilmek için önce yeni bir toplantı açılmalıdır."
      );
      return;
    }
    if (!canAddToOpenMeeting) {
      toast.error(
        "Açık toplantı sıralama/kapatma için kilitlenmiştir. Sadece yönetici ve yetkili personel sunu kopyalayabilir."
      );
      return;
    }
    if (copyingRecordId) return;

    setCopyingRecordId(item._id);
    const toastId = toast.loading(
      slideIndices && slideIndices.length === 1
        ? `${slideIndices[0] + 1}. slayt açık toplantıya kopyalanıyor...`
        : "Sunu açık toplantı dosyasına kopyalanıyor..."
    );

    try {
      const res = await shieldedSendJson("/api/presentations", "POST", {
        action: "copyToOpenMeeting",
        sourcePresentationId: item._id,
        targetMeetingId: activeOpenMeeting._id,
        ...(Array.isArray(slideIndices) && slideIndices.length > 0
          ? { slideIndices }
          : {}),
      });
      const data = res.data;
      toast.dismiss(toastId);

      if (!res.ok) {
        throw new Error(data?.error || "Sunu kopyalanamadı.");
      }

      const card = data?.presentationCard as PresentationListItem | undefined;
      if (card) {
        if (String(selectedMeetingId) === String(activeOpenMeeting._id)) {
          setPresentations((prev) => [card, ...prev]);
        }
        setMeetings((prev) =>
          prev.map((m) =>
            String(m._id) === String(activeOpenMeeting._id)
              ? {
                  ...m,
                  recordCount: m.recordCount + 1,
                  totalSlides: m.totalSlides + (card.slideCount || 1),
                }
              : m
          )
        );
      } else {
        void fetchAll({ silent: true });
        if (String(selectedMeetingId) === String(activeOpenMeeting._id)) {
          void fetchPresentations();
        }
      }

      toast.success(
        slideIndices && slideIndices.length === 1
          ? `Seçilen slayt "${activeOpenMeeting.title}" toplantısına yeni sunu olarak kopyalandı.`
          : `"${item.summaryTitle}" sunusu aynen "${activeOpenMeeting.title}" toplantısına kopyalandı.`
      );
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err.message || "Kopyalama sırasında hata oluştu.");
    } finally {
      setCopyingRecordId(null);
    }
  };

  // Eski / Kapatılmış veya Mevcut Bir Sununun Kopyasını Düzenleyicide Aç (Yeni Toplantıya Dahil Edilmek Üzere Üzerinde Değişiklik Yapılabilir)
  const handleCopyToEditorAndModify = async (
    item: PresentationListItem,
    slideIndices?: number[],
    preloadedSlides?: SlideItem[]
  ) => {
    if (!activeOpenMeeting) {
      toast.error(
        "Şu anda açık bir toplantı bulunmuyor. Kopyalayıp düzenlemek için önce yeni bir toplantı açılmalıdır."
      );
      return;
    }
    if (!canAddToOpenMeeting) {
      toast.error(
        "Açık toplantı sıralama/kapatma için kilitlenmiştir. Sadece yönetici ve yetkili personel sunu ekleyebilir."
      );
      return;
    }

    try {
      let sourceSlides: SlideItem[] = preloadedSlides || [];
      if (sourceSlides.length === 0) {
        const cached = slideCacheRef.current.get(item._id);
        if (cached?.slides?.length) {
          sourceSlides = cached.slides;
        } else {
          setPreviewLoadingModal({
            title: "Sunu Kopyası Hazırlanıyor...",
            subtitle: `${item.summaryTitle} slaytları yeni toplantı için aktarılıyor`,
          });
          const res = await shieldedFetchJson(`/api/presentations/${item._id}`);
          setPreviewLoadingModal(null);
          if (!res.ok) {
            throw new Error(res.data?.error || "Kaynak sunu slaytları alınamadı.");
          }
          sourceSlides = res.data?.presentation?.slides || [];
          if (sourceSlides.length > 0) {
            slideCacheRef.current.set(item._id, {
              meetingId: String(res.data?.presentation?.meetingId || item.meetingId),
              slides: sourceSlides,
            });
          }
        }
      }

      if (sourceSlides.length === 0) {
        toast.error("Kopyalanacak slayt içeriği bulunamadı.");
        return;
      }

      const picked =
        Array.isArray(slideIndices) && slideIndices.length > 0
          ? slideIndices
              .filter((idx) => idx >= 0 && idx < sourceSlides.length)
              .map((idx) => sourceSlides[idx])
          : sourceSlides;

      // Derin kopya: orijinal toplantıdaki slayt referanslarına kesinlikle dokunulmaz!
      const clonedSlides: SlideItem[] = JSON.parse(
        JSON.stringify(picked.length > 0 ? picked : sourceSlides)
      );

      const sourceMeetingObj = meetings.find(
        (m) => String(m._id) === String(item.meetingId)
      );
      const fromTitle =
        item.meetingTitle || sourceMeetingObj?.title || "Önceki Toplantı";

      setPreviewRecord(null);
      setEditingId(null); // Yeni kayıt olarak kaydedilir; eski kaydı asla değiştirmez!
      setEditorMeetingId(activeOpenMeeting._id);
      setEditorCopySourceInfo({
        fromMeetingTitle: fromTitle,
        summaryTitle: item.summaryTitle,
      });
      setSlides(clonedSlides);
      setActiveSlideIdx(0);
      setEditorMode(true);
      toast.success(
        `Sununun bir kopyası "${activeOpenMeeting.title}" için düzenleyiciye aktarıldı. Değişiklik yapıp kaydedebilirsiniz.`
      );
    } catch (err: any) {
      setPreviewLoadingModal(null);
      toast.error(err.message || "Sunu kopyası açılamadı.");
    }
  };

  // Kart üzerine gelindiğinde arka planda slaytları sessizce önbelleğe al (Tıklandığında 0ms açılır!)
  const prefetchRecordSlides = useCallback((item: PresentationListItem) => {
    if (
      !item?._id ||
      slideCacheRef.current.has(item._id) ||
      inflightPrefetchRef.current.has(item._id)
    ) {
      return;
    }
    inflightPrefetchRef.current.add(item._id);
    shieldedFetchJson(`/api/presentations/${item._id}`)
      .then((r) => (r.ok ? r.data : null))
      .then((d) => {
        if (d?.presentation?.slides) {
          slideCacheRef.current.set(item._id, {
            meetingId: String(d.presentation.meetingId || item.meetingId),
            slides: d.presentation.slides,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        inflightPrefetchRef.current.delete(item._id);
      });
  }, []);

  // Mevcut Sunuyu Düzenle / Önizle / İndir (Önbellek + 0ms Hareketli Yükleme Görseli ile)
  const handleOpenRecord = async (
    item: PresentationListItem,
    mode: "preview" | "edit" | "download"
  ) => {
    const itemMeeting =
      meetings.find((m) => String(m._id) === String(item.meetingId)) ||
      (selectedMeeting && String(selectedMeeting._id) === String(item.meetingId)
        ? selectedMeeting
        : null);
    const resolvedStatus: "open" | "closed" =
      itemMeeting?.status || item.meetingStatus || "closed";
    const isAuthForItemMeeting =
      Boolean(itemMeeting?.authorizedUserId?._id) &&
      String(itemMeeting?.authorizedUserId?._id) === String(userId);
    const canManageItemMeeting = isManager || isAuthForItemMeeting;
    const canModifyItem =
      resolvedStatus === "open" &&
      Boolean(
        itemMeeting &&
          (canManageItemMeeting ||
            (!itemMeeting.isLocked &&
              String(item.createdBy?._id) === String(userId)))
      );
    const resolvedBgPreset =
      itemMeeting?.backgroundPreset || item.meetingBackgroundPreset || "template";
    const resolvedFramePreset =
      itemMeeting?.photoFramePreset || item.meetingPhotoFramePreset || "none";
    const resolvedMeetingTitle =
      itemMeeting?.title || item.meetingTitle || "";

    if (mode === "edit" && resolvedStatus === "closed") {
      toast.error(
        "Kapatılmış toplantıdaki sunular değiştirilemez. Yeni toplantıya kopyalayarak üzerinde değişiklik yapabilirsiniz."
      );
      return;
    }

    const cached = slideCacheRef.current.get(item._id);

    // Önizleme modunda önbellekte varsa 0ms içinde anında aç!
    if (mode === "preview" && cached) {
      setPreviewRecord({
        item,
        title: item.summaryTitle,
        authorName: item.createdBy?.name || "Personel",
        canModify: Boolean(canModifyItem),
        meetingTitle: resolvedMeetingTitle,
        meetingStatus: resolvedStatus,
        meetingBackgroundPreset: resolvedBgPreset,
        meetingPhotoFramePreset: resolvedFramePreset,
        slides: cached.slides,
      });
      setPreviewSlideIdx(0);
      return;
    }

    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    if (mode === "preview" || mode === "edit") {
      setPreviewLoadingModal({
        title:
          mode === "preview"
            ? "Sunu Önizlemesi Yükleniyor..."
            : "Sunu Düzenleyici Açılıyor...",
        subtitle: item.summaryTitle || "Slayt görselleri ve açıklamalar hazırlanıyor",
      });
    }

    const loadingToast =
      mode === "download" ? toast.loading("Sunu (.pptx) hazırlanıyor...") : undefined;

    try {
      if (mode === "edit") {
        const [res, lockRes] = await Promise.all([
          cached
            ? Promise.resolve(null)
            : shieldedFetchJson(`/api/presentations/${item._id}`, {
                signal: controller.signal,
              }),
          fetch(`/api/presentations/${item._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "lock" }),
            signal: controller.signal,
          }),
        ]);
        const [data, lockData] = await Promise.all([
          Promise.resolve(res ? res.data : null),
          lockRes.json().catch(() => ({})),
        ]);
        setPreviewLoadingModal(null);

        if (!lockRes.ok) {
          toast.error(
            lockData.error || "Bu sunu şu anda başka bir kullanıcı tarafından düzenleniyor."
          );
          void fetchPresentations();
          return;
        }
        if (res && !res.ok) throw new Error(data?.error || "Sunu alınamadı");

        const loadedSlides: SlideItem[] = cached
          ? cached.slides
          : data.presentation.slides || [];
        const resolvedMeetingId = cached
          ? cached.meetingId
          : String(data.presentation.meetingId);

        slideCacheRef.current.set(item._id, {
          meetingId: resolvedMeetingId,
          slides: loadedSlides,
        });

        setEditingId(item._id);
        setEditorCopySourceInfo(null);
        setEditorMeetingId(resolvedMeetingId);
        setSlides(loadedSlides.length > 0 ? loadedSlides : [emptySlide(templates[0]?._id)]);
        setActiveSlideIdx(0);
        setEditorMode(true);
        return;
      }

      let loadedSlides: SlideItem[] = cached ? cached.slides : [];
      let fetchedPresentationMeta: any = null;
      if (!cached) {
        const res = await shieldedFetchJson(`/api/presentations/${item._id}`, {
          signal: controller.signal,
        });
        const data = res.data;
        if (!res.ok) throw new Error(data?.error || "Sunu alınamadı");
        fetchedPresentationMeta = data.presentation;
        loadedSlides = data.presentation.slides || [];
        slideCacheRef.current.set(item._id, {
          meetingId: String(data.presentation.meetingId || item.meetingId),
          slides: loadedSlides,
        });
      }

      setPreviewLoadingModal(null);
      if (loadingToast) toast.dismiss(loadingToast);

      const finalBgPreset =
        fetchedPresentationMeta?.meetingBackgroundPreset || resolvedBgPreset;
      const finalFramePreset =
        fetchedPresentationMeta?.meetingPhotoFramePreset || resolvedFramePreset;
      const finalMeetingTitle =
        fetchedPresentationMeta?.meetingTitle || resolvedMeetingTitle;
      const finalMeetingStatus: "open" | "closed" =
        fetchedPresentationMeta?.meetingStatus || resolvedStatus;

      if (mode === "preview") {
        setPreviewRecord({
          item,
          title: item.summaryTitle,
          authorName: item.createdBy?.name || "Personel",
          canModify: finalMeetingStatus === "open" ? Boolean(canModifyItem) : false,
          meetingTitle: finalMeetingTitle,
          meetingStatus: finalMeetingStatus,
          meetingBackgroundPreset: finalBgPreset,
          meetingPhotoFramePreset: finalFramePreset,
          slides: loadedSlides,
        });
        setPreviewSlideIdx(0);
      } else if (mode === "download") {
        await exportSlidesToPptx({
          slides: loadedSlides,
          fileName: `${item.summaryTitle}.pptx`,
          templates,
          meetingBackgroundPreset: finalBgPreset,
          meetingPhotoFramePreset: finalFramePreset,
        });
        toast.success("Sunu (.pptx) indirildi.");
      }
    } catch (err: any) {
      setPreviewLoadingModal(null);
      if (loadingToast) toast.dismiss(loadingToast);
      if (err?.name === "AbortError") return;
      toast.error(err.message);
    }
  };

  const releaseEditLock = useCallback((id: string | null) => {
    if (!id) return;
    fetch(`/api/presentations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlock" }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const handleExitEditor = () => {
    if (editingId) {
      const unlockedId = editingId;
      releaseEditLock(unlockedId);
      setPresentations((prev) =>
        prev.map((p) => (p._id === unlockedId ? { ...p, lockedBy: null } : p))
      );
    }
    setEditorMode(false);
    setEditingId(null);
    setEditorCopySourceInfo(null);
  };

  useEffect(() => {
    if (!editorMode || !editingId) return;
    const currentId = editingId;
    const interval = setInterval(() => {
      fetch(`/api/presentations/${currentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat" }),
      }).catch(() => {});
    }, 60 * 1000);

    const handleBeforeUnload = () => {
      releaseEditLock(currentId);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [editorMode, editingId, releaseEditLock]);

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

  const handleOpenCropModal = (idx = 0, initialTab: "crop" | "adjust" = "crop") => {
    const current = slides[activeSlideIdx];
    if (!current?.photos || current.photos.length === 0) {
      toast.error("Düzenlenecek fotoğraf bulunamadı. Lütfen önce bir fotoğraf yükleyin.");
      return;
    }
    const safeIdx = Math.max(0, Math.min(current.photos.length - 1, idx));
    setCropModal({
      isOpen: true,
      photoIdx: safeIdx,
      initialTab,
    });
  };

  const handleApplyCroppedPhoto = (croppedBase64: string, targetIdx: number) => {
    setSlides((prev) =>
      prev.map((s, sIdx) => {
        if (sIdx !== activeSlideIdx) return s;
        const nextPhotos = [...s.photos];
        if (targetIdx >= 0 && targetIdx < nextPhotos.length) {
          nextPhotos[targetIdx] = croppedBase64;
        } else {
          nextPhotos[0] = croppedBase64;
        }
        return { ...s, photos: nextPhotos };
      })
    );
    toast.success("Fotoğraf başarıyla kırpıldı ve güncellendi.");
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
      const res = await shieldedSendJson(url, method, {
        meetingId: editorMeetingId,
        slides: normalizedSlides,
      });
      const data = res.data;
      if (!res.ok) throw new Error(data?.error || "Sunu kaydedilemedi");

      const wasEditingId = editingId;
      if (wasEditingId) {
        slideCacheRef.current.delete(wasEditingId);
      }
      const card = data.presentationCard as PresentationListItem | undefined;

      if (card) {
        if (wasEditingId) {
          const oldItem = presentations.find((p) => p._id === wasEditingId);
          const slideDelta = card.slideCount - (oldItem?.slideCount || card.slideCount);
          setPresentations((prev) =>
            prev.map((p) => (p._id === wasEditingId ? card : p))
          );
          if (slideDelta !== 0) {
            setMeetings((prev) =>
              prev.map((m) =>
                m._id === String(card.meetingId)
                  ? { ...m, totalSlides: Math.max(0, m.totalSlides + slideDelta) }
                  : m
              )
            );
          }
        } else {
          if (!selectedMeetingId || String(card.meetingId) === String(selectedMeetingId)) {
            setPresentations((prev) => [card, ...prev]);
          }
          setMeetings((prev) =>
            prev.map((m) =>
              m._id === String(card.meetingId)
                ? {
                    ...m,
                    recordCount: m.recordCount + 1,
                    totalSlides: m.totalSlides + card.slideCount,
                  }
                : m
            )
          );
        }
      } else {
        void fetchAll({ silent: true });
        void fetchPresentations();
      }

      toast.success(wasEditingId ? "Sunu anında güncellendi." : "Sunu toplantı klasörüne eklendi.");
      if (card?.meetingId || editorMeetingId) {
        setSelectedMeetingId(String(card?.meetingId || editorMeetingId));
        setInsideFolder(true);
      }
      setEditingId(null);
      setEditorCopySourceInfo(null);
      setEditorMode(false);
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

  // Toplantı Fotoğraf Çerçevesini Toplu Değiştir (Yalnızca Süper Admin — Aktif Toplantıdaki Tüm Sunulara Uygulanır)
  const handleSetMeetingPhotoFrame = async (meetingId: string, framePresetId: string) => {
    try {
      const res = await fetch(`/api/presentations/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setPhotoFramePreset",
          photoFramePreset: framePresetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fotoğraf çerçevesi güncellenemedi");

      setMeetings((prev) =>
        prev.map((m) =>
          m._id === meetingId ? { ...m, photoFramePreset: framePresetId } : m
        )
      );
      setBulkPreviewModal((prev) =>
        prev && prev.meeting._id === meetingId
          ? { ...prev, meeting: { ...prev.meeting, photoFramePreset: framePresetId } }
          : prev
      );
      setManageMeetingModal((prev) =>
        prev && prev.meeting._id === meetingId
          ? { ...prev, meeting: { ...prev.meeting, photoFramePreset: framePresetId } }
          : prev
      );

      const label =
        PHOTO_FRAME_PRESETS.find((p) => p.id === framePresetId)?.label || framePresetId;
      toast.success(
        framePresetId === "none"
          ? "Aktif toplantıdaki tüm sunu fotoğraflarından çerçeve kaldırıldı."
          : `Aktif toplantıdaki tüm sunulara fotoğraf çerçevesi uygulandı: ${label}`
      );
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Toplantı Toplu Önizleme Modalını Aç (2 Aşamalı Hızlı Yükleme + İsteğe Bağlı Doğrudan Tam Ekran Sunum Başlatma)
  const openBulkPreview = async (
    meeting: MeetingItem,
    filterPersonnelName?: string,
    opts?: { startInSlideshow?: boolean }
  ) => {
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    if (opts?.startInSlideshow && typeof document !== "undefined" && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }

    setLoadingMeetingSlides(true);
    setPreviewLoadingModal({
      title: opts?.startInSlideshow
        ? "Tam Ekran Sunum Gösterisi Başlatılıyor..."
        : "Toplantı Sunuları Yükleniyor...",
      subtitle: filterPersonnelName
        ? `${filterPersonnelName} sunu slaytları hazırlanıyor`
        : `${meeting.title} • Belirlenen sıralamayla sahne hazırlanıyor`,
    });

    try {
      const fastParams = new URLSearchParams({ fast: "1" });
      if (filterPersonnelName) fastParams.set("author", filterPersonnelName);

      const res = await shieldedFetchJson(
        `/api/presentations/meetings/${meeting._id}?${fastParams.toString()}`,
        { signal: controller.signal }
      );
      const data = res.data;
      if (!res.ok) throw new Error(data?.error || "Toplantı slaytları alınamadı");

      const allGroups: OrderedPresentationGroup[] = data.orderedPresentations || [];
      const groups = filterPersonnelName
        ? allGroups.filter((g) => g.authorName === filterPersonnelName)
        : allGroups;
      const coverForPreview = filterPersonnelName ? null : activeCoverRef.current;
      const flatSlides = buildBulkFlatSlides(groups, coverForPreview);

      setPreviewLoadingModal(null);

      if (flatSlides.length === 0) {
        if (opts?.startInSlideshow && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        toast.error("Bu toplantıda önizlenecek slayt bulunmuyor.");
        return;
      }

      setMobileBulkTab("preview");
      setIsBulkOrderConfirmOpen(false);
      setBulkPreviewModal({
        meeting: data.meeting,
        allGroups,
        initialOrderIds: allGroups.map((g) => g.presentationId),
        groups,
        flatSlides,
      });
      setBulkIdx(0);

      if (opts?.startInSlideshow) {
        isSlideshowActiveRef.current = true;
        setIsSlideshowOpen(true);
        wakeSlideshowHud();
      }

      // Kalan slaytları kullanıcıyı hiç bekletmeden arka planda şifreli kanaldan doldur!
      if (data.hasDeferred) {
        setIsHydratingBulkSlides(true);
        shieldedFetchJson(`/api/presentations/meetings/${meeting._id}`, {
          signal: controller.signal,
        })
          .then((fullRes) => (fullRes.ok ? fullRes.data : null))
          .then((fullData) => {
            if (!fullData?.orderedPresentations) return;
            const fullMap = new Map<string, OrderedPresentationGroup>();
            for (const fg of fullData.orderedPresentations as OrderedPresentationGroup[]) {
              fullMap.set(fg.presentationId, { ...fg, isPartial: false });
              slideCacheRef.current.set(fg.presentationId, {
                meetingId: meeting._id,
                slides: fg.slides,
              });
            }

            setBulkPreviewModal((prev) => {
              if (!prev || prev.meeting._id !== meeting._id) return prev;
              const hydrateGrp = (g: OrderedPresentationGroup) =>
                g.isPartial && fullMap.has(g.presentationId)
                  ? fullMap.get(g.presentationId)!
                  : g;
              const nextAllGroups = prev.allGroups.map(hydrateGrp);
              const nextGroups = prev.groups.map(hydrateGrp);
              return {
                ...prev,
                allGroups: nextAllGroups,
                groups: nextGroups,
                flatSlides: buildBulkFlatSlides(
                  nextGroups,
                  filterPersonnelName ? null : activeCoverRef.current
                ),
              };
            });
          })
          .catch(() => {})
          .finally(() => {
            setIsHydratingBulkSlides(false);
          });
      }
    } catch (err: any) {
      setPreviewLoadingModal(null);
      if (err?.name === "AbortError") return;
      toast.error(err.message);
    } finally {
      setLoadingMeetingSlides(false);
    }
  };

  // Toplu Önizleme Sol PowerPoint Şeridinde Grup Sırasını Taşı (Çok Sayfalı Sunular Birlikte Hareket Eder)
  const reorderBulkGroups = useCallback((fromIdx: number, toIdx: number) => {
    setBulkPreviewModal((prev) => {
      if (!prev) return null;
      if (
        fromIdx < 0 ||
        fromIdx >= prev.groups.length ||
        toIdx < 0 ||
        toIdx >= prev.groups.length ||
        fromIdx === toIdx
      ) {
        return prev;
      }

      const activeItem = prev.flatSlides[bulkIdx];
      const activeKey = activeItem
        ? `${activeItem.presentationId}_${activeItem.slideIndex}`
        : "";

      const nextGroups = [...prev.groups];
      const [movedGrp] = nextGroups.splice(fromIdx, 1);
      nextGroups.splice(toIdx, 0, movedGrp);

      let nextAllGroups: OrderedPresentationGroup[];
      if (prev.allGroups.length === nextGroups.length) {
        nextAllGroups = nextGroups;
      } else {
        const visibleSet = new Set(nextGroups.map((g) => g.presentationId));
        let cursor = 0;
        nextAllGroups = prev.allGroups.map((g) =>
          visibleSet.has(g.presentationId) ? nextGroups[cursor++] : g
        );
      }

      const nextFlat = buildBulkFlatSlides(
        nextGroups,
        prev.flatSlides[0]?.isCoverSlide ? activeCoverRef.current : null
      );
      if (activeKey) {
        const nextSlidePos = nextFlat.findIndex(
          (fs) => `${fs.presentationId}_${fs.slideIndex}` === activeKey
        );
        if (nextSlidePos >= 0) {
          setBulkIdx(nextSlidePos);
        }
      }

      setReorderLiveMsg(
        `${movedGrp.summaryTitle} sunusu ${toIdx + 1}. sıraya taşındı (toplam ${nextGroups.length}).`
      );

      return {
        ...prev,
        allGroups: nextAllGroups,
        groups: nextGroups,
        flatSlides: nextFlat,
      };
    });
  }, [bulkIdx]);

  // Toplu Önizlemede Yapılan Sıralamayı Sunucuya Kaydet
  const saveBulkPreviewOrder = async (closeAfterSave: boolean) => {
    if (!bulkPreviewModal) return;
    const orderedIds = bulkPreviewModal.allGroups.map((g) => g.presentationId);
    setSavingBulkOrder(true);
    try {
      const res = await fetch(
        `/api/presentations/meetings/${bulkPreviewModal.meeting._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reorder",
            presentationOrder: orderedIds,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Slayt sıralaması kaydedilemedi");

      toast.success("Slayt sıralaması başarıyla kaydedildi.");
      setIsBulkOrderConfirmOpen(false);
      if (closeAfterSave) {
        setBulkPreviewModal(null);
      } else {
        setBulkPreviewModal((prev) =>
          prev
            ? {
                ...prev,
                meeting: { ...prev.meeting, ...data.meeting },
                initialOrderIds: orderedIds,
              }
            : null
        );
      }
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Sıralama kaydedilemedi");
    } finally {
      setSavingBulkOrder(false);
    }
  };

  // PowerPoint Sol Dikey (Mobil Yatay) Mini Slayt Şeridi Pointer-Captured Tut-Sürükle İşleyicisi
  const handleFilmstripDragPointerDown = (
    fromGroupIdx: number,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (e.button !== 0 || filmstripDragRef.current || !bulkPreviewModal) return;
    e.preventDefault();
    e.stopPropagation();

    const handleEl = e.currentTarget;
    handleEl.setPointerCapture(e.pointerId);
    const isHorizontal = window.innerWidth < 1024;
    const totalGroups = bulkPreviewModal.groups.length;

    document.documentElement.classList.add("is-reordering-slides");

    const computeDropInsertIdx = (clientX: number, clientY: number): number => {
      const scroller = bulkFilmstripRef.current;
      if (!scroller) return fromGroupIdx;
      const scrollerRect = scroller.getBoundingClientRect();
      const clampedCoord = isHorizontal
        ? Math.max(scrollerRect.left, Math.min(scrollerRect.right, clientX))
        : Math.max(scrollerRect.top, Math.min(scrollerRect.bottom, clientY));

      for (let g = 0; g < totalGroups; g++) {
        if (g === fromGroupIdx) continue;
        const nodes = scroller.querySelectorAll<HTMLElement>(
          `[data-filmstrip-group-idx="${g}"]`
        );
        if (nodes.length === 0) continue;
        const firstRect = nodes[0].getBoundingClientRect();
        const lastRect = nodes[nodes.length - 1].getBoundingClientRect();
        const midpoint = isHorizontal
          ? (firstRect.left + lastRect.right) / 2
          : (firstRect.top + lastRect.bottom) / 2;
        if (clampedCoord < midpoint) {
          return g;
        }
      }
      return totalGroups;
    };

    const runAutoScroll = () => {
      const state = filmstripDragRef.current;
      const scroller = bulkFilmstripRef.current;
      if (!state || !scroller) return;

      const rect = scroller.getBoundingClientRect();
      const edgeThreshold = 46;
      let delta = 0;

      if (state.isHorizontal) {
        if (state.lastX < rect.left + edgeThreshold) {
          delta = -Math.ceil(((rect.left + edgeThreshold - state.lastX) / edgeThreshold) * 10);
        } else if (state.lastX > rect.right - edgeThreshold) {
          delta = Math.ceil(((state.lastX - (rect.right - edgeThreshold)) / edgeThreshold) * 10);
        }
        if (delta !== 0) scroller.scrollLeft += delta;
      } else {
        if (state.lastY < rect.top + edgeThreshold) {
          delta = -Math.ceil(((rect.top + edgeThreshold - state.lastY) / edgeThreshold) * 10);
        } else if (state.lastY > rect.bottom - edgeThreshold) {
          delta = Math.ceil(((state.lastY - (rect.bottom - edgeThreshold)) / edgeThreshold) * 10);
        }
        if (delta !== 0) scroller.scrollTop += delta;
      }

      if (delta !== 0) {
        const nextInsert = computeDropInsertIdx(state.lastX, state.lastY);
        if (nextInsert !== state.dropInsertIdx) {
          state.dropInsertIdx = nextInsert;
          setFilmstripDrag((prev) =>
            prev ? { ...prev, dropInsertIdx: nextInsert } : null
          );
        }
      }

      state.rafId = window.requestAnimationFrame(runAutoScroll);
    };

    filmstripDragRef.current = {
      pointerId: e.pointerId,
      fromGroupIdx,
      dropInsertIdx: fromGroupIdx,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      isHorizontal,
      rafId: window.requestAnimationFrame(runAutoScroll),
    };

    setFilmstripDrag({
      fromGroupIdx,
      dropInsertIdx: fromGroupIdx,
      dx: 0,
      dy: 0,
    });

    const cleanup = () => {
      const active = filmstripDragRef.current;
      if (active?.rafId) window.cancelAnimationFrame(active.rafId);
      filmstripDragRef.current = null;
      setFilmstripDrag(null);
      document.documentElement.classList.remove("is-reordering-slides");
      handleEl.removeEventListener("pointermove", onPointerMove);
      handleEl.removeEventListener("pointerup", onPointerUp);
      handleEl.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onEscCancel, true);
    };

    const onPointerMove = (ev: PointerEvent) => {
      const active = filmstripDragRef.current;
      if (!active || ev.pointerId !== active.pointerId) return;
      active.lastX = ev.clientX;
      active.lastY = ev.clientY;
      const dx = active.isHorizontal ? ev.clientX - active.startX : 0;
      const dy = active.isHorizontal ? 0 : ev.clientY - active.startY;
      const nextInsert = computeDropInsertIdx(ev.clientX, ev.clientY);
      active.dropInsertIdx = nextInsert;
      setFilmstripDrag({
        fromGroupIdx: active.fromGroupIdx,
        dropInsertIdx: nextInsert,
        dx,
        dy,
      });
    };

    const onPointerUp = (ev: PointerEvent) => {
      const active = filmstripDragRef.current;
      if (!active || ev.pointerId !== active.pointerId) return;
      const { fromGroupIdx: fromIdx, dropInsertIdx: insertIdx } = active;
      if (handleEl.hasPointerCapture(ev.pointerId)) {
        handleEl.releasePointerCapture(ev.pointerId);
      }
      cleanup();
      const targetIdx = insertIdx > fromIdx ? insertIdx - 1 : insertIdx;
      if (targetIdx !== fromIdx) {
        reorderBulkGroups(fromIdx, targetIdx);
      }
    };

    const onPointerCancel = (ev: PointerEvent) => {
      const active = filmstripDragRef.current;
      if (!active || ev.pointerId !== active.pointerId) return;
      cleanup();
    };

    const onEscCancel = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && filmstripDragRef.current) {
        ev.preventDefault();
        ev.stopPropagation();
        if (handleEl.hasPointerCapture(e.pointerId)) {
          handleEl.releasePointerCapture(e.pointerId);
        }
        cleanup();
      }
    };

    handleEl.addEventListener("pointermove", onPointerMove);
    handleEl.addEventListener("pointerup", onPointerUp);
    handleEl.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onEscCancel, true);
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
      const res = await shieldedSendJson(
        `/api/presentations/${current.presentationId}`,
        "PUT",
        { slides: updatedGroupSlides }
      );
      const data = res.data;
      if (!res.ok) throw new Error(data?.error || "Slayt güncellenemedi");

      setBulkPreviewModal((prev) => {
        if (!prev) return null;
        const nextGroups = prev.groups.map((g) =>
          g.presentationId === current.presentationId
            ? { ...g, slides: updatedGroupSlides }
            : g
        );
        const nextAllGroups = prev.allGroups.map((g) =>
          g.presentationId === current.presentationId
            ? { ...g, slides: updatedGroupSlides }
            : g
        );
        return {
          ...prev,
          allGroups: nextAllGroups,
          groups: nextGroups,
          flatSlides: buildBulkFlatSlides(
            nextGroups,
            prev.flatSlides[0]?.isCoverSlide ? activeCoverRef.current : null
          ),
        };
      });
      slideCacheRef.current.delete(current.presentationId);
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
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    setLoadingMeetingSlides(true);
    setPreviewLoadingModal({
      title: "Toplantı Yönetim Paneli Açılıyor...",
      subtitle: `${meeting.title} • Sunu listesi hazırlanıyor`,
    });
    try {
      const res = await shieldedFetchJson(`/api/presentations/meetings/${meeting._id}`, {
        signal: controller.signal,
      });
      const data = res.data;
      setPreviewLoadingModal(null);
      if (!res.ok) throw new Error(data?.error || "Toplantı slaytları alınamadı");
      setManageMeetingModal({
        meeting: data.meeting,
        orderedPresentations: data.orderedPresentations || [],
      });
    } catch (err: any) {
      setPreviewLoadingModal(null);
      if (err?.name === "AbortError") return;
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

  // Birleştirilmiş Sunuyu Sıkıştırılmış Olarak İndir & VDS Üzerinde Sıkıştırılmış Sakla
  const downloadCombinedMeetingPptx = async (params: {
    meeting: MeetingItem;
    orderedGroups?: OrderedPresentationGroup[];
    saveOrderFirst?: boolean;
  }) => {
    const { meeting, orderedGroups, saveOrderFirst = false } = params;
    setExportingMeeting(true);
    try {
      if (saveOrderFirst && orderedGroups && meeting.status === "open") {
        const presentationOrder = orderedGroups.map((g) => g.presentationId);
        await fetch(`/api/presentations/meetings/${meeting._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reorder", presentationOrder }),
        });
      }

      // 1. Önce sunucuda güncel sıkıştırılmış .pptx arşivi var mı kontrol et (varsa 0ms yeniden üretimle anında indir!)
      const cachedRes = await fetch(
        `/api/presentations/meetings/${meeting._id}?downloadCombined=1`
      );
      if (cachedRes.status === 200) {
        const archivedBlob = await cachedRes.blob();
        if (archivedBlob.size > 0) {
          const safeName = `${meeting.title.replace(/[\\/:*?"<>|]/g, "_")}.pptx`;
          const url = URL.createObjectURL(archivedBlob);
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = safeName;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 1000);
          toast.success(
            `Sıkıştırılmış birleştirilmiş sunum indirildi (${formatBytesLabel(archivedBlob.size)}).`
          );
          void fetchAll({ silent: true });
          return;
        }
      }

      // 2. Güncel arşiv yoksa veya slaytlar değiştiyse eksiksiz tüm slaytları şifreli kanaldan al
      let fullGroups = orderedGroups || [];
      if (fullGroups.length === 0 || fullGroups.some((g) => g.isPartial)) {
        const fullRes = await shieldedFetchJson(
          `/api/presentations/meetings/${meeting._id}`
        );
        const fullData = fullRes.data;
        if (!fullRes.ok) {
          throw new Error(fullData?.error || "Toplantı slaytları alınamadı.");
        }
        fullGroups = fullData.orderedPresentations || [];
      }

      const combinedSlides = fullGroups.flatMap((g) => g.slides);
      if (combinedSlides.length === 0) {
        toast.error("Bu toplantıda indirilecek slayt bulunmuyor.");
        return;
      }

      // 3. Kayıpsız yüksek çözünürlüklü + Kapak Slaytı (Sayfa 1) + SlideMaster tekilleştirmeli + DEFLATE-9 sıkıştırmalı .pptx üret ve indir
      const { blob, fileName } = await exportSlidesToPptx({
        slides: combinedSlides,
        fileName: `${meeting.title}.pptx`,
        templates,
        coverTemplate: activeCoverRef.current,
        meetingBackgroundPreset: meeting.backgroundPreset || "template",
        meetingPhotoFramePreset: meeting.photoFramePreset || "none",
        triggerDownload: true,
      });

      toast.success(
        `Birleştirilmiş sunum sıkıştırılmış olarak indirildi (${formatBytesLabel(blob.size)}).`
      );

      // 4. VDS üzerinde Brotli + AES-256 ile sıkıştırılmış olarak arka planda sakla (kullanıcıyı bekletmez)
      const fd = new FormData();
      fd.append("file", blob, fileName);
      fetch(`/api/presentations/meetings/${meeting._id}`, {
        method: "PUT",
        body: fd,
      })
        .then(() => fetchAll({ silent: true }))
        .catch(() => {});

      if (manageMeetingModal && manageMeetingModal.meeting._id === meeting._id) {
        const refreshed = await shieldedFetchJson(
          `/api/presentations/meetings/${meeting._id}`
        );
        const refData = refreshed.data;
        if (refreshed.ok) {
          setManageMeetingModal({
            meeting: refData.meeting,
            orderedPresentations: refData.orderedPresentations || [],
          });
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Toplu sunu indirilemedi.");
    } finally {
      setExportingMeeting(false);
    }
  };

  const handleMeetingAction = async (
    action: "reorder" | "lock" | "unlock" | "close" | "downloadCombined"
  ) => {
    if (!manageMeetingModal) return;
    const { meeting, orderedPresentations } = manageMeetingModal;
    const presentationOrder = orderedPresentations.map((g) => g.presentationId);

    if (action === "downloadCombined") {
      await downloadCombinedMeetingPptx({
        meeting,
        orderedGroups: orderedPresentations,
        saveOrderFirst: true,
      });
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
    const target = deleteTarget;
    const prevPresentations = presentations;
    const prevMeetings = meetings;

    // İyimser (Optimistic) anlık silme: arayüzden sıfır beklemeyle kaldır
    setDeleteTarget(null);
    setPresentations((prev) => prev.filter((p) => p._id !== target._id));
    setMeetings((prev) =>
      prev.map((m) =>
        m._id === String(target.meetingId)
          ? {
              ...m,
              recordCount: Math.max(0, m.recordCount - 1),
              totalSlides: Math.max(0, m.totalSlides - (target.slideCount || 1)),
            }
          : m
      )
    );

    try {
      const res = await fetch(`/api/presentations/${target._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Silinemedi");
      toast.success("Sunu kaydı silindi.");
    } catch (err: any) {
      // Hata durumunda geri al
      setPresentations(prevPresentations);
      setMeetings(prevMeetings);
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
    const editorBgPreset = editorMeeting?.backgroundPreset || "template";
    const editorFramePreset = editorMeeting?.photoFramePreset || "none";
    const currentTop = activeSlide.descTopPct ?? 46;
    const currentBottom = activeSlide.descBottomPct ?? 96.5;
    const currentPhotoW = activeSlide.photoWidthPct ?? 41;
    const currentPhotoH = activeSlide.photoHeightPct ?? 41.6;
    const currentPhotoLeft = activeSlide.photoLeftPct ?? 3.2;
    const currentFit = activeSlide.photoFitMode || "contain";

    return (
      <div className="space-y-5 max-w-[1440px] mx-auto">
        <div className="rounded-3xl p-4 sm:p-5 bg-gradient-to-r from-[#0b192c] via-[#132c52] to-[#1e3a8a] text-white shadow-xl shadow-slate-900/15 border border-slate-800/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <button
              onClick={handleExitEditor}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              Klasöre Dön
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                {editingId
                  ? "Sunuyu Düzenle"
                  : editorCopySourceInfo
                    ? "Kopyalanan Sunuyu Yeni Toplantı İçin Düzenle"
                    : "Yeni Sunu Slaytları Hazırla"}
              </h1>
              <p className="text-xs text-blue-200/90">
                Çok sayfalı slaytlar hazırlayabilir, fotoğraf yerleşimini ve açıklamaları canlı önizleyebilirsiniz
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() =>
                exportSlidesToPptx({
                  slides,
                  fileName: `${activeSlide.fullName || "sunu"}.pptx`,
                  templates,
                  meetingBackgroundPreset: editorBgPreset,
                  meetingPhotoFramePreset: editorFramePreset,
                })
              }
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm font-bold transition-all"
            >
              <Download className="w-4 h-4 text-emerald-300" />
              Önizleme İndir (.pptx)
            </button>
            <button
              onClick={handleSavePresentation}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-emerald-950/30 ring-1 ring-white/25 disabled:opacity-60 transition-all active:scale-95"
            >
              <Save className="w-4 h-4" />
              {saving ? "Kaydediliyor..." : "Sisteme Kaydet"}
            </button>
          </div>
        </div>

        {editorCopySourceInfo && (
          <div className="px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CopyPlus className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>
                <strong>{editorCopySourceInfo.fromMeetingTitle}</strong> dosyasındaki{" "}
                <strong>{editorCopySourceInfo.summaryTitle}</strong> sunusunun bir kopyası üzerinde çalışıyorsunuz. Eski toplantıdaki kayıt <strong>değişmez</strong>; kaydettiğinizde{" "}
                <strong>{editorMeeting?.title || "Açık Toplantı"}</strong> klasörüne yeni sunu olarak eklenir.
              </span>
            </div>
          </div>
        )}

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
                  Kurumsal Yazı Tipi (Standart)
                </label>
                <div
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 flex items-center justify-between"
                  title="Tüm sunularda tek tip düzgün görünüm için kurumsal Verdana yazı tipi standarttır."
                >
                  <span>Verdana (Tek Tip Standart)</span>
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>
            </div>

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
                  onChange={(e) =>
                    updateAllSlidesPerson({
                      fullName: e.target.value.replace(/[\r\n\t]+/g, " "),
                    })
                  }
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
                  onChange={(e) =>
                    updateAllSlidesPerson({
                      neighborhood: e.target.value.replace(/[\r\n\t]+/g, " "),
                    })
                  }
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
                        <ProtectedCanvasImage
                          src={src}
                          alt={`Foto ${idx + 1}`}
                          fit="contain"
                          className="w-full h-full"
                        />
                        <button
                          type="button"
                          onClick={() => handleOpenCropModal(idx, "crop")}
                          className="absolute top-1 left-1 p-1 rounded-full bg-blue-600/90 text-white hover:bg-blue-600 transition-all shadow-md group-hover:scale-105"
                          title="Fotoğrafı Kırp / Kes"
                        >
                          <Scissors className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCropModal(idx, "adjust")}
                          className="absolute top-1 left-7 p-1 rounded-full bg-amber-600/90 text-white hover:bg-amber-600 transition-all shadow-md group-hover:scale-105"
                          title="Fotoğraf Işık ve Renk Ayarları"
                        >
                          <Sun className="w-3 h-3" />
                        </button>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                        {isClassic ? "Fotoğraf Boyutu & En-Boy Modu" : "En-Boy Modu"}
                      </span>
                      <button
                        type="button"
                        disabled={!activeSlide.photos || activeSlide.photos.length === 0}
                        onClick={() => handleOpenCropModal(0, "crop")}
                        className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          activeSlide.photos?.length > 0
                            ? "Fotoğrafı Kırp, Kes ve Döndür"
                            : "Önce fotoğraf yükleyin"
                        }
                      >
                        <Scissors className="w-3 h-3 text-blue-600" />
                        Kırp / Kes
                      </button>
                      <button
                        type="button"
                        disabled={!activeSlide.photos || activeSlide.photos.length === 0}
                        onClick={() => handleOpenCropModal(0, "adjust")}
                        className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          activeSlide.photos?.length > 0
                            ? "Fotoğrafın ışık, parlaklık, kontrast ve renk ayarlarını yapın"
                            : "Önce fotoğraf yükleyin"
                        }
                      >
                        <Sun className="w-3 h-3 text-amber-600" />
                        Işık & Renk
                      </button>
                    </div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 flex justify-between mb-1">
                          <span className="flex items-center gap-1">
                            <MoveHorizontal className="w-3 h-3 text-slate-500" />
                            Sağa / Sola Kaydır
                          </span>
                          <span>%{currentPhotoLeft.toFixed(1)}</span>
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={25}
                          step={0.5}
                          value={currentPhotoLeft}
                          onChange={(e) =>
                            updateCurrentSlide({ photoLeftPct: Number(e.target.value) })
                          }
                          className="w-full accent-blue-600"
                        />
                      </div>
                    </div>
                  )}

                  {/* Sadece Süper Admin İçin: Aktif Toplantıdaki Tüm Sunulara Toplu Kurumsal Fotoğraf Çerçevesi Seçimi */}
                  {isSuperAdmin && editorMeeting && editorMeeting.status === "open" && (
                    <div className="pt-2.5 border-t border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-extrabold text-indigo-900 flex items-center gap-1.5">
                          <Frame className="w-3.5 h-3.5 text-indigo-600" />
                          Toplu Fotoğraf Çerçevesi (Süper Admin • Tüm Toplantı Sunularına Uygulanır)
                        </span>
                      </div>
                      <select
                        value={editorFramePreset}
                        onChange={(e) =>
                          handleSetMeetingPhotoFrame(editorMeeting._id, e.target.value)
                        }
                        className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {PHOTO_FRAME_PRESETS.map((fp) => (
                          <option key={fp.id} value={fp.id}>
                            {fp.label} — {fp.description}
                          </option>
                        ))}
                      </select>
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
                              ? Math.min(Number(activeSlide.fontSize), editorMaxSafePt)
                              : Math.min(13.5, editorMaxSafePt);
                          updateCurrentSlide({
                            fontSize: Math.max(5.5, Math.round((base - 0.5) * 10) / 10),
                          });
                        }}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
                      >
                        -
                      </button>
                      <span className="text-xs font-semibold min-w-12 px-1 text-center text-slate-700 tabular-nums">
                        {!activeSlide.fontSize || activeSlide.fontSize === "auto"
                          ? "Oto"
                          : `${Math.min(Number(activeSlide.fontSize), editorMaxSafePt)} pt`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const base =
                            activeSlide.fontSize && activeSlide.fontSize !== "auto"
                              ? Math.min(Number(activeSlide.fontSize), editorMaxSafePt)
                              : Math.min(13.5, editorMaxSafePt);
                          if (base >= editorMaxSafePt) {
                            toast(
                              `Metnin kutudan taşmaması için bu slaytta maksimum güvenli punto ${editorMaxSafePt} pt'dir.`,
                              { icon: "📏" }
                            );
                            return;
                          }
                          const nextDesc = Math.min(editorMaxSafePt, Math.round((base + 0.5) * 10) / 10);
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
                meetingPhotoFramePreset={editorFramePreset}
                onReorderPhotos={(newPhotos) => updateCurrentSlide({ photos: newPhotos })}
                onMaxSafeFontSizeChange={setEditorMaxSafePt}
              />
            </div>

            {hasDescBox && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                    Slayt Açıklama Maddeleri
                  </label>
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                    Canlı ➢ Madde Görünümü Aktif
                  </span>
                </div>
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

        {/* Fotoğraf Kırpma, Kesme & Işıklandırma Modalı */}
        {cropModal.isOpen && activeSlide?.photos?.[cropModal.photoIdx] && (
          <PhotoCropModal
            isOpen={cropModal.isOpen}
            photoSrc={activeSlide.photos[cropModal.photoIdx]}
            allPhotos={activeSlide.photos}
            activePhotoIdx={cropModal.photoIdx}
            initialTab={cropModal.initialTab}
            onSelectPhotoIdx={(newIdx) =>
              setCropModal((prev) => ({ ...prev, photoIdx: newIdx }))
            }
            onClose={() => setCropModal((prev) => ({ ...prev, isOpen: false }))}
            onApplyCrop={handleApplyCroppedPhoto}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      {/* Başlık ve Uyumlu Kurumsal Aksiyon Barı */}
      <div className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-[#0b192c] via-[#132c52] to-[#1e3a8a] text-white shadow-xl shadow-slate-900/15 border border-slate-800/60 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-950/50 ring-1 ring-white/20 shrink-0">
            <PresentationIcon className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold text-blue-200">
                <Sparkles className="w-3 h-3 text-amber-300" />
                Mütevelli Heyeti Sunu Sistemi
              </span>
              {hasOpenMeeting && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[11px] font-bold text-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Aktif Toplantı Açık
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Sunular & Toplantı Slaytları
            </h1>
            <p className="text-xs sm:text-sm text-blue-100/85 mt-0.5 max-w-2xl">
              Hazırlanan hane sunularını anlık görüntüleyin, tek tıkla önizleyin ve toplantı sonunda tek bir PowerPoint (.pptx) dosyası olarak birleştirin.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-2.5 w-full xl:w-auto shrink-0">
          {(isSuperAdmin || isManager) && (
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 p-1.5 rounded-2xl bg-white/[0.07] border border-white/15 backdrop-blur-xs w-full sm:w-auto">
              {isSuperAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsCoverModalOpen(true)}
                    title="Süper Admin: Tüm toplantı slaytlarının en başında (1. sayfa) görünecek Kapak Şablonunu yükle ve yönet"
                    className={`flex-1 sm:flex-none h-9.5 px-3.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap active:scale-95 ${
                      activeCoverTemplate
                        ? "bg-amber-400/20 hover:bg-amber-400/30 text-amber-100 border border-amber-300/35"
                        : "bg-white/5 hover:bg-white/15 text-slate-200 border border-white/10"
                    }`}
                  >
                    <Sparkles aria-hidden="true" className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span>Kapak {activeCoverTemplate ? "• Aktif" : "(Yok)"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTemplateModalOpen(true)}
                    className="flex-1 sm:flex-none h-9.5 px-3.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap active:scale-95"
                  >
                    <Upload aria-hidden="true" className="w-3.5 h-3.5 text-blue-200 shrink-0" />
                    <span>Şablonlar ({templates.length})</span>
                  </button>
                </>
              )}
              {isManager && (
                <button
                  type="button"
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
                  className="flex-1 sm:flex-none h-9.5 px-3.5 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/35 disabled:bg-white/5 border border-emerald-400/35 disabled:border-white/10 disabled:text-slate-400 text-emerald-100 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap active:scale-95"
                >
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>Yeni Toplantı Aç</span>
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleStartNew}
            className="w-full sm:w-auto h-11 px-5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:via-orange-500 hover:to-rose-400 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-orange-950/35 ring-1 ring-white/25 inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all hover:-translate-y-0.5 active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.6]" />
            <span>Yeni Sunu Hazırla</span>
          </button>
        </div>
      </div>

      {/* Toplantı Dosyaları Klasör Görünümü veya Seçili Toplantı Dosyasının İçi */}
      {(!insideFolder || !selectedMeeting) ? (
        <div className="gov-card p-5 sm:p-6 rounded-3xl space-y-5">
          {/* TÜM TOPLANTI DOSYALARINDA SUNU ARA-BUL (Resim 2 Tasarımında Genel Arşiv Arama Merkezi) */}
          <search
            aria-label="Tüm toplantı dosyaları içindeki sunularda ara"
            className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-slate-50 border-2 border-blue-200/90 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/15 shadow-sm transition-all space-y-3.5"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-[11px] font-extrabold tracking-wide shadow-xs">
                  <Search className="w-3.5 h-3.5" aria-hidden="true" />
                  TÜM TOPLANTILARDA SUNU ARA-BUL
                </span>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <span>Tüm Toplantı Dosyalarında Sunu Ara</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white text-blue-700 text-xs font-extrabold border border-blue-200 shadow-2xs tabular-nums">
                    {meetings.length} Klasör
                  </span>
                </h2>
              </div>

              {activeOpenMeeting ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold self-start lg:self-auto">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>
                    Kopyalama Hedefi Açık Toplantı:{" "}
                    <strong>{activeOpenMeeting.title}</strong>
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold self-start lg:self-auto">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Kopyalama için açık toplantı bekleniyor</span>
                </span>
              )}
            </div>

            <div className="relative">
              <label htmlFor="global-presentations-search-input" className="sr-only">
                Tüm eski ve açık toplantı dosyalarında vatandaş adı soyadı, mahalle/köy, açıklama veya personel ara
              </label>
              {searchingGlobal ? (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <Search
                  aria-hidden="true"
                  className="w-5 h-5 text-blue-600 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                />
              )}
              <input
                id="global-presentations-search-input"
                name="globalPresentationSearch"
                type="search"
                enterKeyHint="search"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Tüm eski ve açık toplantı dosyalarında vatandaş adı soyadı, mahalle/köy, açıklama veya hazırlayan personel ara..."
                className={`w-full h-12 pl-12 ${
                  globalSearch ? "pr-28" : "pr-4"
                } rounded-xl text-sm sm:text-base font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none transition-all ${
                  globalSearch.trim()
                    ? "bg-white border-2 border-blue-600 ring-4 ring-blue-500/15 shadow-md"
                    : "bg-white border-2 border-blue-200/90 hover:border-blue-400 focus:border-blue-600 shadow-xs"
                }`}
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => setGlobalSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-700 hover:text-red-700 text-xs font-bold inline-flex items-center gap-1 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Temizle</span>
                </button>
              )}
            </div>
          </search>

          {/* Tüm Toplantı Dosyaları Genel Arama Sonuçları */}
          {debouncedGlobalSearch.trim() && (
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/90 border border-blue-200/80 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                    Tüm Toplantılarda Bulunan Sunular
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white text-xs font-extrabold tabular-nums">
                    {searchingGlobal ? "..." : globalTotalMatched}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  Eski/kapatılmış toplantılardaki sunular salt okunurdur; görüntüleyebilir veya açık toplantıya bir kopyasını aktarabilirsiniz.
                </span>
              </div>

              {searchingGlobal && globalResults.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Tüm toplantı klasörleri taranıyor...
                </div>
              ) : globalResults.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200">
                  Aradığınız ifadeyle eşleşen herhangi bir sunu kaydı tüm toplantı dosyalarında bulunamadı.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {globalResults.map((item) => {
                    const isClosedSource = item.meetingStatus === "closed";
                    const isCopyingThis = copyingRecordId === item._id;
                    return (
                      <div
                        key={`global-hit-${item._id}`}
                        onMouseEnter={() => prefetchRecordSlides(item)}
                        onClick={() => handleOpenRecord(item, "preview")}
                        className="p-4 rounded-2xl border border-slate-200/90 hover:border-blue-400 hover:shadow-lg bg-white flex flex-col justify-between gap-3 transition-all cursor-pointer group"
                      >
                        <div className="space-y-2.5">
                          {/* Hangi Toplantı Dosyasında Bulunduğu Bilgisi */}
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                            <span
                              title={item.meetingTitle}
                              className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-slate-700 truncate min-w-0"
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span className="truncate">{item.meetingTitle}</span>
                            </span>
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isClosedSource
                                  ? "bg-slate-100 text-slate-600 border border-slate-200"
                                  : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                              }`}
                            >
                              {isClosedSource ? "Kapatıldı • Salt Okunur" : "Açık Toplantı"}
                            </span>
                          </div>

                          <div className="flex items-start gap-3">
                            <div
                              style={
                                item.meetingPhotoFramePreset &&
                                item.meetingPhotoFramePreset !== "none"
                                  ? getPhotoFrameWebStyle(
                                      item.meetingPhotoFramePreset,
                                      true
                                    )
                                  : undefined
                              }
                              className="relative w-22 h-16.5 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0 shadow-2xs"
                            >
                              {item.firstPhoto ? (
                                <ProtectedCanvasImage
                                  src={item.firstPhoto}
                                  alt="Slayt Önizleme"
                                  fit="cover"
                                  className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                  <PresentationIcon className="w-5 h-5" />
                                </div>
                              )}
                              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-slate-900/80 text-white text-[9.5px] font-extrabold">
                                {item.slideCount} Sayfa
                              </span>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="font-extrabold text-slate-900 group-hover:text-blue-700 text-sm line-clamp-2 leading-snug">
                                {item.summaryTitle}
                              </div>
                              <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-md bg-blue-50/80 text-[11px] font-bold text-blue-700">
                                <span>{item.createdBy?.name || "Personel"}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1">
                                {new Date(item.createdAt).toLocaleDateString("tr-TR")}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div
                          className="flex flex-wrap items-center justify-between gap-1.5 pt-2.5 border-t border-slate-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleOpenRecord(item, "preview")}
                            className="h-8 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-600" />
                            <span>Görüntüle</span>
                          </button>

                          {canAddToOpenMeeting && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isCopyingThis}
                                onClick={() => handleCopyToOpenMeetingDirect(item)}
                                title="Bu sununun tüm slaytlarını olduğu gibi aktif açık toplantıya kopyala"
                                className="h-8 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center gap-1 shadow-2xs transition-colors"
                              >
                                <CopyPlus className="w-3.5 h-3.5 shrink-0" />
                                <span>Aynen Kopyala</span>
                              </button>
                              <button
                                type="button"
                                disabled={isCopyingThis}
                                onClick={() => handleCopyToEditorAndModify(item)}
                                title="Yeni toplantıya bir kopyasını aktar ve üzerinde değişiklik yaparak kaydet"
                                className="h-8 px-2.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200/90 hover:border-blue-600 text-xs font-extrabold inline-flex items-center gap-1 transition-colors"
                              >
                                <Copy className="w-3.5 h-3.5 shrink-0" />
                                <span>Kopyala & Düzenle</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <FolderOpen className="w-4.5 h-4.5 text-blue-600" />
              <span>Toplantı Dosyaları — İşlem yapmak için aktif veya geçmiş bir klasör seçin</span>
            </h2>
            {meetings.length > 0 && (
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Aktif: {meetings.filter((m) => m.status === "open").length}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Kapatılmış: {meetings.filter((m) => m.status === "closed").length}
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-sm text-slate-500 py-8 text-center">Toplantılar yükleniyor...</div>
          ) : meetings.length === 0 ? (
            <div className="text-sm text-slate-500 bg-slate-50 rounded-2xl p-8 text-center border border-dashed border-slate-200">
              Henüz açılmış toplantı bulunmuyor. Yetkili yönetici <strong>Yeni Toplantı Aç</strong> butonundan toplantı oluşturabilir.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...meetings]
                .sort((a, b) => {
                  if (a.status === "open" && b.status !== "open") return -1;
                  if (a.status !== "open" && b.status === "open") return 1;
                  return (
                    new Date(b.meetingDate).getTime() -
                    new Date(a.meetingDate).getTime()
                  );
                })
                .map((m) => (
                  <div
                    key={m._id}
                    onClick={() => {
                      setSelectedMeetingId(m._id);
                      setSearch("");
                      setPresPage(1);
                      setInsideFolder(true);
                    }}
                    className={`group relative cursor-pointer p-5 rounded-2xl border transition-all overflow-hidden hover:-translate-y-0.5 hover:shadow-xl ${
                      m.status === "open"
                        ? "border-emerald-300 bg-gradient-to-br from-emerald-50/45 via-white to-white hover:border-emerald-500 shadow-sm shadow-emerald-900/5"
                        : "border-slate-200/90 bg-white hover:border-blue-500 hover:shadow-blue-900/8"
                    }`}
                  >
                    <div
                      className={`absolute inset-x-0 top-0 h-1.5 ${
                        m.status === "open"
                          ? m.isLocked
                            ? "bg-gradient-to-r from-amber-400 to-orange-500"
                            : "bg-gradient-to-r from-emerald-400 to-teal-500"
                          : "bg-slate-300"
                      }`}
                    />
                    <div className="flex items-start justify-between gap-3 pt-1">
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-slate-900 group-hover:text-blue-700 text-base truncate flex items-center gap-2 transition-colors">
                          <div
                            className={`p-2 rounded-xl transition-colors shrink-0 ${
                              m.status === "open"
                                ? "bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white"
                                : "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white"
                            }`}
                          >
                            <FolderOpen className="w-4 h-4" />
                          </div>
                          <span className="truncate">{m.title}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-3">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
                            {new Date(m.meetingDate).toLocaleDateString("tr-TR")}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-bold">
                            {m.recordCount} Sunu
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold">
                            {m.totalSlides} Sayfa
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100 text-[11px]">
                          <span className="text-slate-500 font-medium truncate">
                            {isSuperAdmin && m.authorizedUserId?.name
                              ? `Yetkili: ${m.authorizedUserId.name}`
                              : m.status === "open"
                                ? "Slayt ekleme ve düzenlemeye açık"
                                : "Görüntüleme ve kopyalamaya açık"}
                          </span>
                          <span className="font-extrabold text-blue-600 group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-0.5 shrink-0">
                            <span>Klasörü Aç</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          m.status === "open"
                            ? m.isLocked
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {m.status === "open" ? (
                          m.isLocked ? (
                            <>
                              <Lock className="w-3 h-3" /> Kilitli
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3 h-3" /> Aktif / Açık
                            </>
                          )
                        ) : (
                          <>
                            <Lock className="w-3 h-3" /> Pasif / Kapatıldı
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
        <div className="space-y-5">
          {/* Toplantı Dosyası Üst Bilgi & Derli Toplu Kontrol Merkezi */}
          <div className="gov-card p-5 sm:p-6 rounded-3xl space-y-4">
            {/* 1. Satır: Toplantı Başlığı + Birincil Toplantı Aksiyonları */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setInsideFolder(false)}
                  className="h-10 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 border border-slate-200/80 shrink-0 transition-all active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Tüm Klasörler</span>
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                      {selectedMeeting.title}
                    </h2>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        selectedMeeting.status === "open"
                          ? selectedMeeting.isLocked
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          selectedMeeting.status === "open"
                            ? selectedMeeting.isLocked
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                            : "bg-slate-500"
                        }`}
                      />
                      {selectedMeeting.status === "open"
                        ? selectedMeeting.isLocked
                          ? "Sıralama Kilidi Aktif"
                          : "Açık Toplantı"
                        : "Kapatıldı • Salt Okunur"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500 mt-1">
                    <span>
                      {new Date(selectedMeeting.meetingDate).toLocaleDateString("tr-TR")}
                    </span>
                    <span className="text-slate-300">•</span>
                    <strong className="text-slate-700">
                      {selectedPersonnelId
                        ? presentations.filter(
                            (p) => String(p.createdBy?._id || "") === selectedPersonnelId
                          ).length
                        : selectedMeeting.recordCount}{" "}
                      Sunu Kaydı
                    </strong>
                    <span className="text-slate-300">•</span>
                    <strong className="text-slate-700">
                      {selectedPersonnelId
                        ? presentations
                            .filter((p) => String(p.createdBy?._id || "") === selectedPersonnelId)
                            .reduce((sum, p) => sum + (p.slideCount || 0), 0)
                        : selectedMeeting.totalSlides}{" "}
                      Slayt Sayfası
                    </strong>
                    {isSuperAdmin && selectedMeeting.authorizedUserId?.name && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span className="text-blue-700 font-semibold">
                          Yetkili: {selectedMeeting.authorizedUserId.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Birincil Aksiyon Butonları (Eşit Yükseklik, Kurumsal Renk Uyumu) */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const selAuthor = selectedPersonnelId
                      ? presentations.find(
                          (p) => String(p.createdBy?._id || "") === selectedPersonnelId
                        )?.createdBy?.name
                      : undefined;
                    openBulkPreview(selectedMeeting, selAuthor);
                  }}
                  disabled={loadingMeetingSlides}
                  className="h-10 px-4 rounded-xl bg-[#0f223d] hover:bg-[#173259] disabled:opacity-75 text-white text-xs font-extrabold shadow-sm inline-flex items-center gap-2 transition-all active:scale-95"
                >
                  {loadingMeetingSlides ? (
                    <progress
                      aria-label="Yükleniyor"
                      className="loading-spinner"
                      style={
                        {
                          "--size": "15px",
                          "--thickness": "2px",
                          "--spinner-color": "#7dd3fc",
                        } as React.CSSProperties
                      }
                    />
                  ) : (
                    <Eye className="w-4 h-4 text-sky-300" />
                  )}
                  <span>{loadingMeetingSlides ? "Yükleniyor..." : "Toplu Önizle"}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-white/15 text-[11px] font-extrabold tabular-nums">
                    {selectedPersonnelId
                      ? presentations.filter(
                          (p) => String(p.createdBy?._id || "") === selectedPersonnelId
                        ).length
                      : selectedMeeting.recordCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const selAuthor = selectedPersonnelId
                      ? presentations.find(
                          (p) => String(p.createdBy?._id || "") === selectedPersonnelId
                        )?.createdBy?.name
                      : undefined;
                    openBulkPreview(selectedMeeting, selAuthor, { startInSlideshow: true });
                  }}
                  disabled={loadingMeetingSlides || selectedMeeting.recordCount === 0}
                  title="Belirlenen sıralamayla projeksiyon için tam ekran sunum gösterisini başlat (ESC ile önizlemeye döner)"
                  className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold shadow-sm inline-flex items-center gap-2 transition-all active:scale-95"
                >
                  <Play aria-hidden="true" className="w-3.5 h-3.5 fill-current" />
                  <span>Tam Ekran Sunum</span>
                </button>

                {canManageSelectedMeeting && selectedMeeting.status === "open" && (
                  <button
                    type="button"
                    onClick={() => openManageMeeting(selectedMeeting)}
                    disabled={loadingMeetingSlides}
                    className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow-sm inline-flex items-center gap-2 transition-all active:scale-95"
                  >
                    <Layers className="w-4 h-4" />
                    <span>Sırala / Kilitle & Sonlandır</span>
                  </button>
                )}

                {selectedMeeting.status === "closed" && (
                  <>
                    <button
                      type="button"
                      onClick={() => openManageMeeting(selectedMeeting)}
                      disabled={loadingMeetingSlides}
                      className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow-sm inline-flex items-center gap-2 transition-all active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      <span>Birleştirilmiş Sunuyu İndir (.pptx)</span>
                    </button>
                    {canManageSelectedMeeting &&
                      selectedMeeting.closedAt &&
                      Date.now() - new Date(selectedMeeting.closedAt).getTime() <=
                        12 * 60 * 60 * 1000 && (
                        <button
                          type="button"
                          onClick={() => handleReopenMeeting(selectedMeeting)}
                          className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-sm inline-flex items-center gap-1.5 transition-all active:scale-95"
                          title="Kapatıldıktan sonraki 12 saat içinde tekrar açılabilir"
                        >
                          <Unlock className="w-4 h-4" />
                          <span>Toplantıyı Tekrar Aç</span>
                        </button>
                      )}
                  </>
                )}
              </div>
            </div>

            {/* 2. Satır: Birleşik ve Düzenli Toplantı Görünüm & Yetki Ayarları Şeridi */}
            {(isSuperAdmin ||
              (canManageSelectedMeeting && selectedMeeting.status === "open")) && (
              <div className="p-2.5 rounded-2xl bg-slate-50/90 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
                {isSuperAdmin && (
                  <div className="flex items-center gap-2.5 px-3 h-11 rounded-xl bg-white border border-slate-200/90 hover:border-blue-300 transition-colors min-w-0">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="meeting-transition-select"
                        className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none mb-0.5"
                      >
                        Slayt Geçiş Efekti
                      </label>
                      <select
                        id="meeting-transition-select"
                        title="Süper Admin: Tam ekran slayt sunumunda slaytlar arası geçiş efektini seç"
                        value={selectedMeeting.transitionPreset || "kurumsal_kaydir"}
                        onChange={(e) =>
                          handleSetMeetingTransition(selectedMeeting._id, e.target.value)
                        }
                        className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none truncate"
                      >
                        {SLIDESHOW_TRANSITION_PRESETS.map((tp) => (
                          <option key={tp.id} value={tp.id}>
                            {tp.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {isSuperAdmin && selectedMeeting.status === "open" && (
                  <div className="flex items-center gap-2.5 px-3 h-11 rounded-xl bg-white border border-slate-200/90 hover:border-blue-300 transition-colors min-w-0">
                    <Lock className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="meeting-auth-user-select"
                        className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none mb-0.5"
                      >
                        Toplantı Yetkilisi
                      </label>
                      <select
                        id="meeting-auth-user-select"
                        value={selectedMeeting.authorizedUserId?._id || ""}
                        onChange={(e) =>
                          handleAssignAuthorizedUser(selectedMeeting._id, e.target.value)
                        }
                        className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none truncate"
                        title="Süper Admin: Toplantı için yetkili kullanıcı ata veya değiştir"
                      >
                        <option value="">Atanmadı (Seçin)</option>
                        {staffUsers.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {canManageSelectedMeeting && selectedMeeting.status === "open" && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsBgPickerOpen((p) => !p);
                      setIsFramePickerOpen(false);
                    }}
                    className={`flex items-center gap-2.5 px-3 h-11 rounded-xl border text-left transition-all min-w-0 ${
                      isBgPickerOpen
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white hover:border-blue-300 text-slate-800 border-slate-200/90"
                    }`}
                  >
                    <ImageIcon
                      className={`w-4 h-4 shrink-0 ${
                        isBgPickerOpen ? "text-blue-100" : "text-blue-600"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <span
                        className={`block text-[10px] font-bold uppercase tracking-wider leading-none mb-0.5 ${
                          isBgPickerOpen ? "text-blue-100" : "text-slate-400"
                        }`}
                      >
                        Slayt Arka Planı
                      </span>
                      <span className="block text-xs font-bold truncate">
                        {BACKGROUND_PRESETS.find(
                          (p) => p.id === (selectedMeeting.backgroundPreset || "template")
                        )?.label || "Şablon Varsayılanı"}
                      </span>
                    </div>
                  </button>
                )}

                {isSuperAdmin && selectedMeeting.status === "open" && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsFramePickerOpen((p) => !p);
                      setIsBgPickerOpen(false);
                    }}
                    title="Süper Admin: Aktif toplantıdaki tüm sunu fotoğraflarına toplu kurumsal çerçeve uygula veya değiştir"
                    className={`flex items-center gap-2.5 px-3 h-11 rounded-xl border text-left transition-all min-w-0 ${
                      isFramePickerOpen
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white hover:border-blue-300 text-slate-800 border-slate-200/90"
                    }`}
                  >
                    <Frame
                      className={`w-4 h-4 shrink-0 ${
                        isFramePickerOpen ? "text-blue-100" : "text-indigo-600"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <span
                        className={`block text-[10px] font-bold uppercase tracking-wider leading-none mb-0.5 ${
                          isFramePickerOpen ? "text-blue-100" : "text-slate-400"
                        }`}
                      >
                        Fotoğraf Çerçevesi
                      </span>
                      <span className="block text-xs font-bold truncate">
                        {PHOTO_FRAME_PRESETS.find(
                          (p) => p.id === (selectedMeeting.photoFramePreset || "none")
                        )?.label || "Çerçevesiz"}
                      </span>
                    </div>
                  </button>
                )}
              </div>
            )}

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

            {isSuperAdmin &&
              selectedMeeting.status === "open" &&
              isFramePickerOpen && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 border border-indigo-200/80 space-y-3 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        <Frame className="w-4 h-4 text-indigo-600" />
                        Toplu Kurumsal Fotoğraf Çerçevesi Seçimi (Sadece Süper Admin)
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Seçtiğiniz veya değiştirdiğiniz çerçeve, aktif toplantı dosyasındaki tüm sunu fotoğraflarına ve indirilecek PowerPoint (.pptx) dosyasına toplu olarak uygulanır.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFramePickerOpen(false)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-600"
                    >
                      Kapat
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                    {PHOTO_FRAME_PRESETS.map((frame) => {
                      const isActive =
                        (selectedMeeting.photoFramePreset || "none") === frame.id;
                      const previewFrameStyle =
                        frame.id === "none"
                          ? { borderRadius: "6px" }
                          : getPhotoFrameWebStyle(frame.id, true);

                      return (
                        <button
                          key={frame.id}
                          type="button"
                          onClick={() =>
                            handleSetMeetingPhotoFrame(selectedMeeting._id, frame.id)
                          }
                          className={`p-2 rounded-2xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                            isActive
                              ? "border-indigo-600 ring-2 ring-indigo-500/30 bg-white shadow-md"
                              : "border-slate-200/90 bg-white hover:border-indigo-300 hover:shadow-sm"
                          }`}
                        >
                          {/* Çerçeve Canlı Önizleme Sahnesi */}
                          <div className="w-full aspect-[4/3] rounded-xl bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 p-2 flex items-center justify-center overflow-visible relative">
                            {frame.badge && (
                              <span className="absolute top-1 right-1 z-10 px-1.5 py-0.5 rounded-full bg-slate-900/75 text-white text-[8px] font-extrabold leading-none">
                                {frame.badge}
                              </span>
                            )}
                            <div
                              style={previewFrameStyle}
                              className="w-[78%] h-[78%] bg-gradient-to-tr from-sky-600 via-blue-500 to-indigo-400 flex items-center justify-center overflow-hidden"
                            >
                              <ImageIcon className="w-4 h-4 text-white/90" />
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] font-extrabold text-slate-800 truncate">
                              {frame.label}
                            </div>
                            <div className="text-[9.5px] text-slate-500 line-clamp-2 leading-tight mt-0.5">
                              {frame.description}
                            </div>
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
                  Toplantı slaytları sıralama ve sonlandırma işlemi için <strong>kilitlenmiştir</strong>. Sadece Süper Admin, Müdür ve Yetkili Kullanıcı işlem yapabilir.
                </span>
              </div>
            )}

            {selectedMeeting.downloadedAt && selectedMeeting.photosPurged && (
              <div className="text-xs flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Bu toplantının fotoğrafları daha önce silinmiş.</span>
              </div>
            )}
          </div>

          {/* Toplantı İçindeki Tüm Slaytlar */}
          {(() => {
            const authorOptions = Array.from(
              new Map(
                presentations
                  .filter((p) => p.createdBy?._id && p.createdBy?.name)
                  .map((p) => [String(p.createdBy!._id), p.createdBy!.name])
              ).entries()
            ).map(([id, name]) => ({ id, name }));

            const filteredPresentations = selectedPersonnelId
              ? presentations.filter(
                  (p) => String(p.createdBy?._id || "") === selectedPersonnelId
                )
              : presentations;

            const presTotalPages = Math.max(
              1,
              Math.ceil(filteredPresentations.length / presPageSize)
            );
            const safePresPage = Math.min(presPage, presTotalPages);
            const paginatedPresentations = filteredPresentations.slice(
              (safePresPage - 1) * presPageSize,
              safePresPage * presPageSize
            );
            const selectedAuthorName = authorOptions.find(
              (a) => a.id === selectedPersonnelId
            )?.name;

            return (
              <div className="gov-card p-5 sm:p-6 rounded-3xl space-y-5">
                {/* Dikkat Çekici Sunu Arama & Filtreleme Komuta Alanı */}
                <search
                  aria-label="Toplantıdaki sunuları ara ve filtrele"
                  className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-slate-50 border-2 border-blue-200/90 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/15 shadow-sm transition-all space-y-3.5"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-[11px] font-extrabold tracking-wide shadow-xs">
                        <Search className="w-3.5 h-3.5" aria-hidden="true" />
                        SUNU ARA-BUL
                      </span>
                      <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                        <span>Toplantıdaki Sunular</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-white text-blue-700 text-xs font-extrabold border border-blue-200 shadow-2xs tabular-nums">
                          {filteredPresentations.length}
                        </span>
                      </h3>
                      {((session?.user as any)?.role === "superadmin" || canManageSelectedMeeting) &&
                        selectedPersonnelId &&
                        filteredPresentations.length > 0 && (
                          <button
                            type="button"
                            onClick={() => openBulkPreview(selectedMeeting, selectedAuthorName)}
                            disabled={loadingMeetingSlides}
                            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow-sm inline-flex items-center gap-1.5 transition-all active:scale-95"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{selectedAuthorName} Sunularını Toplu Önizle</span>
                          </button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Görünüm Seçici: Kart / Liste */}
                      <div
                        role="group"
                        aria-label="Görünüm modu"
                        className="inline-flex items-center bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs shrink-0"
                      >
                        <button
                          type="button"
                          aria-pressed={presViewMode === "card"}
                          onClick={() => setPresViewMode("card")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 transition-all ${
                            presViewMode === "card"
                              ? "bg-blue-600 text-white shadow-xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                          <span>Kart</span>
                        </button>
                        <button
                          type="button"
                          aria-pressed={presViewMode === "list"}
                          onClick={() => setPresViewMode("list")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 transition-all ${
                            presViewMode === "list"
                              ? "bg-blue-600 text-white shadow-xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <List className="w-3.5 h-3.5" />
                          <span>Liste</span>
                        </button>
                      </div>

                      {authorOptions.length > 0 && (
                        <select
                          aria-label="Personele göre filtrele"
                          value={selectedPersonnelId}
                          onChange={(e) => {
                            setSelectedPersonnelId(e.target.value);
                            setPresPage(1);
                          }}
                          className="h-9.5 px-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-blue-300 text-xs sm:text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-2xs transition-colors"
                        >
                          <option value="">Tüm Personeller</option>
                          {authorOptions.map((a) => (
                            <option key={a.id} value={a.id}>
                              Personel: {a.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Yüksek Kontrastlı Büyük Arama Girişi */}
                  <div className="relative">
                    <label htmlFor="presentations-search-input" className="sr-only">
                      Toplantıdaki sunularda ad soyad, mahalle veya personel ara
                    </label>
                    <Search
                      aria-hidden="true"
                      className="w-5 h-5 text-blue-600 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                    <input
                      id="presentations-search-input"
                      name="presentationSearch"
                      type="search"
                      enterKeyHint="search"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPresPage(1);
                      }}
                      placeholder="Hızlı bulmak için vatandaş adı soyadı, mahalle/köy veya hazırlayan personel adı yazın..."
                      className={`w-full h-12 pl-12 ${
                        search ? "pr-28" : "pr-4"
                      } rounded-xl text-sm sm:text-base font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none transition-all ${
                        search.trim()
                          ? "bg-white border-2 border-blue-600 ring-4 ring-blue-500/15 shadow-md"
                          : "bg-white border-2 border-blue-200/90 hover:border-blue-400 focus:border-blue-600 shadow-xs"
                      }`}
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setPresPage(1);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-700 hover:text-red-700 text-xs font-bold inline-flex items-center gap-1 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Temizle</span>
                      </button>
                    )}
                  </div>
                </search>

                {filteredPresentations.length === 0 ? (
                  <div className="text-center py-12 text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    {selectedPersonnelId
                      ? "Seçili personele ait sunu kaydı bulunmuyor."
                      : "Bu toplantı dosyasında henüz sunu bulunmuyor."}
                  </div>
                ) : (
                  <>
                    {presViewMode === "card" ? (
                      <div className="perf-contained-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {paginatedPresentations.map((item) => {
                          const isOwnRecord = String(item.createdBy?._id) === String(userId);
                          const canModify =
                            selectedMeeting.status === "open" &&
                            (canManageSelectedMeeting ||
                              (!selectedMeeting.isLocked && isOwnRecord));
                          return (
                            <div
                              key={item._id}
                              onMouseEnter={() => prefetchRecordSlides(item)}
                              onClick={() => handleOpenRecord(item, "preview")}
                              title="Görüntülemek için tıklayın"
                              className="p-4 rounded-2xl border border-slate-200/90 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-900/8 hover:-translate-y-0.5 bg-white flex flex-col justify-between gap-3.5 transition-all cursor-pointer group"
                            >
                              <div className="flex items-start gap-3.5">
                                <div
                                  style={
                                    selectedMeeting.photoFramePreset &&
                                    selectedMeeting.photoFramePreset !== "none"
                                      ? getPhotoFrameWebStyle(
                                          selectedMeeting.photoFramePreset,
                                          true
                                        )
                                      : undefined
                                  }
                                  className="relative w-24 h-18 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0 shadow-xs"
                                >
                                  {item.firstPhoto ? (
                                    <ProtectedCanvasImage
                                      src={item.firstPhoto}
                                      alt="Slayt Önizleme"
                                      fit="cover"
                                      className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-400 bg-gradient-to-br from-slate-50 to-slate-100">
                                      <PresentationIcon className="w-6 h-6" />
                                    </div>
                                  )}
                                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-extrabold">
                                    {item.slideCount} Sayfa
                                  </span>
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="font-extrabold text-slate-900 group-hover:text-blue-700 text-sm line-clamp-2 leading-snug transition-colors">
                                    {item.summaryTitle}
                                  </div>
                                  <div className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-md bg-blue-50/80 text-[11px] font-bold text-blue-700">
                                    <span>{item.createdBy?.name || "Personel"}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-1">
                                    {new Date(item.createdAt).toLocaleDateString("tr-TR")}
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">
                                  {item.totalPhotos} Fotoğraf
                                  {(item.photoBytes || 0) > 0
                                    ? ` (${formatBytesLabel(item.photoBytes)})`
                                    : ""}
                                </span>
                                {typeof item.presentationBytes === "number" && (
                                  <span
                                    className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700"
                                    title="Sununun sistemdeki toplam boyutu"
                                  >
                                    {formatBytesLabel(item.presentationBytes)}
                                  </span>
                                )}
                                {!canModify && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200/80">
                                    Salt Görüntüleme
                                  </span>
                                )}
                                {item.lockedBy && String(item.lockedBy._id) !== String(userId) && (
                                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                    Düzenleniyor: {item.lockedBy.name}
                                  </span>
                                )}
                              </div>

                              <div
                                className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRecord(item, "preview")}
                                    title="Sunuyu Görüntüle"
                                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1 transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-slate-600" />
                                    Görüntüle
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRecord(item, "download")}
                                    title=".pptx Olarak İndir"
                                    aria-label={`${item.summaryTitle} sunusunu .pptx olarak indir`}
                                    className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/70 transition-colors"
                                  >
                                    <Download aria-hidden="true" className="w-4 h-4" />
                                  </button>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {canAddToOpenMeeting && (
                                    <>
                                      {!canModify && (
                                        <button
                                          type="button"
                                          disabled={copyingRecordId === item._id}
                                          onClick={() => handleCopyToOpenMeetingDirect(item)}
                                          title="Bu sunuyu olduğu gibi açık toplantı dosyasına kopyala"
                                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center gap-1 shadow-2xs transition-colors"
                                        >
                                          <CopyPlus className="w-3.5 h-3.5 shrink-0" />
                                          <span>Aynen Kopyala</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        disabled={copyingRecordId === item._id}
                                        onClick={() => handleCopyToEditorAndModify(item)}
                                        title="Yeni sunuya bir örnek kopyala ve üzerinde değişiklik yap"
                                        aria-label={`${item.summaryTitle} sunusunu yeni sunuya kopyala ve düzenle`}
                                        className={
                                          canModify
                                            ? "p-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200/80 hover:border-indigo-600 transition-colors"
                                            : "px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200/80 hover:border-blue-600 text-xs font-extrabold inline-flex items-center gap-1 transition-colors"
                                        }
                                      >
                                        <Copy aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                                        {!canModify && <span>Kopyala & Düzenle</span>}
                                      </button>
                                    </>
                                  )}

                                  {canModify && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenRecord(item, "edit")}
                                        title="Sunuyu Düzenle"
                                        aria-label={`${item.summaryTitle} sunusunu düzenle`}
                                        className="p-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-200/80 hover:border-blue-600 transition-colors"
                                      >
                                        <Edit3 aria-hidden="true" className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteTarget(item)}
                                        title="Sunuyu Sil"
                                        aria-label={`${item.summaryTitle} sunusunu sil`}
                                        className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/70 transition-colors"
                                      >
                                        <Trash2 aria-hidden="true" className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
                        {/* Mobil Kompakt Liste Satırları */}
                        <div className="md:hidden divide-y divide-slate-100">
                          {paginatedPresentations.map((item, rowIdx) => {
                            const globalIdx = (safePresPage - 1) * presPageSize + rowIdx + 1;
                            const isOwnRecord = String(item.createdBy?._id) === String(userId);
                            const canModify =
                              selectedMeeting.status === "open" &&
                              (canManageSelectedMeeting ||
                                (!selectedMeeting.isLocked && isOwnRecord));

                            return (
                              <div
                                key={`mob-list-${item._id}`}
                                onClick={() => handleOpenRecord(item, "preview")}
                                className="p-3.5 flex items-center justify-between gap-3 hover:bg-blue-50/40 cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-extrabold flex items-center justify-center shrink-0 tabular-nums">
                                    {globalIdx}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="text-sm font-extrabold text-slate-900 truncate">
                                      {item.summaryTitle}
                                    </div>
                                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                                      <span className="font-bold text-blue-700">
                                        {item.createdBy?.name || "Personel"}
                                      </span>
                                      <span>•</span>
                                      <span>{item.slideCount} Sayfa</span>
                                    </div>
                                  </div>
                                </div>
                                <div
                                  className="flex items-center gap-1 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRecord(item, "download")}
                                    aria-label="PPTX indir"
                                    className="p-2 rounded-xl bg-emerald-50 text-emerald-700"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  {canAddToOpenMeeting && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyToEditorAndModify(item)}
                                      aria-label="Yeni sunuya kopyala ve düzenle"
                                      title="Yeni sunuya kopyala ve düzenle"
                                      className="p-2 rounded-xl bg-indigo-50 text-indigo-700"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {canModify && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenRecord(item, "edit")}
                                        aria-label="Düzenle"
                                        className="p-2 rounded-xl bg-blue-600 text-white"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteTarget(item)}
                                        aria-label="Sil"
                                        className="p-2 rounded-xl bg-red-50 text-red-600"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div
                          tabIndex={0}
                          role="region"
                          aria-label="Toplantıdaki sunular listesi"
                          className="hidden md:block overflow-x-auto max-w-full"
                          style={{ containerType: "inline-size" }}
                        >
                          <table className="w-full table-fixed text-left border-separate border-spacing-0">
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                                <th
                                  scope="col"
                                  className="py-3 pl-4 pr-2 w-11 border-b border-slate-200/80"
                                >
                                  #
                                </th>
                                <th
                                  scope="col"
                                  className="py-3 px-3 border-b border-slate-200/80"
                                >
                                  Sunu / Hane Bilgisi
                                </th>
                                <th
                                  scope="col"
                                  className="py-3 px-2.5 w-40 xl:w-44 border-b border-slate-200/80"
                                >
                                  Hazırlayan
                                </th>
                                <th
                                  scope="col"
                                  className="py-3 px-2.5 w-44 xl:w-52 border-b border-slate-200/80"
                                >
                                  İçerik & Boyut
                                </th>
                                <th
                                  scope="col"
                                  className="hidden xl:table-cell py-3 px-2.5 w-26 border-b border-slate-200/80"
                                >
                                  Tarih
                                </th>
                                <th
                                  scope="col"
                                  className="py-3 pl-2.5 pr-4 w-[248px] text-right border-b border-slate-200/80 sticky right-0 bg-slate-50 z-10"
                                >
                                  İşlemler
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {paginatedPresentations.map((item, rowIdx) => {
                                const globalIdx = (safePresPage - 1) * presPageSize + rowIdx + 1;
                                const isOwnRecord = String(item.createdBy?._id) === String(userId);
                                const canModify =
                                  selectedMeeting.status === "open" &&
                                  (canManageSelectedMeeting ||
                                    (!selectedMeeting.isLocked && isOwnRecord));

                                return (
                                  <tr
                                    key={item._id}
                                    onMouseEnter={() => prefetchRecordSlides(item)}
                                    onClick={() => handleOpenRecord(item, "preview")}
                                    className="even:bg-slate-50/50 odd:bg-white hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                  >
                                    <td className="py-3 pl-4 pr-2 text-xs font-bold text-slate-400 tabular-nums border-b border-slate-100">
                                      {globalIdx}
                                    </td>
                                    <td className="py-3 px-3 min-w-0 border-b border-slate-100">
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div
                                          style={
                                            selectedMeeting.photoFramePreset &&
                                            selectedMeeting.photoFramePreset !== "none"
                                              ? getPhotoFrameWebStyle(
                                                  selectedMeeting.photoFramePreset,
                                                  true
                                                )
                                              : undefined
                                          }
                                          className="w-12 h-9 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0"
                                        >
                                          {item.firstPhoto ? (
                                            <ProtectedCanvasImage
                                              src={item.firstPhoto}
                                              alt=""
                                              fit="cover"
                                              className="w-full h-full"
                                            />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                                              <PresentationIcon className="w-4 h-4" />
                                            </div>
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div
                                            title={item.summaryTitle}
                                            className="text-sm font-extrabold text-slate-900 group-hover:text-blue-700 truncate transition-colors"
                                          >
                                            {item.summaryTitle}
                                          </div>
                                          <div className="xl:hidden text-[11px] text-slate-400 tabular-nums mt-0.5">
                                            {new Date(item.createdAt).toLocaleDateString("tr-TR")}
                                          </div>
                                          {item.lockedBy &&
                                            String(item.lockedBy._id) !== String(userId) && (
                                              <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 truncate max-w-full">
                                                Düzenleniyor: {item.lockedBy.name}
                                              </span>
                                            )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-2.5 min-w-0 border-b border-slate-100">
                                      <span
                                        title={item.createdBy?.name || "Personel"}
                                        className="inline-block max-w-full truncate px-2.5 py-1 rounded-lg bg-blue-50/80 text-xs font-bold text-blue-700 align-middle"
                                      >
                                        {item.createdBy?.name || "Personel"}
                                      </span>
                                    </td>
                                    <td className="py-3 px-2.5 whitespace-nowrap border-b border-slate-100">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700">
                                          {item.slideCount} Sayfa
                                        </span>
                                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">
                                          {item.totalPhotos} Foto
                                        </span>
                                        {typeof item.presentationBytes === "number" && (
                                          <span className="px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-sky-50 text-sky-700">
                                            {formatBytesLabel(item.presentationBytes)}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="hidden xl:table-cell py-3 px-2.5 whitespace-nowrap text-xs font-medium text-slate-500 tabular-nums border-b border-slate-100">
                                      {new Date(item.createdAt).toLocaleDateString("tr-TR")}
                                    </td>
                                    <td
                                      className="py-3 pl-2.5 pr-4 whitespace-nowrap text-right border-b border-slate-100 sticky right-0 group-odd:bg-white group-even:bg-slate-50 group-hover:bg-blue-50 transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="inline-flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenRecord(item, "preview")}
                                          title="Sunuyu Görüntüle"
                                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1 transition-colors"
                                        >
                                          <Eye className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                          <span>Görüntüle</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenRecord(item, "download")}
                                          title=".pptx Olarak İndir"
                                          aria-label={`${item.summaryTitle} sunusunu .pptx olarak indir`}
                                          className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/70 transition-colors shrink-0"
                                        >
                                          <Download aria-hidden="true" className="w-4 h-4" />
                                        </button>
                                        {canAddToOpenMeeting && (
                                          <button
                                            type="button"
                                            disabled={copyingRecordId === item._id}
                                            onClick={() => handleCopyToEditorAndModify(item)}
                                            title="Yeni sunuya bir örnek kopyala ve üzerinde değişiklik yap"
                                            aria-label={`${item.summaryTitle} sunusunu yeni sunuya kopyala ve düzenle`}
                                            className="p-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200/80 hover:border-indigo-600 transition-colors shrink-0"
                                          >
                                            <Copy aria-hidden="true" className="w-4 h-4" />
                                          </button>
                                        )}
                                        {canModify ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleOpenRecord(item, "edit")}
                                              title="Sunuyu Düzenle"
                                              aria-label={`${item.summaryTitle} sunusunu düzenle`}
                                              className="p-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-200/80 hover:border-blue-600 transition-colors shrink-0"
                                            >
                                              <Edit3 aria-hidden="true" className="w-4 h-4" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setDeleteTarget(item)}
                                              title="Sunuyu Sil"
                                              aria-label={`${item.summaryTitle} sunusunu sil`}
                                              className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/70 transition-colors shrink-0"
                                            >
                                              <Trash2 aria-hidden="true" className="w-4 h-4" />
                                            </button>
                                          </>
                                        ) : canAddToOpenMeeting ? (
                                          <button
                                            type="button"
                                            disabled={copyingRecordId === item._id}
                                            onClick={() => handleCopyToOpenMeetingDirect(item)}
                                            title="Bu sunuyu olduğu gibi aktif açık toplantıya kopyala"
                                            aria-label={`${item.summaryTitle} sunusunu aynen açık toplantıya kopyala`}
                                            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center gap-1 transition-colors shrink-0"
                                          >
                                            <CopyPlus aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                                            <span>Kopyala</span>
                                          </button>
                                        ) : (
                                          <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200/80">
                                            Salt Görüntüleme
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  <PaginationControls
                    currentPage={safePresPage}
                    totalPages={presTotalPages}
                    totalRecords={filteredPresentations.length}
                    pageSize={presPageSize}
                    onPageChange={setPresPage}
                    onPageSizeChange={(s) => {
                      setPresPageSize(s);
                      setPresPage(1);
                    }}
                    pageSizeOptions={[9, 12, 24, 48]}
                  />
                </>
              )}
            </div>
          );
        })()}
        </div>
      )}

      {/* Çoklu Şablon Yönetim Modalı (Süper Admin) */}
      {isSuperAdmin && isTemplateModalOpen && (
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
                        <div className="w-full aspect-[4/3] rounded-xl border border-slate-200 overflow-hidden">
                          <ProtectedCanvasImage
                            src={tpl.backgroundImageBase64}
                            alt={tpl.name}
                            fit="cover"
                            className="w-full h-full"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Kapak Şablonu Yükleme & Yönetim Modalı (Yalnızca Süper Admin — Slaytların En Başında Sayfa 1 Olarak Görünür) */}
      {isSuperAdmin && isCoverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Sunum Kapak Şablonu (Sadece Süper Admin)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Yüklediğiniz ve aktif ettiğiniz kapak şablonu; toplu önizlemede, tam ekran projeksiyon sunumunda ve indirilen birleştirilmiş PowerPoint (.pptx) dosyasında slaytların en başında (1. sayfa) görünür.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCoverModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 rounded-2xl bg-slate-50 p-3.5 border border-slate-200">
              <label
                htmlFor="new-cover-title-input"
                className="block text-xs font-extrabold text-slate-800"
              >
                Kapak Adı / Slayt Üst Başlık Yazısı (Slaytın üstünden başlayarak ortalı yazılır — alt satır için Enter kullanın)
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2.5">
                <textarea
                  id="new-cover-title-input"
                  name="coverTitle"
                  rows={3}
                  maxLength={360}
                  value={newCoverName}
                  onChange={(e) => setNewCoverName(e.target.value)}
                  placeholder={
                    "EDİRNE VALİLİĞİ\nSOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI\nMÜTEVELLİ HEYET TOPLANTI GÜNDEMİ"
                  }
                  style={
                    {
                      fieldSizing: "content",
                      width: "100%",
                      height: "auto",
                      minBlockSize: "4.2lh",
                      maxBlockSize: "8lh",
                    } as React.CSSProperties
                  }
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-bold text-center text-slate-900 leading-relaxed focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <label className="cursor-pointer py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-md shadow-amber-600/20">
                  <Upload className="w-4 h-4" />
                  {uploadingCover
                    ? "Yükleniyor..."
                    : "Kapak Şablonu Yükle (.pptx / Görsel)"}
                  <input
                    type="file"
                    accept=".pptx,.png,.jpg,.jpeg,.webp"
                    disabled={uploadingCover}
                    onChange={handleUploadCoverTemplate}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {activeCoverTemplate && (
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs">
                <span className="font-bold text-emerald-900 truncate">
                  Aktif Kapak (1. Slayt):{" "}
                  <strong>{activeCoverTemplate.name.replace(/\s*\n+\s*/g, " / ")}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectActiveCover(null)}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold transition-colors shrink-0"
                >
                  Kapağı Devre Dışı Bırak
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {coverTemplates.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Henüz yüklenmiş kapak şablonu bulunmuyor. Bir PowerPoint (.pptx) kapağı veya görsel (.jpg/.png) yükleyebilirsiniz.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {coverTemplates.map((cov) => {
                    const isSelected = Boolean(cov.isActiveCover);
                    const draftTitle =
                      editingCoverTitles[cov._id] !== undefined
                        ? editingCoverTitles[cov._id]
                        : cov.name;
                    const isDirtyTitle =
                      editingCoverTitles[cov._id] !== undefined &&
                      editingCoverTitles[cov._id].trim() !== cov.name.trim();
                    const previewCov: PresentationTemplateClient = {
                      ...cov,
                      name: draftTitle,
                    };
                    return (
                      <div
                        key={cov._id}
                        className={`p-3 rounded-2xl border space-y-2.5 transition-all ${
                          isSelected
                            ? "bg-amber-50/70 border-amber-400 ring-2 ring-amber-400/30 shadow-sm"
                            : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-slate-900 truncate flex items-center gap-1.5">
                              <span className="truncate">
                                {cov.name.replace(/\s*\n+\s*/g, " / ")}
                              </span>
                              {isSelected && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black uppercase shrink-0">
                                  Aktif 1. Slayt
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {cov.fileName}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(cov._id)}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-100 shrink-0"
                            title="Kapak Şablonunu Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <label
                            htmlFor={`cover-title-${cov._id}`}
                            className="block text-[11px] font-bold text-slate-700"
                          >
                            Kapak Üst Başlık Yazısı (Ortalı):
                          </label>
                          <textarea
                            id={`cover-title-${cov._id}`}
                            name={`coverTitle_${cov._id}`}
                            rows={2}
                            maxLength={360}
                            value={draftTitle}
                            onChange={(e) =>
                              setEditingCoverTitles((prev) => ({
                                ...prev,
                                [cov._id]: e.target.value,
                              }))
                            }
                            style={
                              {
                                fieldSizing: "content",
                                width: "100%",
                                height: "auto",
                                minBlockSize: "3lh",
                                maxBlockSize: "7lh",
                              } as React.CSSProperties
                            }
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-center text-slate-900 leading-snug focus:ring-2 focus:ring-amber-500 outline-none"
                          />
                          {isDirtyTitle && (
                            <button
                              type="button"
                              disabled={savingCoverTitleId === cov._id}
                              onClick={() =>
                                handleRenameCoverTemplate(cov._id, draftTitle)
                              }
                              className="w-full py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {savingCoverTitleId === cov._id
                                ? "Kaydediliyor..."
                                : "Kapak Yazısını Kaydet"}
                            </button>
                          )}
                        </div>

                        <CoverSlidePreviewCard cover={previewCov} />

                        {!isSelected && (
                          <button
                            type="button"
                            onClick={() => handleSelectActiveCover(cov._id)}
                            className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition-colors"
                          >
                            Bu Kapağı Aktif Et (En Başta Göster)
                          </button>
                        )}
                      </div>
                    );
                  })}
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
            {isSuperAdmin && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Yetkili Kullanıcı (Opsiyonel — Sadece Süper Admin)
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
            )}
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

      {/* Tekil Sunu Slayt Önizleme Modalı (PowerPoint Sol Şerit + %100 Mobil Uyumlu Stüdyo Görünümü) */}
      {previewRecord && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${previewRecord.title} sunu önizlemesi`}
          className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4 bg-slate-950/85 backdrop-blur-sm"
        >
          <div className="bg-white rounded-none sm:rounded-3xl shadow-2xl max-w-5xl w-full h-dvh sm:h-[88vh] sm:max-h-[820px] flex flex-col overflow-hidden border-0 sm:border border-slate-800/20">
            {/* Üst Kompakt Stüdyo Barı (Mobilde Geri Dön ve Kapat Butonları Asla Taşmaz / Kaybolmaz) */}
            <div className="relative shrink-0 px-3 sm:px-6 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 sm:py-3 bg-gradient-to-r from-[#0b192c] via-[#132c52] to-[#1e3a8a] text-white space-y-2">
              <div className="flex items-center justify-between gap-2">
                {/* Sol: Belirgin Geri Dön Butonu + Sunu Başlığı */}
                <div className="min-w-0 flex-1 flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setPreviewRecord(null)}
                    aria-label="Sunu listesine geri dön"
                    className="min-h-11 sm:min-h-9 px-2.5 sm:px-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-extrabold inline-flex items-center gap-1 shrink-0 transition-all active:scale-95"
                  >
                    <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Geri</span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-base font-extrabold text-white truncate">
                      {previewRecord.title}
                    </h3>
                    <p className="text-[11px] text-blue-200/90 truncate">
                      Hazırlayan: <strong className="text-white">{previewRecord.authorName}</strong>
                      {previewRecord.meetingTitle ? ` • ${previewRecord.meetingTitle}` : ""}
                    </p>
                  </div>
                </div>

                {/* Sağ: Masaüstü Kontrolleri + Her Ekranda Sabit Görünür Kapat Butonu */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {previewRecord.slides.length > 1 && (
                    <div className="hidden sm:inline-flex items-center bg-white/10 border border-white/15 rounded-xl p-0.5">
                      <button
                        type="button"
                        disabled={previewSlideIdx === 0}
                        onClick={() => setPreviewSlideIdx((p) => Math.max(0, p - 1))}
                        className="px-2.5 py-1.5 rounded-lg hover:bg-white/15 disabled:opacity-35 text-xs font-bold flex items-center gap-1 transition-colors"
                        title="Önceki Sayfa (←)"
                        aria-label="Önceki sayfa"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Önceki</span>
                      </button>
                      <span className="px-2 text-xs font-extrabold text-sky-200 tabular-nums">
                        {previewSlideIdx + 1} / {previewRecord.slides.length}
                      </span>
                      <button
                        type="button"
                        disabled={previewSlideIdx >= previewRecord.slides.length - 1}
                        onClick={() =>
                          setPreviewSlideIdx((p) =>
                            Math.min(previewRecord.slides.length - 1, p + 1)
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg hover:bg-white/15 disabled:opacity-35 text-xs font-bold flex items-center gap-1 transition-colors"
                        title="Sonraki Sayfa (→)"
                        aria-label="Sonraki sayfa"
                      >
                        <span>Sonraki</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {canAddToOpenMeeting && (
                    <div className="hidden sm:flex items-center gap-1.5">
                      {previewRecord.slides.length > 1 && (
                        <button
                          type="button"
                          disabled={copyingRecordId === previewRecord.item._id}
                          onClick={() =>
                            handleCopyToOpenMeetingDirect(previewRecord.item, [previewSlideIdx])
                          }
                          title={`Sadece ${previewSlideIdx + 1}. slaytı aktif açık toplantıya aynen kopyala`}
                          className="px-2.5 py-1.5 rounded-xl bg-teal-500/25 hover:bg-teal-500/40 border border-teal-300/35 text-teal-100 text-xs font-extrabold inline-flex items-center gap-1 transition-colors"
                        >
                          <CopyPlus className="w-3.5 h-3.5 shrink-0" />
                          <span>{previewSlideIdx + 1}. Slaytı Kopyala</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={copyingRecordId === previewRecord.item._id}
                        onClick={() => handleCopyToOpenMeetingDirect(previewRecord.item)}
                        title="Bu sununun tüm slaytlarını olduğu gibi aktif açık toplantıya kopyala"
                        className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center gap-1 shadow-xs transition-colors"
                      >
                        <CopyPlus className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {previewRecord.slides.length > 1 ? "Tümünü Kopyala" : "Aynen Kopyala"}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={copyingRecordId === previewRecord.item._id}
                        onClick={() =>
                          handleCopyToEditorAndModify(
                            previewRecord.item,
                            undefined,
                            previewRecord.slides
                          )
                        }
                        title="Yeni sunuya bir örnek kopyala ve üzerinde değişiklik yaparak kaydet"
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-extrabold inline-flex items-center gap-1 shadow-xs transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                        <span>Kopyala & Düzenle</span>
                      </button>
                    </div>
                  )}

                  {previewRecord.canModify ? (
                    <div className="hidden sm:flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const target = previewRecord.item;
                          setPreviewRecord(null);
                          handleOpenRecord(target, "edit");
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Düzenle</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const target = previewRecord.item;
                          setPreviewRecord(null);
                          setDeleteTarget(target);
                        }}
                        aria-label="Sunuyu sil"
                        className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500 text-rose-100 hover:text-white border border-rose-400/30 text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Sil</span>
                      </button>
                    </div>
                  ) : (
                    <span className="hidden sm:inline-flex px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-blue-100 text-[11px] font-bold">
                      Salt Görüntüleme
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setPreviewRecord(null)}
                    aria-label="Önizlemeyi kapat"
                    className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 px-2.5 rounded-xl bg-rose-500/90 sm:bg-white/15 hover:bg-rose-500 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1 shrink-0 shadow-sm transition-all active:scale-95"
                  >
                    <X className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="sm:hidden">Kapat</span>
                  </button>
                </div>
              </div>

              {/* Mobil Hızlı İşlem Şeridi (Sadece < sm ekranlarda, Geri/Kapat butonlarını sıkıştırmadan alt satırda görünür) */}
              {(canAddToOpenMeeting || previewRecord.canModify) && (
                <div className="sm:hidden flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-white/10">
                  {canAddToOpenMeeting && (
                    <>
                      {previewRecord.slides.length > 1 && (
                        <button
                          type="button"
                          disabled={copyingRecordId === previewRecord.item._id}
                          onClick={() =>
                            handleCopyToOpenMeetingDirect(previewRecord.item, [previewSlideIdx])
                          }
                          className="h-9 px-2.5 rounded-lg bg-teal-500/25 border border-teal-300/35 text-teal-100 text-[11px] font-extrabold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <CopyPlus className="w-3.5 h-3.5 shrink-0" />
                          <span>{previewSlideIdx + 1}. Slaytı Kopyala</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={copyingRecordId === previewRecord.item._id}
                        onClick={() => handleCopyToOpenMeetingDirect(previewRecord.item)}
                        className="h-9 px-2.5 rounded-lg bg-emerald-500 text-white text-[11px] font-extrabold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <CopyPlus className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {previewRecord.slides.length > 1 ? "Tümünü Kopyala" : "Aynen Kopyala"}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={copyingRecordId === previewRecord.item._id}
                        onClick={() =>
                          handleCopyToEditorAndModify(
                            previewRecord.item,
                            undefined,
                            previewRecord.slides
                          )
                        }
                        className="h-9 px-2.5 rounded-lg bg-amber-500 text-white text-[11px] font-extrabold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                        <span>Kopyala & Düzenle</span>
                      </button>
                    </>
                  )}
                  {previewRecord.canModify && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const target = previewRecord.item;
                          setPreviewRecord(null);
                          handleOpenRecord(target, "edit");
                        }}
                        className="h-9 px-2.5 rounded-lg bg-blue-500 text-white text-[11px] font-extrabold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <Edit3 className="w-3.5 h-3.5 shrink-0" />
                        <span>Düzenle</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const target = previewRecord.item;
                          setPreviewRecord(null);
                          setDeleteTarget(target);
                        }}
                        className="h-9 px-2.5 rounded-lg bg-rose-500/25 border border-rose-400/35 text-rose-100 text-[11px] font-extrabold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Sil</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* İçerik Gövdesi: Sol PowerPoint Film Şeridi + Sağ Ana Slayt Sahnesi */}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden bg-slate-100/80">
              {previewRecord.slides.length > 1 && (
                <aside className="lg:w-56 shrink-0 bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-200/90 flex flex-col min-h-0">
                  <div className="px-3.5 py-2 border-b border-slate-200/80 flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                      Sayfalar ({previewRecord.slides.length})
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      Kaydır / Seç
                    </span>
                  </div>
                  <div
                    ref={singleFilmstripRef}
                    className="pres-filmstrip-scroller flex lg:flex-col gap-2 p-2 sm:p-2.5 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto flex-1 min-h-0"
                  >
                    {previewRecord.slides.map((s, idx) => (
                      <SlideMiniThumbnail
                        key={idx}
                        index={idx}
                        isActive={idx === previewSlideIdx}
                        slide={s}
                        templates={templates}
                        meetingBackgroundPreset={
                          previewRecord.meetingBackgroundPreset ||
                          selectedMeeting?.backgroundPreset ||
                          "template"
                        }
                        meetingPhotoFramePreset={
                          previewRecord.meetingPhotoFramePreset ||
                          selectedMeeting?.photoFramePreset ||
                          "none"
                        }
                        onClick={() => setPreviewSlideIdx(idx)}
                      />
                    ))}
                  </div>
                </aside>
              )}

              <div
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  if (t) touchSwipeRef.current = { x: t.clientX, y: t.clientY };
                }}
                onTouchEnd={(e) => {
                  const start = touchSwipeRef.current;
                  touchSwipeRef.current = null;
                  const t = e.changedTouches[0];
                  if (!start || !t || previewRecord.slides.length <= 1) return;
                  const dx = t.clientX - start.x;
                  const dy = t.clientY - start.y;
                  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.35) {
                    if (dx < 0) {
                      setPreviewSlideIdx((p) =>
                        Math.min(previewRecord.slides.length - 1, p + 1)
                      );
                    } else {
                      setPreviewSlideIdx((p) => Math.max(0, p - 1));
                    }
                  }
                }}
                className="flex-1 min-w-0 min-h-0 p-2.5 sm:p-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col justify-between sm:justify-center items-center overflow-y-auto relative group/stage gap-3"
              >
                <div className="w-full max-w-3xl relative my-auto">
                  <SlidePreviewCard
                    slide={previewRecord.slides[previewSlideIdx] || emptySlide()}
                    templates={templates}
                    meetingBackgroundPreset={
                      previewRecord.meetingBackgroundPreset ||
                      selectedMeeting?.backgroundPreset ||
                      "template"
                    }
                    meetingPhotoFramePreset={
                      previewRecord.meetingPhotoFramePreset ||
                      selectedMeeting?.photoFramePreset ||
                      "none"
                    }
                  />

                  {previewRecord.slides.length > 1 && (
                    <>
                      <button
                        type="button"
                        disabled={previewSlideIdx === 0}
                        onClick={() => setPreviewSlideIdx((p) => Math.max(0, p - 1))}
                        aria-label="Önceki sayfa"
                        className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/65 hover:bg-slate-900 text-white items-center justify-center shadow-lg opacity-0 group-hover/stage:opacity-100 disabled:!opacity-0 transition-all"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        disabled={previewSlideIdx >= previewRecord.slides.length - 1}
                        onClick={() =>
                          setPreviewSlideIdx((p) =>
                            Math.min(previewRecord.slides.length - 1, p + 1)
                          )
                        }
                        aria-label="Sonraki sayfa"
                        className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/65 hover:bg-slate-900 text-white items-center justify-center shadow-lg opacity-0 group-hover/stage:opacity-100 disabled:!opacity-0 transition-all"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Mobil Alt Gezinme & Geri Dönüş Çubuğu (Tek sayfalı ve çok sayfalı tüm sunularda parmak hizasında sabit) */}
                <div className="sm:hidden w-full bg-white border border-slate-200/90 rounded-2xl p-2 shadow-sm shrink-0">
                  {previewRecord.slides.length > 1 ? (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={previewSlideIdx === 0}
                        onClick={() => setPreviewSlideIdx((p) => Math.max(0, p - 1))}
                        className="min-h-11 px-3 rounded-xl bg-slate-100 text-slate-800 text-xs font-extrabold disabled:opacity-35 inline-flex items-center gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Önceki</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPreviewRecord(null)}
                        className="min-h-11 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Geri Dön ({previewSlideIdx + 1}/{previewRecord.slides.length})</span>
                      </button>

                      <button
                        type="button"
                        disabled={previewSlideIdx >= previewRecord.slides.length - 1}
                        onClick={() =>
                          setPreviewSlideIdx((p) =>
                            Math.min(previewRecord.slides.length - 1, p + 1)
                          )
                        }
                        className="min-h-11 px-3 rounded-xl bg-blue-600 text-white text-xs font-extrabold disabled:opacity-35 inline-flex items-center gap-1"
                      >
                        <span>Sonraki</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewRecord(null)}
                        className="flex-1 min-h-11 px-4 rounded-xl bg-[#0b192c] hover:bg-[#132c52] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Listeye Geri Dön / Kapat</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenRecord(previewRecord.item, "download")}
                        aria-label="Sunuyu PowerPoint olarak indir"
                        className="min-h-11 px-3.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <Download className="w-4 h-4" />
                        <span>.pptx</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
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
                        <div className="w-14 h-10 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                          <ProtectedCanvasImage
                            src={grp.firstPhoto}
                            alt=""
                            fit="cover"
                            className="w-14 h-10"
                          />
                        </div>
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
                <div className="flex flex-wrap items-center gap-2.5">
                  {!manageMeetingModal.meeting.isLocked ? (
                    <button
                      onClick={() => handleMeetingAction("lock")}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-xs font-extrabold shadow-md shadow-amber-500/25 flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Sıralama İçin Kilitle
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMeetingAction("unlock")}
                      className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Kilidi Aç
                    </button>
                  )}
                  <button
                    onClick={() => handleMeetingAction("reorder")}
                    className="px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-extrabold transition-all active:scale-95"
                  >
                    Sıralamayı Kaydet
                  </button>
                  <button
                    onClick={() => handleMeetingAction("close")}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-extrabold shadow-md shadow-red-600/25 flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Toplantıyı Sonlandır (Kapat)
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

      {/* Toplu Önizleme & Tut-Sürükle Sıralama & Anında Açıklama Güncelleme Modalı (PowerPoint Stüdyo Görünümü) */}
      {bulkPreviewModal && (() => {
        const canReorderInBulk =
          bulkPreviewModal.meeting.status === "open" &&
          canManageSelectedMeeting &&
          bulkPreviewModal.groups.length > 1;
        const canEditInBulk =
          bulkPreviewModal.meeting.status === "open" && canManageSelectedMeeting;

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${bulkPreviewModal.meeting.title} toplu sunu önizlemesi`}
            className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4 bg-slate-950/85 backdrop-blur-sm"
          >
            {/* Erişilebilirlik Canlı Duyuru Alanı */}
            <div aria-live="polite" aria-atomic="true" className="visually-hidden">
              {reorderLiveMsg}
            </div>

            <div className="bg-white rounded-none sm:rounded-3xl shadow-2xl max-w-[1440px] w-full h-dvh sm:h-[92vh] sm:max-h-[880px] flex flex-col overflow-hidden border-0 sm:border border-slate-800/20">
              {/* Üst Kompakt Stüdyo Kontrol Barı */}
              <div className="relative shrink-0 px-3 sm:px-6 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 sm:py-3 bg-gradient-to-r from-[#0b192c] via-[#132c52] to-[#1e3a8a] text-white flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1 flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={requestCloseBulkPreview}
                    aria-label="Toplu önizlemeden geri dön"
                    className="min-h-11 sm:min-h-9 px-2.5 sm:px-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-extrabold inline-flex items-center gap-1 shrink-0 transition-all active:scale-95"
                  >
                    <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Geri</span>
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs sm:text-base font-extrabold text-white truncate max-w-[200px] sm:max-w-none">
                        {bulkPreviewModal.meeting.title}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          bulkPreviewModal.meeting.status === "closed"
                            ? "bg-white/15 text-slate-200"
                            : "bg-emerald-500/20 border border-emerald-400/30 text-emerald-200"
                        }`}
                      >
                        {bulkPreviewModal.meeting.status === "closed"
                          ? "Salt Okunur"
                          : "Canlı Önizleme"}
                      </span>
                      {isBulkOrderDirty && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[10px] font-extrabold">
                          Sıralama Değişti
                        </span>
                      )}
                      {isHydratingBulkSlides && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-400/20 border border-sky-300/35 text-sky-100 text-[10px] font-bold">
                          <progress
                            aria-label="Kalan slaytlar arka planda yükleniyor"
                            className="loading-spinner"
                            style={
                              {
                                "--size": "12px",
                                "--thickness": "2px",
                                "--spinner-color": "#7dd3fc",
                              } as React.CSSProperties
                            }
                          />
                          Diğer slaytlar yükleniyor...
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-blue-200/90 truncate mt-0.5">
                      <strong className="text-white">
                        {bulkPreviewModal.flatSlides[bulkIdx]?.slide.fullName || "-"}
                      </strong>{" "}
                      • Hazırlayan:{" "}
                      <strong className="text-sky-200">
                        {bulkPreviewModal.flatSlides[bulkIdx]?.authorName}
                      </strong>
                    </p>
                  </div>
                </div>

                {/* Sağ: Süper Admin Toplu Çerçeve Seçici + Sıralama Kaydet + Geçiş Kontrolleri & Kapat */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {isSuperAdmin && (
                    <select
                      aria-label="Tam ekran sunum slayt geçiş efekti"
                      title="Süper Admin: Tam ekran slayt sunumunda slaytlar arası geçiş efektini seç"
                      value={bulkPreviewModal.meeting.transitionPreset || "kurumsal_kaydir"}
                      onChange={(e) =>
                        handleSetMeetingTransition(
                          bulkPreviewModal.meeting._id,
                          e.target.value
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-amber-400/18 hover:bg-amber-400/28 border border-amber-300/35 text-amber-100 text-xs font-bold outline-none cursor-pointer [&>option]:text-slate-900"
                    >
                      {SLIDESHOW_TRANSITION_PRESETS.map((tp) => (
                        <option key={tp.id} value={tp.id}>
                          Geçiş: {tp.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {isSuperAdmin && bulkPreviewModal.meeting.status === "open" && (
                    <select
                      aria-label="Aktif toplantı toplu fotoğraf çerçevesi"
                      title="Süper Admin: Aktif toplantıdaki tüm sunu fotoğraflarına toplu çerçeve uygula"
                      value={bulkPreviewModal.meeting.photoFramePreset || "none"}
                      onChange={(e) =>
                        handleSetMeetingPhotoFrame(
                          bulkPreviewModal.meeting._id,
                          e.target.value
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-white/12 hover:bg-white/20 border border-white/20 text-white text-xs font-bold outline-none cursor-pointer [&>option]:text-slate-900"
                    >
                      {PHOTO_FRAME_PRESETS.map((fp) => (
                        <option key={fp.id} value={fp.id}>
                          Çerçeve: {fp.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {isBulkOrderDirty && (
                    <button
                      type="button"
                      disabled={savingBulkOrder}
                      onClick={() => saveBulkPreviewOrder(false)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-extrabold shadow-md shadow-emerald-950/30 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-60"
                    >
                      <Save aria-hidden="true" className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">
                        {savingBulkOrder ? "Kaydediliyor..." : "Sıralamayı Kaydet"}
                      </span>
                      <span className="md:hidden">Kaydet</span>
                    </button>
                  )}

                  {/* Tek Tıkla Tam Ekran Projeksiyon Sunum Modu (F5) */}
                  <button
                    ref={slideshowLaunchBtnRef}
                    type="button"
                    onClick={enterSlideshowMode}
                    title="Projeksiyona yansıtmak için Tam Ekran Sunum Gösterisini başlat (Kısayol: F5 • Çıkış: ESC)"
                    className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:via-orange-400 hover:to-rose-400 text-white text-xs font-extrabold shadow-lg shadow-orange-950/30 ring-1 ring-white/25 flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Play aria-hidden="true" className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span className="hidden sm:inline">Sunum Başlat</span>
                    <span className="sm:hidden">Sunum</span>
                    <kbd className="hidden xl:inline-block px-1.5 py-0.5 rounded bg-black/25 text-[10px] font-mono">
                      F5
                    </kbd>
                  </button>

                  {/* Toplu Sıkıştırılmış .pptx İndirme Butonu */}
                  <button
                    type="button"
                    disabled={exportingMeeting}
                    onClick={() =>
                      downloadCombinedMeetingPptx({
                        meeting: bulkPreviewModal.meeting,
                        orderedGroups: bulkPreviewModal.allGroups,
                        saveOrderFirst: isBulkOrderDirty,
                      })
                    }
                    title="Birleştirilmiş sunumu sıkıştırılmış (.pptx) olarak indir"
                    aria-label="Birleştirilmiş sunumu sıkıştırılmış .pptx olarak indir"
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-300/30 text-emerald-100 text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Download aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden xl:inline">
                      {exportingMeeting ? "Hazırlanıyor..." : "Toplu İndir"}
                    </span>
                  </button>

                  <div className="inline-flex items-center bg-white/10 border border-white/15 rounded-xl p-0.5 sm:p-1 gap-0.5 sm:gap-1">
                    <button
                      type="button"
                      disabled={bulkIdx === 0}
                      onClick={() => setBulkIdx((p) => Math.max(0, p - 1))}
                      className="px-2 sm:px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-35 text-xs font-extrabold flex items-center gap-1 transition-all active:scale-95"
                      title="Önceki Slayt (Sol/Yukarı Ok)"
                      aria-label="Önceki slayt"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Önceki</span>
                    </button>

                    <div className="px-2 sm:px-3 py-1 text-xs font-extrabold text-white tabular-nums">
                      {bulkIdx + 1}{" "}
                      <span className="text-blue-200/75 font-semibold">
                        / {bulkPreviewModal.flatSlides.length}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={bulkIdx >= bulkPreviewModal.flatSlides.length - 1}
                      onClick={() =>
                        setBulkIdx((p) =>
                          Math.min(bulkPreviewModal.flatSlides.length - 1, p + 1)
                        )
                      }
                      className="px-2 sm:px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:bg-white/10 disabled:opacity-35 text-xs font-extrabold flex items-center gap-1 shadow-xs transition-all active:scale-95"
                      title="Sonraki Slayt (Sağ/Aşağı Ok)"
                      aria-label="Sonraki slayt"
                    >
                      <span className="hidden sm:inline">Sonraki</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={requestCloseBulkPreview}
                    aria-label="Toplu önizlemeyi kapat"
                    className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 px-2.5 rounded-xl bg-rose-500/90 sm:bg-white/15 hover:bg-rose-500 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1 shrink-0 transition-colors"
                    title="Kapat (Esc)"
                  >
                    <X className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="sm:hidden">Kapat</span>
                  </button>
                </div>

                {/* İnce İlerleme Çubuğu */}
                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 via-blue-400 to-emerald-400 transition-all duration-200"
                    style={{
                      width: `${
                        ((bulkIdx + 1) / Math.max(1, bulkPreviewModal.flatSlides.length)) * 100
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Mobil Görünüm Sekme Seçici (Slayt Önizleme / Hızlı Açıklama Düzenle) */}
              {canEditInBulk && (
                <div className="lg:hidden shrink-0 px-3 py-2 bg-slate-900/95 border-b border-slate-800 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMobileBulkTab("preview")}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                      mobileBulkTab === "preview"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-white/10 text-slate-300"
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Slayt Sahnesi
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileBulkTab("edit")}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                      mobileBulkTab === "edit"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-white/10 text-slate-300"
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Açıklama Düzenle
                  </button>
                </div>
              )}

              {/* 3 Sütunlu PowerPoint Stüdyo Çalışma Alanı */}
              <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden bg-slate-100/90">
                {/* SOL SÜTUN: PowerPoint Dikey Küçük Slayt Önizleme & Tut-Sürükle Sıralama Şeridi */}
                <aside className="lg:w-64 xl:w-68 shrink-0 bg-slate-50/95 border-b lg:border-b-0 lg:border-r border-slate-200/90 flex flex-col min-h-0">
                  <div className="px-3.5 py-2 border-b border-slate-200/80 flex items-center justify-between gap-2 shrink-0">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      Slaytlar ({bulkPreviewModal.flatSlides.length})
                    </span>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                      {canReorderInBulk ? "Tut-Sürükle Sırala" : "Tıkla / Kaydır"}
                    </span>
                  </div>

                  <div
                    ref={bulkFilmstripRef}
                    className="pres-filmstrip-scroller flex lg:flex-col gap-2.5 p-2 sm:p-2.5 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto flex-1 min-h-0"
                  >
                    {bulkPreviewModal.flatSlides.map((item, idx) => {
                      const gIdx = item.groupIndex;
                      const isCover = Boolean(item.isCoverSlide);
                      const isDraggingGroup = !isCover && filmstripDrag?.fromGroupIdx === gIdx;
                      const isFirstInGrp = item.slideIndex === 0;
                      const isLastInGrp = item.slideIndex === item.groupSlideCount - 1;
                      const showDropBefore =
                        !isCover &&
                        Boolean(filmstripDrag) &&
                        filmstripDrag!.fromGroupIdx !== gIdx &&
                        filmstripDrag!.dropInsertIdx === gIdx &&
                        isFirstInGrp;
                      const showDropAfter =
                        !isCover &&
                        Boolean(filmstripDrag) &&
                        filmstripDrag!.fromGroupIdx !== gIdx &&
                        filmstripDrag!.dropInsertIdx === bulkPreviewModal.groups.length &&
                        gIdx === bulkPreviewModal.groups.length - 1 &&
                        isLastInGrp;

                      return (
                        <SlideMiniThumbnail
                          key={`${item.presentationId}_${item.slideIndex}`}
                          index={idx}
                          isActive={idx === bulkIdx}
                          slide={item.slide}
                          authorName={item.authorName}
                          templates={templates}
                          isCoverSlide={isCover}
                          coverTemplate={item.coverTemplate}
                          meetingBackgroundPreset={
                            bulkPreviewModal.meeting.backgroundPreset || "template"
                          }
                          meetingPhotoFramePreset={
                            bulkPreviewModal.meeting.photoFramePreset || "none"
                          }
                          onClick={() => {
                            setBulkIdx(idx);
                          }}
                          groupIndex={isCover ? undefined : gIdx}
                          groupSlideIndex={item.slideIndex}
                          groupSlideCount={item.groupSlideCount}
                          canReorder={canReorderInBulk && !isCover}
                          canMovePrev={!isCover && gIdx > 0}
                          canMoveNext={!isCover && gIdx < bulkPreviewModal.groups.length - 1}
                          isBeingDragged={isDraggingGroup}
                          dragTranslateX={isDraggingGroup ? filmstripDrag?.dx : 0}
                          dragTranslateY={isDraggingGroup ? filmstripDrag?.dy : 0}
                          showDropBefore={showDropBefore}
                          showDropAfter={showDropAfter}
                          onDragHandlePointerDown={(e) =>
                            handleFilmstripDragPointerDown(gIdx, e)
                          }
                          onMoveGroupStep={(delta) =>
                            reorderBulkGroups(gIdx, gIdx + delta)
                          }
                        />
                      );
                    })}
                  </div>
                </aside>

                {/* ORTA SÜTUN: Ana Slayt Sahnesi + Dokunmatik Kaydırma + Zarif Alt Navigasyon Barı */}
                <div
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    if (t) touchSwipeRef.current = { x: t.clientX, y: t.clientY };
                  }}
                  onTouchEnd={(e) => {
                    const start = touchSwipeRef.current;
                    touchSwipeRef.current = null;
                    const t = e.changedTouches[0];
                    if (!start || !t || bulkPreviewModal.flatSlides.length <= 1) return;
                    const dx = t.clientX - start.x;
                    const dy = t.clientY - start.y;
                    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.35) {
                      if (dx < 0) {
                        setBulkIdx((p) =>
                          Math.min(bulkPreviewModal.flatSlides.length - 1, p + 1)
                        );
                      } else {
                        setBulkIdx((p) => Math.max(0, p - 1));
                      }
                    }
                  }}
                  className={`${
                    canEditInBulk && mobileBulkTab === "edit" ? "hidden lg:flex" : "flex"
                  } flex-1 min-w-0 min-h-0 p-2.5 sm:p-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex-col justify-between items-center overflow-y-auto relative group/stage`}
                >
                  <div className="flex-1 w-full flex items-center justify-center min-h-0">
                    <div className="w-full max-w-4xl relative">
                      {bulkPreviewModal.flatSlides[bulkIdx]?.isCoverSlide &&
                      bulkPreviewModal.flatSlides[bulkIdx]?.coverTemplate ? (
                        <CoverSlidePreviewCard
                          cover={bulkPreviewModal.flatSlides[bulkIdx].coverTemplate!}
                        />
                      ) : (
                        <SlidePreviewCard
                          slide={
                            bulkPreviewModal.flatSlides[bulkIdx]?.slide || emptySlide()
                          }
                          templates={templates}
                          meetingBackgroundPreset={
                            bulkPreviewModal.meeting.backgroundPreset || "template"
                          }
                          meetingPhotoFramePreset={
                            bulkPreviewModal.meeting.photoFramePreset || "none"
                          }
                        />
                      )}

                      {/* Sahne Üzeri Yüzen Hızlı Geçiş Okları */}
                      <button
                        type="button"
                        disabled={bulkIdx === 0}
                        onClick={() => setBulkIdx((p) => Math.max(0, p - 1))}
                        aria-label="Önceki slayt"
                        className="hidden sm:flex absolute -left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/75 hover:bg-blue-600 text-white items-center justify-center shadow-xl ring-2 ring-white/40 opacity-0 group-hover/stage:opacity-100 disabled:!opacity-0 transition-all cursor-pointer"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        disabled={bulkIdx >= bulkPreviewModal.flatSlides.length - 1}
                        onClick={() =>
                          setBulkIdx((p) =>
                            Math.min(bulkPreviewModal.flatSlides.length - 1, p + 1)
                          )
                        }
                        aria-label="Sonraki slayt"
                        className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/75 hover:bg-blue-600 text-white items-center justify-center shadow-xl ring-2 ring-white/40 opacity-0 group-hover/stage:opacity-100 disabled:!opacity-0 transition-all cursor-pointer"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Kompakt Alt Sahne Durum & Geçiş Kapsülü */}
                  <div className="mt-2.5 sm:mt-3 shrink-0 w-full max-w-4xl bg-white/95 backdrop-blur-xs border border-slate-200/90 rounded-2xl px-2.5 sm:px-3 py-2 shadow-xs flex items-center justify-between gap-2 sm:gap-3">
                    <button
                      type="button"
                      disabled={bulkIdx === 0}
                      onClick={() => setBulkIdx((p) => Math.max(0, p - 1))}
                      className="px-3 sm:px-3.5 py-2 sm:py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold disabled:opacity-35 flex items-center gap-1 transition-all active:scale-95 shrink-0"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Önceki</span>
                    </button>

                    <div className="min-w-0 text-center px-1">
                      <div className="text-xs font-extrabold text-slate-800 truncate">
                        {bulkIdx + 1}. {bulkPreviewModal.flatSlides[bulkIdx]?.slide.fullName || "Slayt"}
                        {bulkPreviewModal.flatSlides[bulkIdx]?.slide.neighborhood
                          ? ` (${bulkPreviewModal.flatSlides[bulkIdx]?.slide.neighborhood})`
                          : ""}
                      </div>
                      <div className="hidden sm:block text-[10px] font-medium text-slate-400">
                        {canReorderInBulk
                          ? "Sol şeritteki tutamaçtan tut-sürükle ile sıralayabilir, yön tuşlarıyla geçiş yapabilirsiniz"
                          : "Klavyeden ← → veya ↑ ↓ yön tuşlarıyla hızlı geçiş yapabilirsiniz"}
                      </div>
                      <div className="sm:hidden text-[10px] font-medium text-slate-400">
                        Sağa / sola kaydırarak geçiş yapın
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={bulkIdx >= bulkPreviewModal.flatSlides.length - 1}
                      onClick={() =>
                        setBulkIdx((p) =>
                          Math.min(bulkPreviewModal.flatSlides.length - 1, p + 1)
                        )
                      }
                      className="px-3 sm:px-3.5 py-2 sm:py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-extrabold shadow-xs disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 flex items-center gap-1 transition-all active:scale-95 shrink-0"
                    >
                      <span>Sonraki</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* SAĞ SÜTUN: Yönetici / Yetkili Kullanıcı İçin Kompakt Anında Açıklama Düzenleme Paneli */}
                {canEditInBulk && !bulkPreviewModal.flatSlides[bulkIdx]?.isCoverSlide && (
                  <aside
                    className={`${
                      mobileBulkTab === "edit" ? "flex flex-1" : "hidden lg:flex"
                    } lg:flex-none lg:w-80 xl:w-96 shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-slate-200/90 p-3.5 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex-col justify-between gap-3 overflow-y-auto`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                          <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                          Hızlı Açıklama Düzenle
                        </h4>
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[11px] font-bold text-blue-700 truncate max-w-[160px]">
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
                            const target = prev.flatSlides[bulkIdx];
                            if (!target) return prev;
                            const nextGroups = prev.groups.map((g) =>
                              g.presentationId === target.presentationId
                                ? {
                                    ...g,
                                    slides: g.slides.map((s, sIdx) =>
                                      sIdx === target.slideIndex
                                        ? { ...s, descriptionHtml: html, description: plain }
                                        : s
                                    ),
                                  }
                                : g
                            );
                            const nextAllGroups = prev.allGroups.map((g) =>
                              g.presentationId === target.presentationId
                                ? {
                                    ...g,
                                    slides: g.slides.map((s, sIdx) =>
                                      sIdx === target.slideIndex
                                        ? { ...s, descriptionHtml: html, description: plain }
                                        : s
                                    ),
                                  }
                                : g
                            );
                            return {
                              ...prev,
                              allGroups: nextAllGroups,
                              groups: nextGroups,
                              flatSlides: buildBulkFlatSlides(
                                nextGroups,
                                prev.flatSlides[0]?.isCoverSlide
                                  ? activeCoverRef.current
                                  : null
                              ),
                            };
                          });
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleBulkSlideInstantSave}
                      disabled={savingBulkEdit}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-60 transition-all active:scale-95"
                    >
                      <Save className="w-4 h-4" />
                      {savingBulkEdit
                        ? "Kaydediliyor..."
                        : "Değişikliği Anında Kaydet"}
                    </button>
                  </aside>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* PowerPoint Tarzı Tam Ekran Kurumsal Projeksiyon Sunum Gösterisi Modu (ESC -> Önizleme Ekranına Döner) */}
      {isSlideshowOpen && bulkPreviewModal && (() => {
        const activeSlideEntry = bulkPreviewModal.flatSlides[bulkIdx];
        const totalSlidesCount = bulkPreviewModal.flatSlides.length;

        return (
          <div
            ref={slideshowStageRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${bulkPreviewModal.meeting.title} tam ekran sunum gösterisi`}
            onMouseMove={(e) => {
              wakeSlideshowHud();
              if (isLaserActive) {
                setLaserPos({ x: e.clientX, y: e.clientY });
              }
            }}
            onMouseLeave={() => setLaserPos(null)}
            onTouchStart={(e) => {
              wakeSlideshowHud();
              const t = e.touches[0];
              if (t) touchSwipeRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              const start = touchSwipeRef.current;
              touchSwipeRef.current = null;
              const t = e.changedTouches[0];
              if (!start || !t || totalSlidesCount <= 1) return;
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.35) {
                if (dx < 0) stepSlideshowWithTransition(1);
                else stepSlideshowWithTransition(-1);
              }
            }}
            onClick={(e) => {
              const target = e.target as HTMLElement | null;
              if (target?.closest("[data-slideshow-hud='true']")) return;
              if (bulkIdx < totalSlidesCount - 1) {
                stepSlideshowWithTransition(1);
              } else {
                wakeSlideshowHud();
              }
            }}
            className={`fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden select-none ${
              isLaserActive
                ? "cursor-none"
                : slideshowHudVisible
                  ? "cursor-default"
                  : "cursor-none"
            }`}
          >
            {/* 4:3 Projeksiyon Tam Saha Slayt Sahnesi */}
            <div
              style={{
                width: `${projectorStageBox.w}px`,
                height: `${projectorStageBox.h}px`,
              }}
              className="relative flex items-center justify-center"
            >
              {activeSlideEntry?.isCoverSlide && activeSlideEntry.coverTemplate ? (
                <CoverSlidePreviewCard
                  cover={activeSlideEntry.coverTemplate}
                  projectorMode={true}
                />
              ) : (
                <SlidePreviewCard
                  slide={activeSlideEntry?.slide || emptySlide()}
                  templates={templates}
                  meetingBackgroundPreset={
                    bulkPreviewModal.meeting.backgroundPreset || "template"
                  }
                  meetingPhotoFramePreset={
                    bulkPreviewModal.meeting.photoFramePreset || "none"
                  }
                  projectorMode={true}
                />
              )}
            </div>

            {/* Kırmızı Lazer İşaretçi Noktası (L Tuşu veya HUD Butonu ile Aktifleşir) */}
            {isLaserActive && laserPos && (
              <div
                aria-hidden="true"
                style={{
                  transform: `translate3d(${laserPos.x - 10}px, ${laserPos.y - 10}px, 0)`,
                }}
                className="fixed top-0 left-0 w-5 h-5 rounded-full pointer-events-none z-[110] flex items-center justify-center"
              >
                <span className="w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_16px_6px_rgba(239,68,68,0.9),0_0_32px_12px_rgba(220,38,38,0.55)] ring-2 ring-white/90" />
              </div>
            )}

            {/* Sol Üst: Hafif Kurumsal Sunum Bilgisi (Fare hareketsiz kalınca tamamen gizlenir) */}
            <div
              data-slideshow-hud="true"
              className={`fixed top-4 left-4 z-[105] px-3.5 py-2 rounded-2xl bg-slate-950/75 backdrop-blur-md border border-white/15 text-white shadow-2xl transition-opacity duration-300 ${
                slideshowHudVisible ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              <div className="flex items-center gap-2.5 text-xs">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 text-[10px] font-extrabold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Sunum Modu
                </span>
                <span className="font-bold text-slate-100 truncate max-w-[260px] sm:max-w-[420px]">
                  {bulkPreviewModal.meeting.title}
                </span>
                {isHydratingBulkSlides && (
                  <span className="text-[10px] text-sky-300 font-semibold">
                    (Slaytlar senkronize ediliyor...)
                  </span>
                )}
              </div>
            </div>

            {/* Alt Merkez / Sağ: PowerPoint Sunucu Kontrol Çubuğu (Fare hareketsiz kalınca gizlenir) */}
            <div
              data-slideshow-hud="true"
              onClick={(e) => e.stopPropagation()}
              className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[105] px-3 sm:px-4 py-2 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-white/15 text-white shadow-2xl flex items-center gap-2 sm:gap-3 transition-opacity duration-300 max-w-[96vw] ${
                slideshowHudVisible ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              <button
                type="button"
                disabled={bulkIdx === 0}
                onClick={() => stepSlideshowWithTransition(-1)}
                aria-label="Önceki slayt"
                title="Önceki Slayt (← / ↑)"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft aria-hidden="true" className="w-4.5 h-4.5" />
              </button>

              <div className="px-2 text-center min-w-[92px]">
                <div className="text-xs sm:text-sm font-extrabold tabular-nums">
                  {bulkIdx + 1}{" "}
                  <span className="text-slate-400 font-semibold">/ {totalSlidesCount}</span>
                </div>
                <div className="text-[10px] text-sky-300 font-semibold truncate max-w-[160px] sm:max-w-[240px]">
                  {activeSlideEntry?.slide.fullName || "-"}
                </div>
              </div>

              <button
                type="button"
                disabled={bulkIdx >= totalSlidesCount - 1}
                onClick={() => stepSlideshowWithTransition(1)}
                aria-label="Sonraki slayt"
                title="Sonraki Slayt (→ / Boşluk / Sol Tık)"
                className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <ChevronRight aria-hidden="true" className="w-4.5 h-4.5" />
              </button>

              <div className="h-5 w-px bg-white/15 mx-0.5 hidden sm:block" />

              {isSuperAdmin && (
                <select
                  aria-label="Slayt geçiş efekti (Süper Admin)"
                  title="Süper Admin: Slayt geçiş efektini canlı değiştir"
                  value={bulkPreviewModal.meeting.transitionPreset || "kurumsal_kaydir"}
                  onChange={(e) =>
                    handleSetMeetingTransition(
                      bulkPreviewModal.meeting._id,
                      e.target.value
                    )
                  }
                  className="hidden md:inline-block px-2.5 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/35 text-amber-100 text-xs font-bold outline-none cursor-pointer [&>option]:text-slate-900"
                >
                  {SLIDESHOW_TRANSITION_PRESETS.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.label}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                aria-pressed={isLaserActive}
                onClick={() => setIsLaserActive((p) => !p)}
                title="Lazer İşaretçi Aç/Kapat (Kısayol: L)"
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  isLaserActive
                    ? "bg-red-600 border-red-400 text-white shadow-md shadow-red-600/40"
                    : "bg-white/10 hover:bg-white/20 border-white/15 text-slate-200"
                }`}
              >
                <Crosshair aria-hidden="true" className="w-3.5 h-3.5" />
                <span>Lazer</span>
              </button>

              <button
                type="button"
                onClick={exitSlideshowMode}
                title="Sunum modundan çık ve önizleme ekranına dön (ESC)"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-extrabold transition-colors"
              >
                <Minimize2 aria-hidden="true" className="w-3.5 h-3.5" />
                <span>Önizlemeye Dön</span>
                <kbd className="hidden md:inline-block px-1.5 py-0.5 rounded bg-black/30 text-[10px] font-mono">
                  ESC
                </kbd>
              </button>
            </div>

            {/* Alt Kenar İnce Sunum İlerleme Çizgisi */}
            <div className="fixed inset-x-0 bottom-0 h-1 bg-white/10 z-[105] pointer-events-none">
              <div
                className="h-full bg-gradient-to-r from-sky-400 via-blue-500 to-emerald-400 transition-all duration-200"
                style={{
                  width: `${((bulkIdx + 1) / Math.max(1, totalSlidesCount)) * 100}%`,
                }}
              />
            </div>
          </div>
        );
      })()}

      {/* Toplu Önizleme Kapatılırken Slayt Sıralaması Kayıt Onayı */}
      <ModernConfirmDialog
        isOpen={isBulkOrderConfirmOpen}
        onClose={() => setIsBulkOrderConfirmOpen(false)}
        onConfirm={() => saveBulkPreviewOrder(true)}
        isLoading={savingBulkOrder}
        type="question"
        title="Slayt Sıralaması Kaydedilsin mi?"
        message="Toplu önizleme sol slayt şeridinde yaptığınız yeni sıralama değişiklikleri kaydedilsin mi?"
        confirmText="Evet, Kaydet ve Kapat"
        cancelText="Önizlemeye Dön"
        secondaryAction={{
          text: "Kaydetmeden Kapat",
          onClick: () => {
            setIsBulkOrderConfirmOpen(false);
            setBulkPreviewModal(null);
          },
          className:
            "px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-sm font-bold transition-all",
        }}
      />

      {/* Anlık (0ms) Hareketli Sunu Önizleme Yükleniyor Penceresi */}
      {previewLoadingModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pres-loading-modal-title"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200/90 overflow-hidden">
            {/* Üst Kurumsal Stüdyo Başlığı */}
            <div className="px-5 py-4 bg-gradient-to-r from-[#0b192c] via-[#132c52] to-[#1e3a8a] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <progress
                  aria-label="Sunu önizlemesi yükleniyor"
                  className="loading-spinner shrink-0"
                  style={
                    {
                      "--size": "32px",
                      "--thickness": "3.5px",
                      "--spinner-color": "#38bdf8",
                    } as React.CSSProperties
                  }
                />
                <div className="min-w-0">
                  <h3
                    id="pres-loading-modal-title"
                    className="text-sm sm:text-base font-extrabold text-white truncate"
                  >
                    {previewLoadingModal.title}
                  </h3>
                  <p className="text-[11px] text-sky-200/90 truncate">
                    {previewLoadingModal.subtitle}
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label="Yüklemeyi iptal et"
                onClick={() => {
                  previewAbortRef.current?.abort();
                  setPreviewLoadingModal(null);
                  setLoadingMeetingSlides(false);
                }}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white transition-colors shrink-0"
                title="İptal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hareketli 4:3 Mini Slayt Sahnesi İskeleti + İlerleme Çubuğu */}
            <div className="p-5 space-y-4 bg-slate-50/70">
              <div
                aria-hidden="true"
                className="w-full aspect-[4/3] rounded-2xl bg-gradient-to-br from-white via-slate-100 to-blue-50/70 border border-slate-200/90 shadow-inner p-4 flex flex-col justify-between relative overflow-hidden"
              >
                <div className="flex items-center gap-3 h-[42%]">
                  <div className="w-[42%] h-full rounded-xl bg-slate-200/90 animate-pulse flex items-center justify-center border border-white">
                    <PresentationIcon className="w-7 h-7 text-blue-500/60" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-4/5 rounded-full bg-slate-300/80 animate-pulse" />
                    <div className="h-2.5 w-3/5 rounded-full bg-slate-200 animate-pulse" />
                  </div>
                </div>

                <div className="h-[48%] rounded-xl bg-white/90 border border-slate-200/70 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-blue-700/60">➢</span>
                    <div className="h-2.5 w-11/12 rounded-full bg-slate-200 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-blue-700/60">➢</span>
                    <div className="h-2.5 w-4/5 rounded-full bg-slate-200/90 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-blue-700/60">➢</span>
                    <div className="h-2.5 w-3/5 rounded-full bg-slate-200/75 animate-pulse" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <progress
                  aria-label="Slayt verileri aktarılıyor"
                  className="pres-progress-bar w-full h-2 block"
                />
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  <span>Slayt görselleri ve metinler hazırlanıyor...</span>
                  <button
                    type="button"
                    onClick={() => {
                      previewAbortRef.current?.abort();
                      setPreviewLoadingModal(null);
                      setLoadingMeetingSlides(false);
                    }}
                    className="text-rose-600 hover:text-rose-700 font-bold"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
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
