"use client";

import Link from "next/link";
import { useState } from "react";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { CartHeaderLink } from "@/components/cart/CartHeaderLink";
import { UserNavIcon } from "@/components/UserNavIcon";
import { SearchOverlay } from "@/components/SearchOverlay";

interface Props {
  loggedIn: boolean;
  accountHref: string;
  greetingName: string | null;
  avatarUrl: string | null;
}

export function HeaderClient({ loggedIn, accountHref, greetingName, avatarUrl }: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { count } = useFavorites();

  const logo = (
    <Link
      href="/"
      className="group flex flex-col items-center leading-none transition-opacity hover:opacity-70 sm:items-start"
    >
      <span className="text-base font-semibold uppercase tracking-[0.18em] text-stone-900 sm:text-lg sm:tracking-[0.22em] md:text-xl md:tracking-[0.28em]">
        Ludimila Reis
      </span>
      <span className="text-[11px] font-light uppercase tracking-[0.35em] text-stone-400 sm:text-[10px]">
        Closet
      </span>
    </Link>
  );

  const searchBtn = (
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
  );

  const favBtn = (
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
  );

  const accountBtn = loggedIn ? (
    <Link
      href="/minha-conta"
      aria-label={greetingName ? `Minha conta — ${greetingName}` : "Minha conta"}
      className="flex h-9 items-center gap-2 rounded-full px-2 transition-colors hover:bg-stone-100 sm:px-3"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-900 text-white">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={greetingName ?? "Minha conta"}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <UserNavIcon className="h-3.5 w-3.5" />
        )}
      </span>
      {greetingName && (
        <span className="hidden sm:inline text-sm text-stone-700">{greetingName}</span>
      )}
    </Link>
  ) : (
    <Link
      href={accountHref}
      aria-label="Entrar"
      className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-stone-100 sm:h-auto sm:w-auto sm:rounded-none sm:px-0 sm:hover:bg-transparent"
    >
      <UserNavIcon className="h-5 w-5 text-stone-600 sm:hidden" />
      <span className="hidden sm:inline text-sm text-stone-500 transition-colors hover:text-stone-900">
        Entrar
      </span>
    </Link>
  );

  return (
    <>
      {/* Layout mobile: 3 colunas — esquerda, centro, direita */}
      <div className="flex w-full items-center sm:hidden">
        <div className="flex flex-1 items-center gap-0.5">
          {searchBtn}
          {favBtn}
        </div>
        {logo}
        <div className="flex flex-1 items-center justify-end gap-0.5">
          <CartHeaderLink />
          {accountBtn}
        </div>
      </div>

      {/* Layout desktop: logo à esquerda, ações à direita */}
      <div className="hidden w-full items-center justify-between sm:flex">
        {logo}
        <nav className="flex items-center gap-0.5">
          {searchBtn}
          {favBtn}
          <CartHeaderLink />
          {accountBtn}
        </nav>
      </div>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </>
  );
}
