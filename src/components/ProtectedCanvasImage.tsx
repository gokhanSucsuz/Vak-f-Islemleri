"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { decodeDataUrlToBitmap } from "@/lib/presentationClient";

interface ProtectedCanvasImageProps {
  src: string;
  alt?: string;
  fit?: "contain" | "cover" | "fill";
  /**
   * `true` olduğunda tuvalin doğal en/boy oranı görselin kendisine kilitlenir
   * (`max-w-full max-h-full w-auto h-auto`), böylece kurumsal 3B fotoğraf çerçeveleri
   * tıpkı `<img>` etiketinde olduğu gibi fotoğrafın kenarlarını sıfır boşlukla sarar.
   */
  hugAspect?: boolean;
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
  className = "",
  style,
}: ProtectedCanvasImageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const [intrinsicSize, setIntrinsicSize] = useState<{ w: number; h: number }>({
    w: 400,
    h: 300,
  });

  const paint = () => {
    const canvas = canvasRef.current;
    const bmp = bitmapRef.current;
    if (!canvas || !bmp) return;

    const bw = bmp.width || 1;
    const bh = bmp.height || 1;

    if (hugAspect) {
      // Tuvalin CSS kutusu doğal en/boy oranında şekillenir; yüksek netlik için hedef piksel boyutunu ayarla
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2.5, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      const targetW =
        rect.width > 4
          ? Math.min(bw, Math.max(64, Math.round(rect.width * dpr)))
          : Math.min(bw, 960);
      const targetH = Math.max(48, Math.round(targetW * (bh / bw)));

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
      if (hugAspect) {
        const maxSide = 960;
        const ratio = bmp.height / Math.max(1, bmp.width);
        const w = Math.min(bmp.width, maxSide);
        const h = Math.max(1, Math.round(w * ratio));
        setIntrinsicSize({ w, h });
      }
      paint();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, fit, hugAspect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      if (bitmapRef.current) paint();
    });
    ro.observe(canvas);
    if (hugAspect && canvas.parentElement) {
      ro.observe(canvas.parentElement);
    }
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, hugAspect]);

  return (
    <canvas
      ref={canvasRef}
      width={hugAspect ? intrinsicSize.w : undefined}
      height={hugAspect ? intrinsicSize.h : undefined}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      style={style}
      className={`select-none ${hugAspect ? "" : "block"} ${className}`}
    />
  );
}
