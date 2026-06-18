"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

interface Product {
  id: string;
  name: string;
  price: number;
  images: { url: string }[];
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface SearchResults {
  products: Product[];
  categories: Category[];
}

interface SearchOverlayProps {
  onClose: () => void;
}

export function SearchOverlay({ onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ products: [], categories: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (query.length < 2) {
      setResults({ products: [], categories: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data: SearchResults = await res.json();
        setResults(data);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const hasResults = results.products.length > 0 || results.categories.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Painel */}
      <div className="relative mx-auto w-full max-w-2xl">
        {/* Campo de busca */}
        <div className="flex items-center gap-3 bg-white px-4 py-4 shadow-lg sm:px-6">
          <svg className="h-5 w-5 shrink-0 text-stone-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produtos ou categorias..."
            className="flex-1 bg-transparent text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-stone-400 hover:text-stone-700"
            aria-label="Fechar busca"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Resultados */}
        {query.length >= 2 && (
          <div className="max-h-[70vh] overflow-y-auto bg-white shadow-xl">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" />
              </div>
            ) : !hasResults ? (
              <div className="py-10 text-center text-sm text-stone-400">
                Nenhum resultado encontrado para &quot;{query}&quot;
              </div>
            ) : (
              <div>
                {/* Categorias */}
                {results.categories.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400 sm:px-6">
                      Categorias
                    </p>
                    <ul className="divide-y divide-stone-100">
                      {results.categories.map((category) => (
                        <li key={category.id}>
                          <Link
                            href={`/?c=${category.id}`}
                            onClick={() => {
                              onClose();
                              setTimeout(() => {
                                const el = document.getElementById("produtos");
                                if (el) {
                                  const top = el.getBoundingClientRect().top + window.scrollY - 40;
                                  window.scrollTo({ top, behavior: "smooth" });
                                }
                              }, 100);
                            }}
                            className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-stone-50 sm:px-6"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100">
                              <svg className="h-4 w-4 text-stone-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-light text-stone-900">
                                {category.name}
                              </p>
                              <p className="mt-0.5 text-xs text-stone-400">Ver todos os produtos</p>
                            </div>
                            <svg className="h-4 w-4 shrink-0 text-stone-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                            </svg>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Produtos */}
                {results.products.length > 0 && (
                  <div>
                    {results.categories.length > 0 && (
                      <div className="border-t border-stone-100" />
                    )}
                    <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400 sm:px-6">
                      Produtos
                    </p>
                    <ul className="divide-y divide-stone-100">
                      {results.products.map((product) => (
                        <li key={product.id}>
                          <Link
                            href={`/products/${product.id}`}
                            onClick={onClose}
                            className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-stone-50 sm:px-6"
                          >
                            <div className="h-14 w-14 shrink-0 overflow-hidden bg-stone-100">
                              {product.images[0] ? (
                                <img
                                  src={product.images[0].url}
                                  alt={product.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="h-full w-full" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-light text-stone-900">
                                {product.name}
                              </p>
                              <p className="mt-0.5 text-xs font-medium text-stone-600">
                                {formatPrice(product.price)}
                              </p>
                            </div>
                            <svg className="h-4 w-4 shrink-0 text-stone-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                            </svg>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
