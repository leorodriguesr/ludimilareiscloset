"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { useCart } from "@/components/cart/CartProvider";
import {
  buildCartPieceSelections,
  type PieceSelectionMap,
} from "@/lib/product-piece-selection";
import type { ProductPiece } from "@/lib/types";

type Props = {
  productId: string;
  name: string;
  price: number;
  pixPrice?: number | null;
  installmentCount?: number | null;
  imageUrl: string;
  quantity: number;
  maxQty: number;
  onQuantityChange: (next: number) => void;
  pieces?: ProductPiece[];
  selections?: PieceSelectionMap;
  /** false quando há opções obrigatórias não preenchidas. */
  canPurchase?: boolean;
};

export function ProductPurchaseActions({
  productId,
  name,
  price,
  pixPrice,
  installmentCount,
  imageUrl,
  quantity,
  maxQty,
  onQuantityChange,
  pieces,
  selections,
  canPurchase = true,
}: Props) {
  const router = useRouter();
  const { addItem } = useCart();

  const [toast, setToast] = useState<string | null>(null);

  const available = maxQty > 0;
  const safeQty = quantity;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const pieceSelections =
    pieces?.length && selections
      ? buildCartPieceSelections(pieces, selections)
      : undefined;

  const addToCart = useCallback(() => {
    if (!available || !canPurchase) return;
    addItem({
      productId,
      name,
      price,
      pixPrice: pixPrice ?? null,
      installmentCount: installmentCount ?? null,
      image: imageUrl,
      quantity: safeQty,
      ...(pieceSelections?.length ? { pieceSelections } : {}),
    });
    showToast("Adicionado ao carrinho");
  }, [
    available,
    canPurchase,
    addItem,
    productId,
    name,
    price,
    imageUrl,
    safeQty,
    pieceSelections,
    pixPrice,
    installmentCount,
    showToast,
  ]);

  const buyNow = useCallback(() => {
    if (!available || !canPurchase) return;
    flushSync(() => {
      addItem({
        productId,
        name,
        price,
        pixPrice: pixPrice ?? null,
        installmentCount: installmentCount ?? null,
        image: imageUrl,
        quantity: safeQty,
        ...(pieceSelections?.length ? { pieceSelections } : {}),
      });
    });
    router.push("/checkout");
  }, [
    available,
    canPurchase,
    addItem,
    productId,
    name,
    price,
    imageUrl,
    safeQty,
    pieceSelections,
    pixPrice,
    installmentCount,
    router,
  ]);

  return (
    <>
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-500 mb-2">
            Quantidade
          </p>
          <div className="inline-flex items-center rounded-lg border border-stone-200 bg-white">
            <button
              type="button"
              className="px-4 py-2.5 text-stone-700 hover:bg-stone-50 disabled:opacity-40 min-w-[3rem]"
              disabled={!available || safeQty <= 1}
              aria-label="Diminuir"
              onClick={() =>
                onQuantityChange(Math.max(1, safeQty - 1))
              }
            >
              −
            </button>
            <span className="min-w-[2.5rem] text-center text-sm font-medium tabular-nums">
              {available ? safeQty : 0}
            </span>
            <button
              type="button"
              className="px-4 py-2.5 text-stone-700 hover:bg-stone-50 disabled:opacity-40 min-w-[3rem]"
              disabled={!available || safeQty >= maxQty}
              aria-label="Aumentar"
              onClick={() =>
                onQuantityChange(Math.min(maxQty || 1, safeQty + 1))
              }
            >
              +
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={!available || !canPurchase}
            onClick={addToCart}
            className="min-w-0 flex-1 rounded-full border-2 border-stone-900 bg-white px-4 py-3 text-sm font-semibold text-stone-900 hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-40 sm:min-w-[10rem] sm:px-5"
          >
            Adicionar ao carrinho
          </button>
          <button
            type="button"
            disabled={!available || !canPurchase}
            onClick={buyNow}
            className="min-w-0 flex-1 rounded-full bg-stone-900 px-4 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:pointer-events-none disabled:opacity-40 sm:min-w-[10rem] sm:px-5"
          >
            Comprar agora
          </button>
        </div>

        {!available && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
            Produto indisponível no momento.
          </p>
        )}
        {/* {available && !canPurchase && pieces && pieces.length > 0 && (
          <p className="text-sm text-amber-900 bg-amber-50/90 border border-amber-100 rounded-md px-3 py-2">
            Escolha o tamanho e a cor de cada peça antes de adicionar à sacola.
          </p>
        )} */}
      </div>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[130] -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg"
          role="status"
        >
          {toast}
        </div>
      )}
    </>
  );
}
