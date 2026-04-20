"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getVideoEmbedInfo } from "@/lib/video-embed";

export type ProductMediaImage = { url: string };

type MediaItem =
  | { kind: "image"; url: string }
  | {
      kind: "video";
      embedUrl: string | null;
      originalUrl: string;
    };

function buildMediaItems(
  images: ProductMediaImage[],
  videoUrl: string | null | undefined
): MediaItem[] {
  const items: MediaItem[] = images.map((img) => ({
    kind: "image",
    url: img.url,
  }));
  if (videoUrl?.trim()) {
    const info = getVideoEmbedInfo(videoUrl);
    if (info) {
      items.push({
        kind: "video",
        embedUrl: info.embedUrl,
        originalUrl: info.originalUrl,
      });
    }
  }
  return items;
}

type ProductMediaGalleryProps = {
  images: ProductMediaImage[];
  productName: string;
  videoUrl?: string | null;
};

export function ProductMediaGallery({
  images,
  productName,
  videoUrl,
}: ProductMediaGalleryProps) {
  const mediaItems = useMemo(
    () => buildMediaItems(images, videoUrl),
    [images, videoUrl]
  );

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (mediaItems.length === 0) return;
    setSelectedIndex((i) => Math.min(i, mediaItems.length - 1));
  }, [mediaItems.length]);

  const safeIndex =
    mediaItems.length === 0
      ? 0
      : Math.min(selectedIndex, mediaItems.length - 1);
  const selected = mediaItems[safeIndex];

  const goPrev = useCallback(() => {
    if (mediaItems.length <= 1) return;
    setSelectedIndex((i) => (i === 0 ? mediaItems.length - 1 : i - 1));
  }, [mediaItems.length]);

  const goNext = useCallback(() => {
    if (mediaItems.length <= 1) return;
    setSelectedIndex((i) =>
      i === mediaItems.length - 1 ? 0 : i + 1
    );
  }, [mediaItems.length]);

  if (mediaItems.length === 0) {
    return (
      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-none bg-stone-100 lg:rounded-xl">
        <p className="text-stone-400">Sem mídia</p>
      </div>
    );
  }

  const showArrows = mediaItems.length > 1;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-0 lg:flex-row-reverse lg:items-start lg:gap-0">
      {/* Área principal: imagem ou vídeo */}
      <div className="relative min-w-0 w-full max-w-full flex-1">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-none bg-stone-100 lg:rounded-xl">
          {selected.kind === "image" ? (
            <img
              src={selected.url}
              alt={`${productName} - Foto ${safeIndex + 1}`}
              className="h-full w-full object-cover"
            />
          ) : selected.embedUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="aspect-video h-full max-h-full w-full max-w-full">
                <iframe
                  title={`Vídeo: ${productName}`}
                  src={selected.embedUrl}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-sm text-stone-600">Vídeo em link externo</p>
              <a
                href={selected.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-800 hover:border-stone-900 transition-colors"
              >
                Abrir vídeo
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          )}

          {showArrows && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-stone-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
                aria-label="Mídia anterior"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-stone-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
                aria-label="Próxima mídia"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>

              <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                {mediaItems.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === safeIndex ? "w-6 bg-white" : "w-1.5 bg-white/50"
                    }`}
                    aria-label={
                      mediaItems[i]?.kind === "video"
                        ? "Vídeo"
                        : `Foto ${i + 1}`
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Miniaturas: coluna à esquerda no desktop (via flex-row-reverse); abaixo no mobile */}
      {mediaItems.length > 1 && (
        <div className="flex max-h-none w-full min-w-0 max-w-full shrink-0 items-center gap-2.5 overflow-x-auto overscroll-x-contain px-2 pb-2 pt-4 [-webkit-overflow-scrolling:touch] min-[401px]:px-3 sm:px-4 md:px-6 lg:max-h-[min(70vh,40rem)] lg:w-[7.75rem] lg:max-w-none lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:px-2 lg:py-2 lg:pt-2 lg:overscroll-auto">
          {mediaItems.map((item, i) => (
            <button
              key={item.kind === "image" ? `img-${item.url}-${i}` : `vid-${i}`}
              type="button"
              onClick={() => setSelectedIndex(i)}
              className={`relative m-0 shrink-0 rounded-lg border-0 bg-transparent p-0 shadow-none transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 ${
                i === safeIndex
                  ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-white"
                  : "opacity-70 hover:opacity-100"
              }`}
              aria-label={
                item.kind === "video" ? "Ver vídeo do produto" : `Foto ${i + 1}`
              }
            >
              <div className="relative h-24 w-24 overflow-hidden rounded-lg">
                {item.kind === "image" ? (
                  <img
                    src={item.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <>
                    {images[0]?.url ? (
                      <img
                        src={images[0].url}
                        alt=""
                        className="h-full w-full object-cover opacity-40"
                      />
                    ) : (
                      <div className="h-full w-full bg-stone-300" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-stone-900 shadow">
                        <svg
                          className="ml-0.5 h-6 w-6"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
