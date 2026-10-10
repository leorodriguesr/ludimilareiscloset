"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatPrice } from "@/lib/format";
import { colorSwatchStyle } from "@/lib/color-swatch";
import {
  isSizeOnlyColorName,
  isSizeOnlyPiece,
} from "@/lib/piece-size-only-color";
import { installmentValueEqualParts } from "@/lib/product-pricing";
import { isProductVisibleOnSite, type Product } from "@/lib/types";
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

function stockCellLabel(quantity: number, unlimited: boolean | undefined): string {
  if (unlimited) return "∞";
  return String(quantity);
}

function ProductCardGallery({
  images,
  alt,
  children,
}: {
  images: { url: string }[];
  alt: string;
  children?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const current = count === 0 ? 0 : ((index % count) + count) % count;
  const url = images[current]?.url;

  function step(delta: number) {
    setIndex((value) => value + delta);
  }

  return (
    <div className="relative w-40 shrink-0 self-stretch overflow-hidden bg-stone-100 sm:w-44">
      {url ? (
        <img
          src={url}
          alt={alt}
          className="h-full min-h-[9.5rem] w-full object-cover"
        />
      ) : (
        <div className="flex h-full min-h-[9.5rem] items-center justify-center px-1 text-center text-[9px] font-medium leading-tight text-stone-400">
          Sem foto
        </div>
      )}
      {children}
      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={() => step(-1)}
            className="absolute left-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-800 shadow-sm ring-1 ring-stone-200/80 transition hover:bg-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.25} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            onClick={() => step(1)}
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-800 shadow-sm ring-1 ring-stone-200/80 transition hover:bg-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.25} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </>
      ) : null}
    </div>
  );
}

function ProductStockTables({ product }: { product: Product }) {
  const pieces = product.pieces.filter(
    (piece) => piece.sizes.length > 0 && piece.variants.length > 0
  );
  if (pieces.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <p className="border-b border-stone-100 bg-stone-50 px-3 py-2 text-[11px] font-semibold text-stone-800">
          Quantidade em estoque (cor × tamanho)
        </p>
        <p className="px-3 py-2.5 text-[11px] text-stone-400">Sem grade cadastrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pieces.map((piece) => {
        const sizeOnly = isSizeOnlyPiece(piece);
        const colors = piece.colors.filter((color) => !isSizeOnlyColorName(color.name));
        return (
          <div
            key={piece.id}
            className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
          >
            <p className="border-b border-stone-100 bg-stone-50 px-3 py-2 text-[11px] font-semibold text-stone-800">
            {pieces.length > 1 ? `${piece.name} · ` : ""}
              {sizeOnly
                ? "Estoque por tamanho"
                : "Estoque (cor × tamanho)"}
            </p>
            <div className="stock-table-scroll overflow-x-auto">
            {sizeOnly ? (
              <table className="w-full min-w-max border-collapse whitespace-nowrap text-center text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-stone-100 bg-stone-50 p-1.5 font-medium text-stone-500">
                      Tamanho
                    </th>
                    <th className="whitespace-nowrap border-b border-stone-100 p-1.5 font-medium text-stone-800">Qtd.</th>
                  </tr>
                </thead>
                <tbody>
                  {piece.sizes.map((size) => {
                    const cell = piece.variants.find(
                      (variant) =>
                        isSizeOnlyColorName(variant.color.name) &&
                        variant.size.name === size.name
                    );
                    return (
                      <tr key={size.id}>
                        <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-stone-100 bg-stone-50 p-1.5 font-medium text-stone-800">
                          {size.name}
                        </th>
                        <td className="whitespace-nowrap border-b border-stone-50 p-1.5 font-semibold tabular-nums text-stone-900">
                          {stockCellLabel(cell?.quantity ?? 0, cell?.unlimited)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-max border-collapse whitespace-nowrap text-center text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-stone-100 bg-stone-50 p-1.5 font-medium text-stone-500">
                      Tam / Cor
                    </th>
                    {colors.map((color) => (
                      <th key={color.id} className="whitespace-nowrap border-b border-stone-100 p-1.5 font-medium text-stone-800">
                        <span className="inline-flex flex-col items-center gap-1 whitespace-nowrap">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full border border-stone-200"
                            style={colorSwatchStyle(color.hex)}
                          />
                          {color.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {piece.sizes.map((size) => (
                    <tr key={size.id}>
                      <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-stone-100 bg-stone-50 p-1.5 font-medium text-stone-800">
                        {size.name}
                      </th>
                      {colors.map((color) => {
                        const cell = piece.variants.find(
                          (variant) =>
                            variant.color.name === color.name &&
                            variant.size.name === size.name
                        );
                        return (
                          <td
                            key={color.id}
                            className="whitespace-nowrap border-b border-stone-50 p-1.5 font-semibold tabular-nums text-stone-900"
                          >
                            {stockCellLabel(cell?.quantity ?? 0, cell?.unlimited)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProductList({
  products,
  onRefresh,
  emptyKind = "catalog",
  searchQuery = "",
}: ProductListProps) {
  const { isAdmin } = useAuth();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const list = Array.isArray(products) ? products : [];

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        window.alert(data.error ?? "Não foi possível excluir o produto.");
        return;
      }
      onRefresh();
    } catch {
      window.alert("Erro de conexão ao excluir o produto.");
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
      <style>{`
        .stock-table-scroll {
          scrollbar-width: thin;
          scrollbar-color: #a8a29e #f5f5f4;
        }
        .stock-table-scroll::-webkit-scrollbar {
          height: 8px;
          -webkit-appearance: none;
        }
        .stock-table-scroll::-webkit-scrollbar-thumb {
          background: #a8a29e;
          border-radius: 999px;
        }
        .stock-table-scroll::-webkit-scrollbar-track {
          background: #f5f5f4;
        }
      `}</style>
      <div className="grid gap-8 sm:grid-cols-2">
        {list.map((product) => {
          const categories = product.categories.map((pc) => pc.category.name);
          const sections = (product.sections ?? []).map((ps) => ps.section.name);
          return (
            <article
              key={product.id}
              className="flex overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <ProductCardGallery images={product.images} alt={product.name}>
                <div className="absolute left-1.5 top-1.5 flex max-w-[calc(100%-0.75rem)] flex-col gap-1">
                  {!isProductVisibleOnSite(product.visibleOnSite) ? (
                    <span className="truncate rounded-md bg-amber-500/95 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">
                      Oculto no site
                    </span>
                  ) : null}
                  {product.tag ? (
                    <span className="truncate rounded-md bg-stone-900/90 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">
                      {product.tag}
                    </span>
                  ) : null}
                </div>
              </ProductCardGallery>

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

                <ProductStockTables product={product} />

                <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
                  <p className="border-b border-stone-100 bg-stone-50 px-3 py-2 text-[11px] font-semibold text-stone-800">
                    Tecido
                  </p>
                  <p className="px-3 py-2.5 text-[11px] text-stone-700">
                    {product.fabric?.trim() || "Não informado"}
                  </p>
                </div>

                <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
                  <p className="border-b border-stone-100 bg-stone-50 px-3 py-2 text-[11px] font-semibold text-stone-800">
                    Pode vender sem estoque?
                  </p>
                  <p className="px-3 py-2.5 text-[11px] text-stone-700">
                    {product.allowBackorder ? "Sim" : "Não"}
                  </p>
                </div>

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

                {isAdmin && (
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
                )}
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
