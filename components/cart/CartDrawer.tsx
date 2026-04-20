"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { formatPrice } from "@/lib/format";

const DRAWER_MS = 300;

export function CartDrawer() {
  const router = useRouter();
  const {
    items,
    hydrated,
    subtotal,
    setQuantity,
    removeItem,
    drawerOpen,
    closeCart,
  } = useCart();

  /** Mantém o DOM durante a animação de fechamento. */
  const [mounted, setMounted] = useState(false);
  /** Estado “aberto” para CSS (slide + fade). */
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (drawerOpen) {
      setMounted(true);
      setEntered(false);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        if (inner) cancelAnimationFrame(inner);
      };
    }

    setEntered(false);
    const t = window.setTimeout(() => setMounted(false), DRAWER_MS);
    return () => clearTimeout(t);
  }, [drawerOpen]);

  const onCheckout = useCallback(() => {
    closeCart();
    router.push("/checkout");
  }, [closeCart, router]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, closeCart]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        className={`absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 ease-out motion-reduce:transition-none ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Fechar carrinho"
        onClick={closeCart}
      />
      <aside
        className={`absolute top-0 right-0 flex h-full w-full max-w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none sm:max-w-md sm:border-l sm:border-stone-200 ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-4">
          <h2
            id="cart-drawer-title"
            className="text-lg font-semibold text-stone-900"
          >
            Carrinho
          </h2>
          <button
            type="button"
            className="rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label="Fechar"
            onClick={closeCart}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!hydrated ? (
            <p className="text-sm text-stone-500">Carregando…</p>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-stone-600">Seu carrinho está vazio.</p>
              <button
                type="button"
                onClick={closeCart}
                className="mt-6 inline-block rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
              >
                Continuar comprando
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-stone-200">
              {items.map((item) => (
                <li key={item.productId} className="flex gap-3 py-4 first:pt-0">
                  <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-md bg-stone-100">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[9px] text-stone-400 px-0.5 text-center">
                        Sem foto
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/products/${item.productId}`}
                      onClick={closeCart}
                      className="text-sm font-medium text-stone-900 hover:underline line-clamp-2"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-stone-500 tabular-nums">
                      {formatPrice(item.price)} cada
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center rounded-md border border-stone-200 text-sm">
                        <button
                          type="button"
                          className="px-2.5 py-1 text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                          aria-label="Diminuir"
                          disabled={item.quantity <= 1}
                          onClick={() =>
                            setQuantity(item.productId, item.quantity - 1)
                          }
                        >
                          −
                        </button>
                        <span className="min-w-[1.75rem] text-center tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="px-2.5 py-1 text-stone-700 hover:bg-stone-50"
                          aria-label="Aumentar"
                          onClick={() =>
                            setQuantity(item.productId, item.quantity + 1)
                          }
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-medium text-red-700 hover:underline"
                        onClick={() => removeItem(item.productId)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-stone-900 tabular-nums">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {hydrated && items.length > 0 && (
          <div className="border-t border-stone-200 bg-stone-50 px-4 py-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-stone-600">Subtotal</span>
              <span className="font-semibold text-stone-900 tabular-nums">
                {formatPrice(subtotal)}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={closeCart}
                className="w-full rounded-full border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-800 hover:bg-stone-100 transition-colors"
              >
                Continuar comprando
              </button>
              <button
                type="button"
                onClick={onCheckout}
                className="w-full rounded-full bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
              >
                Finalizar compra
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
