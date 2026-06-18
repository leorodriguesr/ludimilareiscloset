"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { installmentValueEqualParts } from "@/lib/product-pricing";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";

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
}: ProductCardProps) {
  const parts = installmentCount ?? 6;
  const installmentValue = installmentValueEqualParts(price, parts);

  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  // Encontra a imagem correspondente à cor selecionada, ou usa a primeira
  const activeImage = selectedColor
    ? (images.find((img) => img.colorName === selectedColor) ?? images[0])
    : images[0];

  const imageUrl = activeImage?.url ?? null;

  return (
    <div className="group flex flex-col">
      <Link href={`/products/${id}`}>
        {/* Imagem */}
        <div className="relative aspect-[3/4] overflow-hidden bg-stone-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-stone-300">
              <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          {tag && (
            <span className="absolute left-0 top-3 bg-stone-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white">
              {tag}
            </span>
          )}
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
                className={`h-4 w-4 cursor-pointer rounded-full border transition-all ${
                  selectedColor === color.name
                    ? "scale-110 ring-1 ring-stone-900 "
                    : "border-stone-200"
                }`}
                style={{ backgroundColor: color.hex ?? "#e7e5e4" }}
              />
            ))}
            {colors.length > 6 && (
              <span className="text-[10px] text-stone-400">+{colors.length - 6}</span>
            )}
          </div>
          <FavoriteButton productId={id} />
        </div>

        {/* Nome e preços */}
        <Link href={`/products/${id}`} className=" block space-y-0.5 pt-2">
          <h3 className="text-sm font-light leading-snug text-stone-800 transition-colors group-hover:text-stone-500">
            {name}
          </h3>

          <p className="text-sm font-semibold text-stone-900">
            {formatPrice(price)}
          </p>

          {pixPrice != null && pixPrice > 0 && (
            <p className="text-[11px] font-medium text-emerald-700">
              No Pix {formatPrice(pixPrice)}
            </p>
          )}

          <p className="text-[11px] text-stone-500">
            {parts}× {formatPrice(installmentValue)}
          </p>
        </Link>
      </div>
    </div>
  );
}
