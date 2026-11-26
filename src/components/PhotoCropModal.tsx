"use client";

import { useState, useEffect, useRef, useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { decodeDataUrlToBitmap } from "@/lib/presentationClient";
import ProtectedCanvasImage from "@/components/ProtectedCanvasImage";
import {
  Crop,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  RefreshCw,
  Check,
  X,
  Maximize2,
  Scissors,
  Sun,
  Contrast,
  Palette,
  Flame,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";

interface CropRect {
  x: number; // Yüzde (%) cinsinden 0..100
  y: number;
  w: number;
  h: number;
}

type AspectRatioOption = "free" | "4:3" | "16:9" | "1:1" | "3:4";
type EditorTab = "crop" | "adjust";

interface PhotoCropModalProps {
  isOpen: boolean;
  photoSrc: string;
  allPhotos?: string[];
  activePhotoIdx?: number;
  initialTab?: EditorTab;
  onSelectPhotoIdx?: (idx: number) => void;
  onClose: () => void;
  onApplyCrop: (croppedBase64: string, targetIdx: number) => void;
}

// Hazır Işık ve Renk Filtreleri
interface FilterPreset {
  id: string;
  name: string;
  icon: string;
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
}

const PRESETS: FilterPreset[] = [
  {
    id: "original",
    name: "Orijinal",
    icon: "✨",
    brightness: 100,
    contrast: 100,
    saturation: 100,
    warmth: 0,
  },
  {
    id: "bright",
    name: "Aydınlık (Işık Aç)",
    icon: "☀️",
    brightness: 122,
    contrast: 106,
    saturation: 104,
    warmth: 0,
  },
  {
    id: "vivid",
    name: "Canlı Renkler",
    icon: "🎨",
    brightness: 106,
    contrast: 114,
    saturation: 135,
    warmth: 4,
  },
  {
    id: "warm",
    name: "Sıcak Günışığı",
    icon: "🔥",
    brightness: 106,
    contrast: 104,
    saturation: 108,
    warmth: 18,
  },
  {
    id: "cool",
    name: "Soğuk & Net",
    icon: "❄️",
    brightness: 103,
    contrast: 108,
    saturation: 96,
    warmth: -16,
  },
  {
    id: "shadow_lift",
    name: "Karanlık Alanları Aç",
    icon: "🌓",
    brightness: 130,
    contrast: 94,
    saturation: 106,
    warmth: 0,
  },
  {
    id: "bw",
    name: "Siyah - Beyaz",
    icon: "🖤",
    brightness: 105,
    contrast: 122,
    saturation: 0,
    warmth: 0,
  },
];

export default function PhotoCropModal({
  isOpen,
  photoSrc,
  allPhotos = [],
  activePhotoIdx = 0,
  initialTab = "crop",
  onSelectPhotoIdx,
  onClose,
  onApplyCrop,
}: PhotoCropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Aktif Sekme (Kırpma / Işık-Renk)
  const [activeTab, setActiveTab] = useState<EditorTab>(initialTab);

  // Kırpma & Döndürme Durumları
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [aspect, setAspect] = useState<AspectRatioOption>("free");
  const [crop, setCrop] = useState<CropRect>({ x: 5, y: 5, w: 90, h: 90 });
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Işıklandırma ve Renk Durumları
  const [brightness, setBrightness] = useState<number>(100); // 40..180 (%)
  const [contrast, setContrast] = useState<number>(100); // 40..180 (%)
  const [saturation, setSaturation] = useState<number>(100); // 0..200 (%)
  const [warmth, setWarmth] = useState<number>(0); // -30..+30

  const [processing, setProcessing] = useState<boolean>(false);

  // Sürükleme / Boyutlandırma durumu
  const dragRef = useRef<{
    active: boolean;
    mode: "move" | "nw" | "ne" | "se" | "sw" | "n" | "s" | "e" | "w" | null;
    startX: number;
    startY: number;
    startCrop: CropRect;
  }>({
    active: false,
    mode: null,
    startX: 0,
    startY: 0,
    startCrop: { x: 5, y: 5, w: 90, h: 90 },
  });

  // Modal her açıldığında veya aktif fotoğraf değiştiğinde durumları ayarla
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setAspect("free");
      setCrop({ x: 5, y: 5, w: 90, h: 90 });
      setBrightness(100);
      setContrast(100);
      setSaturation(100);
      setWarmth(0);
    }
  }, [isOpen, photoSrc, initialTab]);

  // Görselin doğal boyutlarını Network sekmesine düşmeden ImageBitmap ile oku
  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !photoSrc) return;
    decodeDataUrlToBitmap(photoSrc).then((bmp) => {
      if (!cancelled && bmp) {
        setImgNaturalSize({ w: bmp.width, h: bmp.height });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, photoSrc]);

  // En-boy oranı değiştikçe crop kutusunu orana uygun şekilde ortala
  const applyAspectRatio = useCallback(
    (newAspect: AspectRatioOption) => {
      setAspect(newAspect);
      if (newAspect === "free" || !imgNaturalSize.w || !imgNaturalSize.h) return;

      const isSwapped = rotation === 90 || rotation === 270;
      const currentW = isSwapped ? imgNaturalSize.h : imgNaturalSize.w;
      const currentH = isSwapped ? imgNaturalSize.w : imgNaturalSize.h;
      const imageAspect = currentW / currentH;

      let targetRatio = 1;
      if (newAspect === "4:3") targetRatio = 4 / 3;
      else if (newAspect === "16:9") targetRatio = 16 / 9;
      else if (newAspect === "1:1") targetRatio = 1;
      else if (newAspect === "3:4") targetRatio = 3 / 4;

      const relativeRatio = targetRatio / imageAspect;

      let newW = 85;
      let newH = newW / relativeRatio;

      if (newH > 85) {
        newH = 85;
        newW = newH * relativeRatio;
      }

      newW = Math.min(96, Math.max(15, newW));
      newH = Math.min(96, Math.max(15, newH));

      const newX = (100 - newW) / 2;
      const newY = (100 - newH) / 2;

      setCrop({
        x: Math.max(0, Math.min(100 - newW, newX)),
        y: Math.max(0, Math.min(100 - newH, newY)),
        w: newW,
        h: newH,
      });
    },
    [imgNaturalSize, rotation]
  );

  // Döndürme işlemi
  const handleRotateCw = () => {
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    setCrop({ x: 5, y: 5, w: 90, h: 90 });
  };

  const handleRotateCcw = () => {
    const nextRot = (rotation - 90 + 360) % 360;
    setRotation(nextRot);
    setCrop({ x: 5, y: 5, w: 90, h: 90 });
  };

  // Kırpma Sıfırla
  const handleResetCrop = () => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setAspect("free");
    setCrop({ x: 5, y: 5, w: 90, h: 90 });
  };

  // Işık & Renk Sıfırla
  const handleResetAdjustments = () => {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setWarmth(0);
  };

  // Hazır Filtre Seçimi
  const applyPreset = (preset: FilterPreset) => {
    setBrightness(preset.brightness);
    setContrast(preset.contrast);
    setSaturation(preset.saturation);
    setWarmth(preset.warmth);
  };

  // Işık / Renk değiştirildi mi kontrolü
  const isAdjusted =
    brightness !== 100 || contrast !== 100 || saturation !== 100 || warmth !== 0;

  // CSS Filtre Dizesini Oluştur
  const buildFilterString = useCallback(() => {
    const parts: string[] = [];
    if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
    if (contrast !== 100) parts.push(`contrast(${contrast}%)`);
    if (saturation !== 100) parts.push(`saturate(${saturation}%)`);
    if (warmth > 0) parts.push(`sepia(${warmth * 0.7}%)`);
    if (warmth < 0) parts.push(`hue-rotate(${warmth * 0.8}deg)`);
    return parts.length > 0 ? parts.join(" ") : "none";
  }, [brightness, contrast, saturation, warmth]);

  // Pointer Başlatma (Taşıma veya Tutamaç)
  const handlePointerDown = (
    e: ReactPointerEvent,
    mode: "move" | "nw" | "ne" | "se" | "sw" | "n" | "s" | "e" | "w"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    dragRef.current = {
      active: true,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  // Pointer Taşıma
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;
      const start = drag.startCrop;

      if (drag.mode === "move") {
        let newX = start.x + dxPct;
        let newY = start.y + dyPct;

        newX = Math.max(0, Math.min(100 - start.w, newX));
        newY = Math.max(0, Math.min(100 - start.h, newY));

        setCrop((prev) => ({ ...prev, x: newX, y: newY }));
        return;
      }

      // Tutamaç ile boyutlandırma
      let newX = start.x;
      let newY = start.y;
      let newW = start.w;
      let newH = start.h;

      const minW = 8;
      const minH = 8;

      if (drag.mode?.includes("w")) {
        const potentialW = start.w - dxPct;
        if (potentialW >= minW) {
          const shift = Math.min(potentialW - minW, Math.max(-start.x, dxPct));
          newX = start.x + shift;
          newW = start.w - shift;
        }
      }
      if (drag.mode?.includes("e")) {
        newW = Math.max(minW, Math.min(100 - start.x, start.w + dxPct));
      }
      if (drag.mode?.includes("n")) {
        const potentialH = start.h - dyPct;
        if (potentialH >= minH) {
          const shift = Math.min(potentialH - minH, Math.max(-start.y, dyPct));
          newY = start.y + shift;
          newH = start.h - shift;
        }
      }
      if (drag.mode?.includes("s")) {
        newH = Math.max(minH, Math.min(100 - start.y, start.h + dyPct));
      }

      // Sınır kontrolleri
      newX = Math.max(0, Math.min(100 - minW, newX));
      newY = Math.max(0, Math.min(100 - minH, newY));
      newW = Math.max(minW, Math.min(100 - newX, newW));
      newH = Math.max(minH, Math.min(100 - newY, newH));

      setCrop({ x: newX, y: newY, w: newW, h: newH });
    },
    []
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current.active = false;
    dragRef.current.mode = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerMove]);

  // Kırpma, Döndürme, Işıklandırma ve Renk Ayarlarını Tuvale İşleyip Çıktı Alma
  const handleApply = async () => {
    if (!photoSrc) return;
    setProcessing(true);

    try {
      const bmp = await decodeDataUrlToBitmap(photoSrc);
      if (!bmp) throw new Error("Görsel yüklenemedi.");

      const natW = bmp.width;
      const natH = bmp.height;

      // 1. Adım: Döndürme, Aynalama ve IŞIK/RENK FİLTRELERİ içeren ara tuval oluştur
      const isRotated = rotation === 90 || rotation === 270;
      const rotCanvasW = isRotated ? natH : natW;
      const rotCanvasH = isRotated ? natW : natH;

      const transCanvas = document.createElement("canvas");
      transCanvas.width = rotCanvasW;
      transCanvas.height = rotCanvasH;
      const tCtx = transCanvas.getContext("2d");
      if (!tCtx) throw new Error("Canvas context oluşturulamadı.");

      // Işık, kontrast ve renk filtrelerini canvas üzerine uygula
      const currentFilter = buildFilterString();
      if (currentFilter && currentFilter !== "none") {
        try {
          tCtx.filter = currentFilter;
        } catch {
          // Desteklemeyen eski tarayıcılar için sessizce devam et
        }
      }

      tCtx.translate(rotCanvasW / 2, rotCanvasH / 2);
      if (rotation !== 0) {
        tCtx.rotate((rotation * Math.PI) / 180);
      }
      tCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      tCtx.drawImage(bmp, -natW / 2, -natH / 2, natW, natH);

      // 2. Adım: Kırpma koordinatlarını doğal piksel cinsine dönüştür
      const cropPxX = Math.round((crop.x / 100) * rotCanvasW);
      const cropPxY = Math.round((crop.y / 100) * rotCanvasH);
      const cropPxW = Math.round((crop.w / 100) * rotCanvasW);
      const cropPxH = Math.round((crop.h / 100) * rotCanvasH);

      // Çıktı tuvali boyutlandırması
      const maxOutputDim = 1250;
      let outW = cropPxW;
      let outH = cropPxH;

      if (outW > maxOutputDim || outH > maxOutputDim) {
        if (outW >= outH) {
          outH = Math.round((outH * maxOutputDim) / outW);
          outW = maxOutputDim;
        } else {
          outW = Math.round((outW * maxOutputDim) / outH);
          outH = maxOutputDim;
        }
      }

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = Math.max(1, outW);
      finalCanvas.height = Math.max(1, outH);
      const fCtx = finalCanvas.getContext("2d");
      if (!fCtx) throw new Error("Çıktı tuvali oluşturulamadı.");

      // Yüksek kaliteli piksel enterpolasyonu
      fCtx.imageSmoothingEnabled = true;
      fCtx.imageSmoothingQuality = "high";

      fCtx.drawImage(
        transCanvas,
        cropPxX,
        cropPxY,
        cropPxW,
        cropPxH,
        0,
        0,
        outW,
        outH
      );

      // Sıkıştırılmış JPEG data URI al
      const resultDataUrl = finalCanvas.toDataURL("image/jpeg", 0.88);
      onApplyCrop(resultDataUrl, activePhotoIdx);
      onClose();
    } catch (err: any) {
      console.error("Fotoğraf işleme hatası:", err);
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  const currentFilterStyle = buildFilterString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden text-slate-100">
        
        {/* Üst Başlık & Sekme Çubuğu */}
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/95 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-amber-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
              {activeTab === "crop" ? (
                <Scissors className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Fotoğrafı Kırp, Kes ve Işıklandır
                </h3>
                {imgNaturalSize.w > 0 && (
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700">
                    {imgNaturalSize.w} × {imgNaturalSize.h} px
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Kırpma, döndürme ve gelişmiş ışık, kontrast ve renk canlılığı ayarlarını yapın.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Sekme Seçiciler */}
            <div className="flex items-center p-1 rounded-xl bg-slate-800/90 border border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab("crop")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  activeTab === "crop"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Kırp & Kes</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("adjust")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all relative ${
                  activeTab === "adjust"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Işık & Renk</span>
                {isAdjusted && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
              </button>
            </div>

            {/* Çoklu Fotoğraf Seçici */}
            {allPhotos.length > 1 && onSelectPhotoIdx && (
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
                {allPhotos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSelectPhotoIdx(i)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      activePhotoIdx === i
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Foto {i + 1}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Ana Fotoğraf Önizleme Alanı */}
        <div className="flex-1 bg-slate-950 p-3 sm:p-5 flex items-center justify-center overflow-hidden min-h-[300px] max-h-[52vh]">
          <div
            ref={containerRef}
            className="relative select-none touch-none max-w-full max-h-full flex items-center justify-center overflow-hidden rounded-xl border border-slate-800/80 shadow-2xl"
            style={{
              maxHeight: "48vh",
            }}
          >
            {/* Gösterilen Görsel - Korumalı Canvas üzerinde canlı filtre ve döndürme uygulanır */}
            <ProtectedCanvasImage
              src={photoSrc}
              alt="Düzenlenen fotoğraf"
              fit="contain"
              hugAspect={true}
              className="max-h-[48vh] max-w-full w-auto h-auto pointer-events-none transition-[filter] duration-75"
              style={{
                transform: `rotate(${rotation}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
                filter: currentFilterStyle,
              }}
            />

            {/* İnteraktif Kırpma Kutusu Overlay (Kırpma sekmesinde veya açıkken aktiftir) */}
            <div
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.w}%`,
                height: `${crop.h}%`,
                boxShadow:
                  activeTab === "crop"
                    ? "0 0 0 9999px rgba(2, 6, 23, 0.65)"
                    : "0 0 0 9999px rgba(2, 6, 23, 0.35)",
              }}
              onPointerDown={(e) => handlePointerDown(e, "move")}
              className={`absolute border-2 cursor-move group touch-none transition-colors ${
                activeTab === "crop"
                  ? "border-blue-400 shadow-md"
                  : "border-blue-400/40 hover:border-blue-400"
              }`}
            >
              {/* 3x3 Üçte Bir Kuralı Kılavuz Çizgileri */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity">
                <div className="border-r border-b border-white/60"></div>
                <div className="border-r border-b border-white/60"></div>
                <div className="border-b border-white/60"></div>
                <div className="border-r border-b border-white/60"></div>
                <div className="border-r border-b border-white/60"></div>
                <div className="border-b border-white/60"></div>
                <div className="border-r border-b border-white/60"></div>
                <div className="border-r border-b border-white/60"></div>
                <div></div>
              </div>

              {/* Köşe Tutamaçları */}
              <div
                onPointerDown={(e) => handlePointerDown(e, "nw")}
                className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-md cursor-nwse-resize hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, "ne")}
                className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-md cursor-nesw-resize hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, "sw")}
                className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-md cursor-nesw-resize hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, "se")}
                className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-md cursor-nwse-resize hover:scale-125 transition-transform"
              />

              {/* Kenar Tutamaçları */}
              <div
                onPointerDown={(e) => handlePointerDown(e, "n")}
                className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-2.5 bg-white border border-blue-600 rounded-full shadow-sm cursor-ns-resize hover:scale-110"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, "s")}
                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-2.5 bg-white border border-blue-600 rounded-full shadow-sm cursor-ns-resize hover:scale-110"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, "w")}
                className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2.5 h-6 bg-white border border-blue-600 rounded-full shadow-sm cursor-ew-resize hover:scale-110"
              />
              <div
                onPointerDown={(e) => handlePointerDown(e, "e")}
                className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-6 bg-white border border-blue-600 rounded-full shadow-sm cursor-ew-resize hover:scale-110"
              />
            </div>
          </div>
        </div>

        {/* Alt Düzenleme Paneli */}
        <div className="p-3.5 sm:p-5 bg-slate-900 border-t border-slate-800 space-y-3.5">
          
          {/* 1. SEKME: Kırpma & Açı Araçları */}
          {activeTab === "crop" && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* En-Boy Oranı Butonları */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
                    <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
                    Oran:
                  </span>
                  {(
                    [
                      { id: "free", label: "Serbest" },
                      { id: "4:3", label: "4:3 (Sunu)" },
                      { id: "16:9", label: "16:9" },
                      { id: "1:1", label: "1:1 Kare" },
                      { id: "3:4", label: "3:4 Dikey" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => applyAspectRatio(opt.id)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        aspect === opt.id
                          ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Döndürme & Aynalama Araçları */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1">Döndür:</span>
                  <button
                    type="button"
                    onClick={handleRotateCcw}
                    className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-sm"
                    title="Sola 90° Döndür"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRotateCw}
                    className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-sm"
                    title="Sağa 90° Döndür"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlipH(!flipH)}
                    className={`p-2 rounded-xl transition-colors shadow-sm ${
                      flipH
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
                    }`}
                    title="Yatay Aynala"
                  >
                    <FlipHorizontal className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlipV(!flipV)}
                    className={`p-2 rounded-xl transition-colors shadow-sm ${
                      flipV
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
                    }`}
                    title="Dikey Aynala"
                  >
                    <FlipVertical className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleResetCrop}
                    className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-amber-400 hover:bg-slate-700 transition-colors shadow-sm ml-1"
                    title="Kırpma ve Açıyı Sıfırla"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. SEKME: Işıklandırma ve Renklendirme Araçları */}
          {activeTab === "adjust" && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              
              {/* Hazır Filtre Butonları */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Hazır Efekt:
                </span>
                {PRESETS.map((p) => {
                  const isCurrent =
                    brightness === p.brightness &&
                    contrast === p.contrast &&
                    saturation === p.saturation &&
                    warmth === p.warmth;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1 ${
                        isCurrent
                          ? "bg-amber-600 text-white shadow-md shadow-amber-600/30 font-bold"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                      }`}
                    >
                      <span>{p.icon}</span>
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Sürgülü Ayarlar (Parlaklık, Kontrast, Doygunluk, Sıcaklık) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Parlaklık (Brightness) */}
                <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/70 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      Parlaklık / Işık
                    </span>
                    <span className="font-mono text-[11px] text-amber-300 font-bold">
                      %{brightness}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="180"
                    step="1"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                {/* Kontrast (Contrast) */}
                <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/70 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                      <Contrast className="w-3.5 h-3.5 text-blue-400" />
                      Kontrast / Karşıtlık
                    </span>
                    <span className="font-mono text-[11px] text-blue-300 font-bold">
                      %{contrast}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="180"
                    step="1"
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Doygunluk / Canlılık (Saturation) */}
                <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/70 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                      <Palette className="w-3.5 h-3.5 text-emerald-400" />
                      Renk Doygunluğu
                    </span>
                    <span className="font-mono text-[11px] text-emerald-300 font-bold">
                      %{saturation}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="1"
                    value={saturation}
                    onChange={(e) => setSaturation(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                {/* Renk Sıcaklığı (Warmth) */}
                <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/70 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                      <Flame className="w-3.5 h-3.5 text-orange-400" />
                      Renk Sıcaklığı
                    </span>
                    <span className="font-mono text-[11px] text-orange-300 font-bold">
                      {warmth > 0 ? `+${warmth}` : warmth}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-30"
                    max="30"
                    step="1"
                    value={warmth}
                    onChange={(e) => setWarmth(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>
              </div>

              {/* Işık Sıfırlama Butonu */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleResetAdjustments}
                  className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Işık ve Renk Ayarlarını Sıfırla
                </button>
              </div>
            </div>
          )}

          {/* Alt Durum ve Kaydet/Uygula Butonları */}
          <div className="flex items-center justify-between pt-2.5 border-t border-slate-800">
            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
              <span>
                Kırpma: <span className="font-semibold text-slate-200">%{crop.w.toFixed(0)} × %{crop.h.toFixed(0)}</span>
              </span>
              {rotation !== 0 && (
                <span className="text-blue-400">({rotation}° Döndürüldü)</span>
              )}
              {isAdjusted && (
                <span className="text-amber-400 flex items-center gap-1 font-medium">
                  <Sun className="w-3 h-3" /> Işık ayarı uygulandı
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={processing}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={processing}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-600 hover:from-blue-500 hover:to-amber-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    İşleniyor...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Düzenlemeleri Uygula
                  </>
                )}
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
