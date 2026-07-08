"use client";

import { useEffect } from "react";
import type { Product } from "@/lib/types";
import { ProductForm } from "./ProductForm";

export interface ProductFormData {
  id?: string;
  name: string;
  price: number;
  installmentCount: number | null;
  pixPrice: number | null;
  costPrice: number | null;
  description: string;
  tag: string;
  videoUrl: string | null;
  stockType: "UNLIMITED" | "LIMITED";
  stockQuantity: number | null;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  images: { url: string; colorName?: string | null }[];
  pieces: {
    name: string;
    colors: { name: string; hex: string }[];
    sizes: { name: string }[];
    variants: { colorName: string; sizeName: string; quantity: string }[];
  }[];
  categoryIds: string[];
  sectionIds: string[];
}

export function mapProductToFormData(product: Product): ProductFormData {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    installmentCount: product.installmentCount,
    pixPrice: product.pixPrice,
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
    images: product.images.map((img) => ({
      url: img.url,
      colorName: img.colorName ?? null,
    })),
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
    sectionIds: (product.sections ?? []).map((ps) => ps.sectionId),
  };
}

interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: ProductFormData;
}

export function ProductFormModal({
  open,
  onClose,
  onSuccess,
  initialData,
}: ProductFormModalProps) {
  const isEditing = Boolean(initialData?.id);
  const title = isEditing ? "Editar produto" : "Novo produto";
  const subtitle = isEditing
    ? initialData?.name || "Atualize as informações do produto"
    : "Preencha os dados para cadastrar na loja";

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-stone-900/50 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white md:m-auto md:h-auto md:max-h-[calc(100dvh-2rem)] md:max-w-3xl md:rounded-2xl md:border md:border-stone-200 md:shadow-2xl lg:max-w-4xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-modal-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 py-4 sm:px-6">
          <div className="min-w-0 pr-3">
            <h2
              id="product-form-modal-title"
              className="truncate text-base font-semibold text-stone-900 sm:text-lg"
            >
              {title}
            </h2>
            <p className="mt-0.5 truncate text-xs text-stone-500 sm:text-sm">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            aria-label="Fechar"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          <ProductForm
            key={initialData?.id ?? "new"}
            initialData={initialData}
            onSuccess={() => {
              onSuccess();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
