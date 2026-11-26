"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  ZoomIn,
  ZoomOut,
  Scissors,
  Layers,
} from "lucide-react";

interface CropRect {
  x: number; // Yüzde (%) cinsinden 0..100
  y: number;
  w: number;
  h: number;
}

type AspectRatioOption = "free" | "4:3" | "16:9" | "1:1" | "3:4";

interface PhotoCropModalProps {
  isOpen: boolean;
  photoSrc: string;
  allPhotos?: string[];
  activePhotoIdx?: number;
  onSelectPhotoIdx?: (idx: number) => void;
  onClose: () => void;
  onApplyCrop: (croppedBase64: string, targetIdx: number) => void;
}

export default function PhotoCropModal({
  isOpen,
  photoSrc,
  allPhotos = [],
  activePhotoIdx = 0,
  onSelectPhotoIdx,
  onClose,
  onApplyCrop,
}: PhotoCropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [aspect, setAspect] = useState<AspectRatioOption>("free");
  const [crop, setCrop] = useState<CropRect>({ x: 5, y: 5, w: 90, h: 90 });
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
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

  // Modal her açıldığında veya aktif fotoğraf değiştiğinde durumları sıfırla
  useEffect(() => {
    if (isOpen) {
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setAspect("free");
      setCrop({ x: 5, y: 5, w: 90, h: 90 });
    }
  }, [isOpen, photoSrc]);

  // Görsel yüklendiğinde doğal boyutunu al
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  // En-boy oranı değiştikçe crop kutusunu orana uygun şekilde ortala
  const applyAspectRatio = useCallback(
    (newAspect: AspectRatioOption) => {
      setAspect(newAspect);
      if (newAspect === "free" || !imgNaturalSize.w || !imgNaturalSize.h) return;

      // Döndürme 90 veya 270 ise boyutlar yer değiştirir
      const isSwapped = rotation === 90 || rotation === 270;
      const currentW = isSwapped ? imgNaturalSize.h : imgNaturalSize.w;
      const currentH = isSwapped ? imgNaturalSize.w : imgNaturalSize.h;
      const imageAspect = currentW / currentH;

      let targetRatio = 1;
      if (newAspect === "4:3") targetRatio = 4 / 3;
      else if (newAspect === "16:9") targetRatio = 16 / 9;
      else if (newAspect === "1:1") targetRatio = 1;
      else if (newAspect === "3:4") targetRatio = 3 / 4;

      // Kırpma alanının yüzde cinsinden w / h oranı = (targetRatio / imageAspect)
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

  // Sıfırla
  const handleReset = () => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setAspect("free");
    setCrop({ x: 5, y: 5, w: 90, h: 90 });
  };

  // Pointer Başlatma (Taşıma veya Tutamaç)
  const handlePointerDown = (
    e: React.PointerEvent,
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

  // Kırpma ve Tuvale Çizip Çıktı Alma
  const handleApply = async () => {
    if (!imageRef.current || !photoSrc) return;
    setProcessing(true);

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Görsel yüklenemedi."));
        img.src = photoSrc;
      });

      const natW = img.naturalWidth;
      const natH = img.naturalHeight;

      // 1. Adım: Döndürme & Aynalama içeren ara tuval oluştur
      const isRotated = rotation === 90 || rotation === 270;
      const rotCanvasW = isRotated ? natH : natW;
      const rotCanvasH = isRotated ? natW : natH;

      const transCanvas = document.createElement("canvas");
      transCanvas.width = rotCanvasW;
      transCanvas.height = rotCanvasH;
      const tCtx = transCanvas.getContext("2d");
      if (!tCtx) throw new Error("Canvas context oluşturulamadı.");

      tCtx.translate(rotCanvasW / 2, rotCanvasH / 2);
      if (rotation !== 0) {
        tCtx.rotate((rotation * Math.PI) / 180);
      }
      tCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      tCtx.drawImage(img, -natW / 2, -natH / 2, natW, natH);

      // 2. Adım: Kırpma koordinatlarını doğal piksel cinsine dönüştür
      const cropPxX = Math.round((crop.x / 100) * rotCanvasW);
      const cropPxY = Math.round((crop.y / 100) * rotCanvasH);
      const cropPxW = Math.round((crop.w / 100) * rotCanvasW);
      const cropPxH = Math.round((crop.h / 100) * rotCanvasH);

      // Çıktı tuvali
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
      const resultDataUrl = finalCanvas.toDataURL("image/jpeg", 0.86);
      onApplyCrop(resultDataUrl, activePhotoIdx);
      onClose();
    } catch (err: any) {
      console.error("Fotoğraf kırpma hatası:", err);
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden text-slate-100">
        
        {/* Üst Başlık Barı */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Fotoğrafı Kırp, Kes ve Düzenle
                </h3>
                {imgNaturalSize.w > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700">
                    {imgNaturalSize.w} × {imgNaturalSize.h} px
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Alanı sürükleyerek veya kenarlardan tutarak kırpın, döndürün ve uygulayın.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {allPhotos.length > 1 && onSelectPhotoIdx && (
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700 mr-2">
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

        {/* Ana Kırpma Alanı (Çalışma Tuvali) */}
        <div className="flex-1 bg-slate-950 p-4 sm:p-6 flex items-center justify-center overflow-hidden min-h-[340px] max-h-[58vh]">
          <div
            ref={containerRef}
            className="relative select-none touch-none max-w-full max-h-full flex items-center justify-center overflow-hidden rounded-xl border border-slate-800/80 shadow-2xl"
            style={{
              maxHeight: "54vh",
            }}
          >
            {/* Gösterilen Görsel */}
            <img
              ref={imageRef}
              src={photoSrc}
              alt="Kırpılacak fotoğraf"
              onLoad={handleImageLoad}
              draggable={false}
              className="max-h-[54vh] max-w-full object-contain pointer-events-none transition-transform duration-150"
              style={{
                transform: `rotate(${rotation}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
              }}
            />

            {/* İnteraktif Kırpma Kutusu Overlay */}
            <div
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.w}%`,
                height: `${crop.h}%`,
                boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.65)",
              }}
              onPointerDown={(e) => handlePointerDown(e, "move")}
              className="absolute border-2 border-blue-400 cursor-move group touch-none"
            >
              {/* 3x3 Üçte Bir Kuralı Kılavuz Çizgileri */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity">
                <div className="border-r border-b border-white/60"></div>
                <div className="border-r border-b border-white/60"></div>
                <div className="border-b border-white/60"></div>
                <div className="border-r border-b border-white/60"></div>
                <div className="border-r border-b border-white/60"></div>
                <div className="border-b border-white/60"></div>
                <div className="border-r border-white/60"></div>
                <div className="border-r border-white/60"></div>
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

        {/* Alt Araç Çubuğu (En-Boy Oranları, Döndürme, Sıfırlama ve Uygulama) */}
        <div className="p-4 sm:p-5 bg-slate-900 border-t border-slate-800 space-y-3.5">
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
                onClick={handleReset}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-amber-400 hover:bg-slate-700 transition-colors shadow-sm ml-1"
                title="İlk Haline Sıfırla"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Alt Butonlar */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="text-xs text-slate-400">
              Kırpma Oranı: <span className="font-semibold text-slate-200">%{crop.w.toFixed(0)} × %{crop.h.toFixed(0)}</span>
              {rotation !== 0 && (
                <span className="ml-2 text-blue-400">({rotation}° Döndürüldü)</span>
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
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    İşleniyor...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Kırp ve Uygula
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
