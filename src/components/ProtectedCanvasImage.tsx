"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { decodeDataUrlToBitmap } from "@/lib/presentationClient";

interface ProtectedCanvasImageProps {
  src: string;
  alt?: string;
  fit?: "contain" | "cover" | "fill";
  /**
   * `true` olduğunda tuvalin doğal en/boy oranı görselin kendisine kilitlenir
   * (`PhotoCropModal` gibi serbest kapsayıcılarda doğal en/boy oranını korur).
   */
  hugAspect?: boolean;
  /**
   * `true` olduğunda (`SlidePreviewCard` `contain` modunda), ebeveyn fotoğraf yuvasının
   * (`photoWidthPct × photoHeightPct`) tamamını görselin en/boy oranını bozmadan doldurur;
   * `transform: scale(...)` altında dahi geri besleme döngüsü olmadan tam ayarlanan boyutta görünür
   * ve kurumsal 3B çerçeveler fotoğraf kenarlarını birebir sarar.
   */
  fillSlotAspect?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Kişisel fotoğrafları `<img src="data:...">` veya CSS `url(data:...)` kullanmadan
 * doğrudan bellek içi `ImageBitmap` üzerinden `<canvas>` yüzeyine çizer:
 * - Chrome DevTools Network sekmesinde tek bir `data:image/...` satırı veya önizlemesi oluşmaz.
 * - Sağ tık "Resmi Farklı Kaydet / Resmi Kopyala" ve sürükleyip dışarı alma engellenir.
 * - Arka plan iş parçacığında (`createImageBitmap`) çözüldüğü için ana arayüzü hiç yavaşlatmaz.
 */
export default function ProtectedCanvasImage({
  src,
  alt = "",
  fit = "cover",
  hugAspect = false,
  fillSlotAspect = false,
  className = "",
  style,
}: ProtectedCanvasImageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const [slotCssSize, setSlotCssSize] = useState<{ w: number; h: number } | null>(null);

  const paint = () => {
    const canvas = canvasRef.current;
    const bmp = bitmapRef.current;
    if (!canvas || !bmp) return;

    const bw = bmp.width || 1;
    const bh = bmp.height || 1;

    if (fillSlotAspect) {
      const parent = canvas.parentElement;
      if (!parent) return;
      const cs = typeof window !== "undefined" ? window.getComputedStyle(parent) : null;
      const padX = cs
        ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
        : 0;
      const padY = cs
        ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
        : 0;
      const availW = Math.max(16, parent.clientWidth - padX);
      const availH = Math.max(16, parent.clientHeight - padY);

      const imgRatio = bw / bh;
      const boxRatio = availW / availH;
      const fitCssW =
        Math.round((imgRatio > boxRatio ? availW : availH * imgRatio) * 10) / 10;
      const fitCssH =
        Math.round((imgRatio > boxRatio ? availW / imgRatio : availH) * 10) / 10;

      setSlotCssSize((prev) =>
        prev && Math.abs(prev.w - fitCssW) < 0.5 && Math.abs(prev.h - fitCssH) < 0.5
          ? prev
          : { w: fitCssW, h: fitCssH }
      );

      // İç piksel tamponunu her zaman tam netlikte tut (CSS transform scale'den etkilenmez!)
      const bufW = Math.min(1280, Math.max(bw, Math.round(fitCssW * 2)));
      const bufH = Math.max(16, Math.round(bufW * (bh / bw)));
      if (canvas.width !== bufW || canvas.height !== bufH) {
        canvas.width = bufW;
        canvas.height = bufH;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, bufW, bufH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, bufW, bufH);
      return;
    }

    if (hugAspect) {
      // Doğal piksel boyutunu doğrudan ata (getBoundingClientRect geri beslemesi yapılmaz!)
      const maxSide = 1280;
      const scale = bw > maxSide || bh > maxSide ? maxSide / Math.max(bw, bh) : 1;
      const targetW = Math.max(1, Math.round(bw * scale));
      const targetH = Math.max(1, Math.round(bh * scale));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, targetW, targetH);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || canvas.clientWidth || 160;
    const cssH = rect.height || canvas.clientHeight || 120;
    const dpr = Math.min(2.5, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const cw = Math.max(16, Math.round(cssW * dpr));
    const ch = Math.max(16, Math.round(cssH * dpr));

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (fit === "fill") {
      ctx.drawImage(bmp, 0, 0, cw, ch);
    } else if (fit === "contain") {
      const scale = Math.min(cw / bw, ch / bh);
      const dw = bw * scale;
      const dh = bh * scale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;
      ctx.drawImage(bmp, dx, dy, dw, dh);
    } else {
      // cover
      const scale = Math.max(cw / bw, ch / bh);
      const sw = cw / scale;
      const sh = ch / scale;
      const sx = (bw - sw) / 2;
      const sy = (bh - sh) / 2;
      ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, cw, ch);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!src) {
      bitmapRef.current = null;
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext("2d");
        ctx?.clearRect(0, 0, c.width, c.height);
      }
      return;
    }

    decodeDataUrlToBitmap(src).then((bmp) => {
      if (cancelled || !bmp) return;
      bitmapRef.current = bmp;
      paint();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, fit, hugAspect, fillSlotAspect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      if (bitmapRef.current) paint();
    });
    if (fillSlotAspect) {
      if (canvas.parentElement) ro.observe(canvas.parentElement);
    } else if (!hugAspect) {
      ro.observe(canvas);
    }
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, hugAspect, fillSlotAspect]);

  const mergedStyle: CSSProperties | undefined =
    fillSlotAspect && slotCssSize
      ? {
          ...style,
          width: `${slotCssSize.w}px`,
          height: `${slotCssSize.h}px`,
        }
      : style;

  return (
    <canvas
      ref={canvasRef}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      style={mergedStyle}
      className={`select-none block ${className}`}
    />
  );
}
