"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { useCart } from "@/components/cart/CartProvider";
type Props = {
  productId: string;
  name: string;
  price: number;
  imageUrl: string;
  quantity: number;
  maxQty: number;
  onQuantityChange: (next: number) => void;
};

export function ProductPurchaseActions({
  productId,
  name,
  price,
  imageUrl,
  quantity,
  maxQty,
  onQuantityChange,
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

  const addToCart = useCallback(() => {
    if (!available) return;
    addItem({
      productId,
      name,
      price,
      image: imageUrl,
      quantity: safeQty,
    });
    showToast("Adicionado ao carrinho");
  }, [
    available,
    addItem,
    productId,
    name,
    price,
    imageUrl,
    safeQty,
    showToast,
  ]);

  const buyNow = useCallback(() => {
    if (!available) return;
    flushSync(() => {
      addItem({
        productId,
        name,
        price,
        image: imageUrl,
        quantity: safeQty,
      });
    });
    router.push("/checkout");
  }, [
    available,
    addItem,
    productId,
    name,
    price,
    imageUrl,
    safeQty,
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
            disabled={!available}
            onClick={addToCart}
            className="min-w-0 flex-1 rounded-full border-2 border-stone-900 bg-white px-4 py-3 text-sm font-semibold text-stone-900 hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-40 sm:min-w-[10rem] sm:px-5"
          >
            Adicionar ao carrinho
          </button>
          <button
            type="button"
            disabled={!available}
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
