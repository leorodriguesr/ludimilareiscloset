"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findBestImageIndex } from "@/lib/image-color-bindings";
import { getVideoEmbedInfo } from "@/lib/video-embed";

export type ProductMediaImage = { url: string; colorName?: string | null };

type MediaItem =
  | { kind: "image"; url: string }
  | { kind: "video"; embedUrl: string | null; originalUrl: string };

function buildMediaItems(
  images: ProductMediaImage[],
  videoUrl: string | null | undefined
): MediaItem[] {
  const items: MediaItem[] = images.map((img) => ({ kind: "image", url: img.url }));
  if (videoUrl?.trim()) {
    const info = getVideoEmbedInfo(videoUrl);
    if (info) items.push({ kind: "video", embedUrl: info.embedUrl, originalUrl: info.originalUrl });
  }
  return items;
}

function MediaSlide({ item, label }: { item: MediaItem; label: string }) {
  if (item.kind === "image") {
    return (
      <img
        src={item.url}
        alt={label}
        className="h-full w-full object-cover"
        draggable={false}
      />
    );
  }
  if (item.embedUrl) {
    return (
      <div className="relative h-full w-full bg-black">
        <iframe
          title={label}
          src={item.embedUrl}
          className="h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-stone-100 p-6 text-center">
      <p className="text-sm text-stone-600">Vídeo externo</p>
      <a
        href={item.originalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-800 hover:border-stone-900"
      >
        Abrir vídeo
      </a>
    </div>
  );
}

type ProductMediaGalleryProps = {
  images: ProductMediaImage[];
  productName: string;
  videoUrl?: string | null;
};

export function ProductMediaGallery({ images, productName, videoUrl }: ProductMediaGalleryProps) {
  const mediaItems = useMemo(() => buildMediaItems(images, videoUrl), [images, videoUrl]);
  const total = mediaItems.length;

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Mede o container desktop para calcular o stride em pixels (item + gap)
  const DESKTOP_GAP = 16; // px — gap-2
  const desktopContainerRef = useRef<HTMLDivElement>(null);
  const [desktopStride, setDesktopStride] = useState(0);
  useEffect(() => {
    const el = desktopContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setDesktopStride(w / 2 + DESKTOP_GAP / 2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // No desktop: janela deslizante de 2 (máx index = total - 2)
  // No mobile: 1 por vez (máx index = total - 1)
  const maxIndex = isDesktop && total > 1 ? total - 2 : total - 1;
  const [currentIndex, setCurrentIndex] = useState(0);
  const goTo = useCallback((i: number) => {
    setCurrentIndex(Math.max(0, Math.min(i, maxIndex)));
  }, [maxIndex]);

  // Corrige currentIndex ao trocar entre mobile/desktop
  useEffect(() => {
    setCurrentIndex((i) => Math.min(i, maxIndex));
  }, [maxIndex]);

  const goPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo]);
  const goNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo]);

  // Navega pela combinação de cores das peças (não usar color:selected —
  // ele pegava a 1ª foto com aquela cor e sobrescrevia o match correto).
  useEffect(() => {
    function handlePieceColorsChanged(e: Event) {
      const selectedByPiece = (e as CustomEvent<Record<string, string | null>>)
        .detail;
      const idx = findBestImageIndex(images, selectedByPiece ?? {});
      if (idx !== -1) goTo(idx);
    }
    window.addEventListener("piece-colors:changed", handlePieceColorsChanged);
    return () => {
      window.removeEventListener(
        "piece-colors:changed",
        handlePieceColorsChanged
      );
    };
  }, [images, goTo]);

  // Swipe no mobile
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? goNext() : goPrev();
    touchStartX.current = null;
  };

  if (total === 0) {
    return (
      <div className="flex aspect-[3/4] w-full items-center justify-center bg-stone-100 lg:rounded-xl">
        <p className="text-stone-400">Sem mídia</p>
      </div>
    );
  }

  const showNav = total > 1;
  const totalSteps = maxIndex + 1; // total de posições navegáveis

  return (
    <div className="w-full select-none">
      {/* Área principal */}
      <div
        className="relative overflow-hidden rounded-none lg:max-h-[82vh]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Desktop: track com slide lateral — gap fixo, stride em px */}
        <div ref={desktopContainerRef} className="hidden lg:block lg:overflow-hidden">
          <div
            className="flex"
            style={{
              gap: `${DESKTOP_GAP}px`,
              transform: `translateX(-${currentIndex * desktopStride}px)`,
              transition: "transform 480ms cubic-bezier(0.4, 0, 0.2, 1)",
              willChange: "transform",
            }}
          >
            {mediaItems.map((item, i) => (
              <div
                key={i}
                style={{ width: `calc(50% - ${DESKTOP_GAP / 2}px)`, flexShrink: 0 }}
              >
                <div className="aspect-[2/3] overflow-hidden bg-stone-100">
                  <div
                    className="h-full w-full"
                    style={{
                      transform: `scale(${i === currentIndex || i === currentIndex + 1 ? 1 : 1.04})`,
                      transition: "transform 480ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  >
                    <MediaSlide item={item} label={`${productName} — foto ${i + 1}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile: 1 imagem por vez com slide */}
        <div className="lg:hidden">
          <div
            className="flex"
            style={{
              transform: `translateX(-${currentIndex * 100}%)`,
              transition: "transform 420ms cubic-bezier(0.4, 0, 0.2, 1)",
              willChange: "transform",
            }}
          >
            {mediaItems.map((item, i) => (
              <div key={i} className="aspect-[3/4] w-full flex-none overflow-hidden bg-stone-100">
                <MediaSlide item={item} label={`${productName} — foto ${i + 1}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Setas — canto superior direito no desktop, laterais no mobile */}
        {showNav && (
          <>
            {/* Mobile: setas laterais centralizadas */}
            <button
              type="button"
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded bg-white/80 text-stone-700 shadow backdrop-blur-sm transition hover:bg-white disabled:opacity-30 lg:hidden"
              aria-label="Anterior"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={currentIndex === maxIndex}
              className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded bg-white/80 text-stone-700 shadow backdrop-blur-sm transition hover:bg-white disabled:opacity-30 lg:hidden"
              aria-label="Próxima"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Desktop: setas no canto superior direito — container único */}
            <div className="absolute right-3 top-3 z-10 hidden lg:flex">
              <div className="flex items-center overflow-hidden border border-stone-200 bg-white  backdrop-blur-sm p-1">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className="flex h-10 w-11 items-center justify-center text-stone-600 transition hover:bg-stone-50 disabled:opacity-30 disabled:cursor-default cursor-pointer"
                  aria-label="Anterior"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={currentIndex === maxIndex}
                  className="flex h-10 w-11 items-center justify-center text-stone-600 transition hover:bg-stone-50 disabled:opacity-30 disabled:cursor-default cursor-pointer"
                  aria-label="Próxima"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Dots — dentro da imagem (mobile) */}
        {showNav && (
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 lg:hidden">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Foto ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentIndex ? "w-6 bg-white" : "w-1.5 bg-white/50"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Indicador (desktop) */}
      {showNav && (
        <div className="mt-3 hidden items-center justify-center gap-3 lg:flex">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Foto ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentIndex ? "w-6 bg-stone-800" : "w-1.5 bg-stone-300"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
