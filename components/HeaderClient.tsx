"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

const iconBtnClass =
  "relative flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900";

const badgeClass =
  "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-stone-900 px-1 text-[9px] font-semibold text-white";

export function HeaderClient({ loggedIn, accountHref, greetingName, avatarUrl }: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { count } = useFavorites();

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const logo = (
    <Link
      href="/"
      className="group flex flex-col items-center leading-none transition-opacity hover:opacity-70 sm:items-start"
    >
      <span className="text-base font-extralight uppercase tracking-[0.22em] text-stone-900 sm:text-lg sm:tracking-[0.28em] md:tracking-[0.32em]">
        Ludimila Reis
      </span>
      <span className="mt-0.5 text-[10px] font-light uppercase tracking-[0.38em] text-stone-400">
        Closet
      </span>
    </Link>
  );

  const searchBtn = (
    <button
      type="button"
      aria-label="Buscar"
      onClick={() => setSearchOpen(true)}
      className={iconBtnClass}
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
    </button>
  );

  const favBtn = (
    <Link
      href="/favoritos"
      aria-label={`Favoritos${count > 0 ? ` (${count})` : ""}`}
      className={iconBtnClass}
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
      </svg>
      {count > 0 && (
        <span className={badgeClass}>{count > 9 ? "9+" : count}</span>
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
        <span className="hidden text-sm text-stone-700 sm:inline">{greetingName}</span>
      )}
    </Link>
  ) : (
    <Link
      href={accountHref}
      aria-label="Entrar"
      className="flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 sm:h-auto sm:w-auto sm:rounded-none sm:px-1 sm:hover:bg-transparent"
    >
      <UserNavIcon className="h-5 w-5 sm:hidden" />
      <span className="hidden text-xs font-medium uppercase tracking-widest text-stone-500 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-900 hover:decoration-stone-900 sm:inline">
        Entrar
      </span>
    </Link>
  );

  return (
    <header
      className={`sticky top-0 z-50 w-full min-w-0 border-b bg-white/90 backdrop-blur-md transition-[border-color,box-shadow] duration-200 ${
        scrolled
          ? "border-stone-200/80 shadow-sm"
          : "border-stone-200 shadow-none"
      }`}
    >
      <div className="mx-auto flex h-14 w-full min-w-0 max-w-7xl items-center px-4 sm:h-16 sm:px-6 md:px-8">
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
          <nav className="flex items-center gap-0.5" aria-label="Ações">
            {searchBtn}
            {favBtn}
            <CartHeaderLink />
            {accountBtn}
          </nav>
        </div>
      </div>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </header>
  );
}
