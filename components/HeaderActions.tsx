"use client";

import Link from "next/link";
import { useState } from "react";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { SearchOverlay } from "@/components/SearchOverlay";

export function HeaderActions() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { count } = useFavorites();

  return (
    <>
      {/* Busca */}
      <button
        type="button"
        aria-label="Buscar"
        onClick={() => setSearchOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-stone-100"
      >
        <svg className="h-5 w-5 text-stone-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      </button>

      {/* Favoritos */}
      <Link
        href="/favoritos"
        aria-label={`Favoritos${count > 0 ? ` (${count})` : ""}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-stone-100"
      >
        <svg className="h-5 w-5 text-stone-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-stone-900 text-[9px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Link>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </>
  );
}
