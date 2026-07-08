"use client";

import Image from "next/image";
import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { installmentValueEqualParts } from "@/lib/product-pricing";
import type { Product } from "@/lib/types";
import {
  ProductFormModal,
  mapProductToFormData,
} from "./ProductFormModal";

interface ProductListProps {
  products: Product[];
  onRefresh: () => void;
  emptyKind?: "catalog" | "search";
  searchQuery?: string;
}

function productPixPrice(product: Product): number | null {
  const px = product.pixPrice;
  if (px != null && Number.isFinite(px) && px > 0) return px;
  return null;
}

function productCardInstallment(
  product: Product
): { parts: number; each: number } | null {
  const raw = product.installmentCount;
  if (raw == null || !Number.isFinite(raw)) return null;
  const parts = Math.floor(raw);
  if (parts < 1 || parts > 24) return null;
  return { parts, each: installmentValueEqualParts(product.price, parts) };
}

function ProductListPricing({ product }: { product: Product }) {
  const pixPrice = productPixPrice(product);
  const cardInst = productCardInstallment(product);

  return (
    <div className="grid grid-cols-2 gap-1.5" aria-label="Tabela de preços">
      <div className="rounded-lg border border-stone-200 bg-stone-50/80 px-2 py-1.5">
        <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
          Cartão
        </p>
        <p className="text-xs font-bold tabular-nums text-stone-900">
          {formatPrice(product.price)}
        </p>
        {cardInst ? (
          <p className="text-[10px] tabular-nums text-stone-500">
            {cardInst.parts}x {formatPrice(cardInst.each)}
          </p>
        ) : (
          <p className="text-[10px] text-stone-400">sem parcelas</p>
        )}
      </div>

      {pixPrice != null ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50/80 px-2 py-1.5">
          <div className="flex items-center gap-1">
            <Image
              src="/pix-icon.svg"
              alt=""
              width={12}
              height={12}
              unoptimized
              className="h-3 w-3 object-contain opacity-70"
            />
            <p className="text-[9px] font-bold uppercase tracking-wide text-stone-500">
              Pix
            </p>
          </div>
          <p className="text-xs font-bold tabular-nums text-stone-900">
            {formatPrice(pixPrice)}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-stone-200 px-2 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
            Pix
          </p>
          <p className="text-[10px] text-stone-400">não configurado</p>
        </div>
      )}
    </div>
  );
}

function LabelledChips({
  label,
  items,
  emptyText,
}: {
  label: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-stone-400">
        {label}
      </p>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex rounded border border-stone-200 bg-stone-50/80 px-1.5 py-px text-[10px] font-medium text-stone-600"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-stone-400">{emptyText}</p>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning" | "success";
}) {
  const tones = {
    neutral: "border-stone-200 bg-stone-50/70",
    warning: "border-stone-200 bg-stone-50/70",
    success: "border-stone-200 bg-stone-50/70",
  };

  const valueTones = {
    neutral: "text-stone-900",
    warning: "text-stone-700",
    success: "text-stone-900",
  };

  return (
    <div className={`rounded-lg border px-2 py-1.5 ${tones[tone]}`}>
      <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
        {label}
      </p>
      <p
        className={`mt-0.5 text-[11px] font-bold leading-tight ${valueTones[tone]}`}
      >
        {value}
      </p>
    </div>
  );
}

function countProductVariants(product: Product): number {
  return product.pieces.reduce((sum, piece) => sum + piece.variants.length, 0);
}

function countProductColors(product: Product): number {
  const names = new Set<string>();
  for (const piece of product.pieces) {
    for (const color of piece.colors) names.add(color.name);
  }
  return names.size;
}

function marginPercent(price: number, cost: number): number | null {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost)) {
    return null;
  }
  return Math.round(((price - cost) / price) * 100);
}

