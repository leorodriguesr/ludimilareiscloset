"use client";

import { useEffect, useRef, useState } from "react";
import { showcaseVideos, type ShowcaseVideoItem } from "@/lib/showcase-videos";

export type { ShowcaseVideoItem };

export function ShowcaseVideos({ videos = showcaseVideos }: { videos?: readonly ShowcaseVideoItem[] } = {}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [center, setCenter] = useState(0);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const update = () => setWidth(section.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  if (videos.length === 0) return null;

  const count = videos.length;
  const isPhone = width != null && width < 640;
  const showArrows = width != null && (isPhone ? count > 1 : cardsThatFit(width, count) < count);
  const ordered = windowAround(videos, center, count);

  return (
    <section ref={sectionRef} aria-label="Vídeos da loja" className="relative overflow-hidden bg-white py-6 sm:py-10">
      <div className="flex items-center gap-3 max-sm:relative max-sm:left-1/2 max-sm:w-max max-sm:-translate-x-1/2 sm:px-3">
        {ordered.map((video) => {
          const featured = video.id === videos[center]?.id;
          return (
            <div
              key={video.id}
              className={`min-w-0 ${
                featured
                  ? "max-sm:w-[78vw] max-sm:shrink-0 sm:flex-[1.16]"
                  : "max-sm:w-[64vw] max-sm:shrink-0 sm:flex-1"
              }`}
            >
              <VideoCard src={video.src} />
            </div>
          );
        })}
      </div>

      {showArrows ? (
        <>
          <button
            type="button"
            aria-label="Vídeo anterior"
            onClick={() => setCenter((current) => (current - 1 + count) % count)}
            className="absolute left-0 top-1/2 z-20 flex h-10 w-8 -translate-y-1/2 items-center justify-center text-2xl text-stone-700 transition-colors hover:text-stone-950"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Próximo vídeo"
            onClick={() => setCenter((current) => (current + 1) % count)}
            className="absolute right-0 top-1/2 z-20 flex h-10 w-8 -translate-y-1/2 items-center justify-center text-2xl text-stone-700 transition-colors hover:text-stone-950"
          >
            ›
          </button>
        </>
      ) : null}
    </section>
  );
}

function cardsThatFit(width: number, count: number) {
  if (width >= 1024) return Math.min(count, 5);

  const gap = 12;
  const pad = 24;
  const minCard = 230;
  const available = Math.max(0, width - pad);
  const capacity = Math.max(1, Math.floor((available + gap) / (minCard + gap)));
  return Math.min(count, capacity);
}

function windowAround(videos: readonly ShowcaseVideoItem[], center: number, size: number) {
  const count = videos.length;
  const start = center - Math.floor((size - 1) / 2);
  return Array.from({ length: size }, (_, offset) => videos[(start + offset + count) % count]!);
}

function VideoCard({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    void video.play().catch(() => undefined);
  }, [src]);

  return (
    <div className="overflow-hidden rounded-[15px] bg-stone-200">
      <div className="relative aspect-[220/377]">
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      </div>
    </div>
  );
}
