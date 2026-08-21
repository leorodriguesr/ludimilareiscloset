"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { formatPrice } from "@/lib/format";
import { installmentValueEqualParts } from "@/lib/product-pricing";
import type { Product } from "@/lib/types";

export function ProductSearchSelect({
  products,
  onSelect,
}: {
  products: Product[];
  onSelect: (product: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="box-border flex h-8 w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-2.5 text-left text-xs font-medium text-stone-500 transition-colors hover:border-stone-300 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
      >
        <span>Selecionar produto…</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1.5 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-100 p-2">
            <input
              autoFocus
              placeholder="Buscar produto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="box-border h-8 w-full rounded-md border border-stone-200 px-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto overscroll-contain p-1">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-4 text-center text-xs text-stone-400">
                Nenhum produto encontrado.
              </li>
            ) : (
              filtered.map((p) => {
                const pix =
                  p.pixPrice != null && p.pixPrice > 0 ? p.pixPrice : null;
                const inst = Math.floor(p.installmentCount ?? 0);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(p);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-stone-50"
                    >
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-stone-100">
                        {p.images[0]?.url && (
                          <Image
                            src={p.images[0].url}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="36px"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-medium leading-snug text-stone-900">
                          {p.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="text-xs font-semibold tabular-nums text-stone-800">
                            {formatPrice(p.price)}
                            {inst > 0 && (
                              <span className="ml-1 font-normal text-stone-400">
                                · {inst}×{" "}
                                {formatPrice(
                                  installmentValueEqualParts(p.price, inst)
                                )}
                              </span>
                            )}
                          </span>
                          {pix != null && (
                            <span className="inline-flex items-center gap-1 text-xs tabular-nums text-stone-600">
                              <Image
                                src="/pix-icon.svg"
                                alt=""
                                width={12}
                                height={12}
                                unoptimized
                                className="h-3 w-3 object-contain"
                              />
                              {formatPrice(pix)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