export function ProductList({
  products,
  onRefresh,
  emptyKind = "catalog",
  searchQuery = "",
}: ProductListProps) {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const list = Array.isArray(products) ? products : [];

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (res.ok) onRefresh();
    } finally {
      setDeletingId(null);
    }
  }

  if (list.length === 0) {
    const isSearchEmpty = emptyKind === "search";

    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400">
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
            aria-hidden
          >
            {isSearchEmpty ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
              />
            )}
          </svg>
        </div>
        <p className="text-sm font-medium text-stone-700">
          {isSearchEmpty
            ? "Nenhum produto encontrado"
            : "Nenhum produto cadastrado"}
        </p>
        <p className="mt-1 text-xs text-stone-500">
          {isSearchEmpty
            ? searchQuery
              ? `Nenhum resultado para “${searchQuery}”. Tente outro termo.`
              : "Tente outro termo de busca."
            : "Use o botão acima para adicionar o primeiro produto."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-8 sm:grid-cols-2">
        {list.map((product) => {
          const coverImage = product.images[0]?.url;
          const categories = product.categories.map((pc) => pc.category.name);
          const sections = (product.sections ?? []).map((ps) => ps.section.name);
          const stockQty = product.stockQuantity ?? 0;
          const isLimited = product.stockType === "LIMITED";
          const variantCount = countProductVariants(product);
          const colorCount = countProductColors(product);
          const margin =
            product.costPrice != null
              ? marginPercent(product.price, product.costPrice)
              : null;
          const lowStock = isLimited && stockQty > 0 && stockQty <= 3;
          const outOfStock = isLimited && stockQty === 0;

          return (
            <article
              key={product.id}
              className="flex overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="relative w-40 shrink-0 self-stretch overflow-hidden bg-stone-100 sm:w-44">
                {coverImage ? (
                  <img
                    src={coverImage}
                    alt={product.name}
                    className="h-full min-h-[9.5rem] w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full min-h-[9.5rem] items-center justify-center px-1 text-center text-[9px] font-medium leading-tight text-stone-400">
                    Sem foto
                  </div>
                )}
                {product.tag ? (
                  <span className="absolute left-1.5 top-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-md bg-stone-900/90 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">
                    {product.tag}
                  </span>
                ) : null}
                {product.images.length > 1 ? (
                  <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/50 px-1 py-px text-[8px] font-semibold text-white">
                    +{product.images.length - 1}
                  </span>
                ) : null}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
                    Produto
                  </p>
                  <h4 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-stone-900">
                    {product.name}
                  </h4>
                </div>

                <ProductListPricing product={product} />

                <div className="grid grid-cols-3 gap-1.5">
                  <StatTile
                    label="Estoque"
                    value={isLimited ? `${stockQty} un.` : "∞"}
                    tone={
                      outOfStock || lowStock
                        ? "warning"
                        : isLimited
                          ? "neutral"
                          : "success"
                    }
                  />
                  <StatTile
                    label="Grade"
                    value={
                      variantCount > 0
                        ? `${variantCount} var.`
                        : product.pieces.length > 0
                          ? `${product.pieces.length} peç.`
                          : "—"
                    }
                  />
                  <StatTile
                    label="Fotos"
                    value={String(product.images.length)}
                  />
                </div>

                {colorCount > 0 && (
                  <p className="text-[10px] text-stone-500">
                    <span className="font-semibold text-stone-400">Cores:</span>{" "}
                    {colorCount}
                  </p>
                )}

                <LabelledChips
                  label="Categorias"
                  items={categories}
                  emptyText="Nenhuma categoria"
                />

                <LabelledChips
                  label="Seções da vitrine"
                  items={sections}
                  emptyText="Fora da home"
                />

                {product.costPrice != null && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50/60 px-2 py-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
                      Uso interno
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-700">
                      Custo {formatPrice(product.costPrice)}
                      {margin != null && (
                        <span className="ml-1.5 font-medium text-stone-500">
                          · margem {margin}%
                        </span>
                      )}
                    </p>
                  </div>
                )}

                <div className="mt-auto grid grid-cols-2 gap-1.5 border-t border-stone-100 pt-2.5">
                  <button
                    type="button"
                    onClick={() => setEditingProduct(product)}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-700 hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(product.id)}
                    disabled={deletingId === product.id}
                    className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  >
                    {deletingId === product.id ? "Excluindo…" : "Excluir"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <ProductFormModal
        open={editingProduct !== null}
        onClose={() => setEditingProduct(null)}
        onSuccess={onRefresh}
        initialData={
          editingProduct ? mapProductToFormData(editingProduct) : undefined
        }
      />
    </>
  );
}
