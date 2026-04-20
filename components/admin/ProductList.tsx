"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { ProductForm } from "./ProductForm";

interface ProductListProps {
  products: Product[];
  onRefresh: () => void;
}

export function ProductList({ products, onRefresh }: ProductListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
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
    return (
      <p className="text-center text-stone-500 py-8">
        Nenhum produto cadastrado.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {list.map((product) => {
        const coverImage = product.images[0]?.url;
        const catNames = product.categories
          .map((pc) => pc.category.name)
          .join(", ");

        return (
          <div
            key={product.id}
            className="rounded-lg border border-stone-200 bg-white p-4"
          >
            {editingId === product.id ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-medium text-stone-900">
                    Editando produto
                  </h4>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
                <ProductForm
                  initialData={{
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    costPrice: product.costPrice,
                    description: product.description ?? "",
                    tag: product.tag ?? "",
                    videoUrl: product.videoUrl,
                    stockType: product.stockType,
                    stockQuantity: product.stockQuantity,
                    weightGrams: product.weightGrams,
                    lengthCm: product.lengthCm,
                    widthCm: product.widthCm,
                    heightCm: product.heightCm,
                    images: product.images.map((img) => ({ url: img.url })),
                    pieces: product.pieces.map((p) => ({
                      name: p.name,
                      colors: p.colors.map((c) => ({
                        name: c.name,
                        hex: c.hex ?? "",
                      })),
                      sizes: p.sizes.map((s) => ({ name: s.name })),
                      variants: (p.variants ?? []).map((v) => ({
                        colorName: v.color.name,
                        sizeName: v.size.name,
                        quantity: String(v.quantity),
                      })),
                    })),
                    categoryIds: product.categories.map((pc) => pc.categoryId),
                  }}
                  onSuccess={() => {
                    setEditingId(null);
                    onRefresh();
                  }}
                />
              </div>
            ) : (
              <div className="flex gap-4">
                <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-stone-100">
                  {coverImage ? (
                    <img
                      src={coverImage}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-stone-400 text-xs">
                      Sem foto
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between min-w-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-stone-900 truncate">
                        {product.name}
                      </h4>
                      {product.tag && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full flex-shrink-0">
                          {product.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-stone-700 mt-0.5">
                      {formatPrice(product.price)}
                      {product.costPrice != null && (
                        <span className="ml-2 text-xs font-normal text-stone-500">
                          custo {formatPrice(product.costPrice)}
                        </span>
                      )}
                    </p>
                    {catNames && (
                      <p className="text-xs text-stone-500 mt-0.5">{catNames}</p>
                    )}
                    <p className="text-xs text-stone-400 mt-0.5">
                      {product.images.length}{" "}
                      {product.images.length === 1 ? "foto" : "fotos"}
                      {product.pieces.length > 0 &&
                        ` · ${product.pieces.length} ${product.pieces.length === 1 ? "peça" : "peças"}`}
                      {product.stockType === "LIMITED"
                        ? ` · estoque: ${product.stockQuantity ?? 0}`
                        : " · estoque ilimitado"}
                    </p>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={() => setEditingId(product.id)}
                      className="text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      disabled={deletingId === product.id}
                      className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
                    >
                      {deletingId === product.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
