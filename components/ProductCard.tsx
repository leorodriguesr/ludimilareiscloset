"use client";

import { useState } from "react";
import Link from "next/link";
import { cloudinaryImageUrl } from "@/lib/images/cloudinary-url";
import { formatPrice } from "@/lib/format";
import { installmentValueEqualParts } from "@/lib/product-pricing";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import { colorSwatchStyle } from "@/lib/color-swatch";
import {
  findBestImageIndex,
  imageMatchesColorSwatch,
} from "@/lib/image-color-bindings";

interface Color {
  id: string;
  name: string;
  hex: string | null;
}

interface ProductImage {
  url: string;
  colorName?: string | null;
}

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  pixPrice?: number | null;
  installmentCount?: number | null;
  images: ProductImage[];
  tag?: string | null;
  colors?: Color[];
  /** Nome da primeira peça — usado para bater a foto pela cor dessa peça. */
  colorPieceName?: string | null;
  backorderOnly?: boolean;
  priority?: boolean;
}

function IconCard({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
      />
    </svg>
  );
}

export function ProductCard({
  id,
  name,
  price,
  pixPrice,
  installmentCount,
  images,
  tag,
  colors = [],
  colorPieceName = null,
  backorderOnly = false,
  priority = false,
}: ProductCardProps) {
  const showPix =
    pixPrice != null && Number.isFinite(pixPrice) && pixPrice > 0;
  const installments =
    installmentCount != null &&
      Number.isFinite(installmentCount) &&
      installmentCount >= 1 &&
      installmentCount <= 24
      ? Math.floor(installmentCount)
      : null;
  const installmentEach =
    installments != null
      ? installmentValueEqualParts(price, installments)
      : null;

  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  // Foto pela cor da primeira peça (não mistura com cores das outras peças)
  let activeImage = images[0];
  if (selectedColor) {
    if (colorPieceName) {
      const idx = findBestImageIndex(images, {
        [colorPieceName]: selectedColor,
      });
      activeImage = idx !== -1 ? images[idx] : images[0];
    } else {
      activeImage =
        images.find((img) =>
          imageMatchesColorSwatch(img.colorName, selectedColor)
        ) ?? images[0];
    }
  }

  const imageUrl = activeImage?.url ?? null;
  const hoverImageUrl =
    images.find((image) => image.url !== imageUrl)?.url ?? null;

  return (
    <div className="group flex flex-col">
      <Link href={`/products/${id}`}>
        {/* Imagem */}
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
          {imageUrl ? (
            <img
              src={cloudinaryImageUrl(imageUrl, 720)}
              srcSet={`${cloudinaryImageUrl(imageUrl, 360)} 360w, ${cloudinaryImageUrl(imageUrl, 720)} 720w`}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              alt={name}
              width={720}
              height={960}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={priority ? "high" : "low"}
              className={`h-full w-full object-cover object-center transition-all duration-700 ease-out group-hover:scale-105 ${
                hoverImageUrl ? "group-hover:opacity-0" : ""
              }`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-stone-300">
              <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          {hoverImageUrl ? (
            <img
              src={cloudinaryImageUrl(hoverImageUrl, 720)}
              alt=""
              width={720}
              height={960}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full scale-105 object-cover object-center opacity-0 transition-all duration-700 ease-out group-hover:scale-100 group-hover:opacity-100"
            />
          ) : null}

          {tag && (
            <span className="absolute left-0 top-3 bg-stone-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white">
              {tag}
            </span>
          )}
          {backorderOnly ? (
            <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-700 shadow-sm backdrop-blur">
              Sob encomenda
            </span>
          ) : null}
        </div>
      </Link>

      {/* Informações + favorito */}
      <div className=" px-2 pb-3 sm:px-2 pt-2">
        {/* Cores + favorito */}
        <div className="flex min-h-[1.25rem] items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            {colors.slice(0, 6).map((color) => (
              <button
                key={color.id}
                type="button"
                title={color.name}
                onClick={() =>
                  setSelectedColor(
                    selectedColor === color.name ? null : color.name
                  )
                }
                className={`h-4 w-4 cursor-pointer rounded-[2px] border transition-all ${selectedColor === color.name
                    ? "scale-110 ring-1 ring-stone-900 "
                    : "border-stone-200"
                  }`}
                style={colorSwatchStyle(color.hex)}
              />
            ))}
            {colors.length > 6 && (
              <span className="text-[10px] text-stone-400">+{colors.length - 6}</span>
            )}
          </div>
          <FavoriteButton productId={id} />
        </div>

        {/* Nome e preços */}
        <Link href={`/products/${id}`} className="block space-y-1.5 pt-2">
          <h3 className="text-sm font-light leading-snug text-stone-800 transition-colors group-hover:text-stone-500">
            {name}
          </h3>

          <div className="space-y-1">
            {showPix ? (
              <div className="flex items-center gap-1.5">
                <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5 shrink-0 text-stone-400" fill="currentColor">
                  <path d="M11.917 11.71a2.046 2.046 0 0 1-1.454-.602l-2.1-2.1a.4.4 0 0 0-.551 0l-2.108 2.108a2.044 2.044 0 0 1-1.454.602h-.414l2.66 2.66c.83.83 2.177.83 3.007 0l2.667-2.668h-.253zM4.25 4.282c.55 0 1.066.214 1.454.602l2.108 2.108a.39.39 0 0 0 .552 0l2.1-2.1a2.044 2.044 0 0 1 1.453-.602h.253L9.503 1.623a2.127 2.127 0 0 0-3.007 0l-2.66 2.66h.414z" />
                  <path d="m14.377 6.496-1.612-1.612a.307.307 0 0 1-.114.023h-.733c-.379 0-.75.154-1.017.422l-2.1 2.1a1.005 1.005 0 0 1-1.425 0L5.268 5.32a1.448 1.448 0 0 0-1.018-.422h-.9a.306.306 0 0 1-.109-.021L1.623 6.496c-.83.83-.83 2.177 0 3.008l1.618 1.618a.305.305 0 0 1 .108-.022h.901c.38 0 .75-.153 1.018-.421L7.375 8.57a1.034 1.034 0 0 1 1.426 0l2.1 2.1c.267.268.638.421 1.017.421h.733c.04 0 .079.01.114.024l1.612-1.612c.83-.83.83-2.178 0-3.008z" />
                </svg>
                <p className="text-sm font-semibold tabular-nums text-stone-900">
                  {formatPrice(pixPrice!)}
                </p>
              </div>
            ) : (
              <p className="text-sm font-semibold tabular-nums text-stone-900">
                {formatPrice(price)}
              </p>
            )}

            {installments != null && installmentEach != null && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <IconCard className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                  <span className="text-xs font-normal tabular-nums text-stone-800">
                    {installments}x {formatPrice(installmentEach)}
                    {/* {showPix ? (
                      <span className="text-[11px] font-normal tabular-nums text-stone-400">
                        {" "}
                        ({formatPrice(price)})
                      </span>
                    ) : null} */}
                    <span className="font-normal text-stone-500"> s/ juros</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </Link>

      </div>
    </div>
  );
}
