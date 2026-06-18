"use client";

import { useFavorites } from "./FavoritesProvider";

interface FavoriteButtonProps {
  productId: string;
}

export function FavoriteButton({ productId }: FavoriteButtonProps) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(productId);

  return (
    <button
      type="button"
      aria-label={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(productId);
      }}
      className="flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
    >
      <svg
        className={`h-4 w-4 sm:h-5 sm:w-5 transition-colors ${active ? "fill-rose-400 stroke-rose-400" : "fill-none stroke-stone-400"}`}
        strokeWidth={1.8}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
        />
      </svg>
    </button>
  );
}
