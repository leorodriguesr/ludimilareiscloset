"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { describeCartPieceSelection } from "@/lib/cart/format-piece-selections";
import type { CartItem } from "@/lib/cart/types";
import { formatPrice } from "@/lib/format";
import { installmentValueEqualParts } from "@/lib/product-pricing";

const DRAWER_MS = 300;

function IconCard({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
      />
    </svg>
  );
}

function cartLineCardInstallment(item: CartItem): {
  parts: number;
  each: number;
} | null {
  const raw = item.installmentCount;
  if (raw == null || !Number.isFinite(raw)) return null;
  const parts = Math.floor(raw);
  if (parts < 1 || parts > 24) return null;
  const lineTotal = item.price * item.quantity;
  return { parts, each: installmentValueEqualParts(lineTotal, parts) };
}

function cartLinePixTotal(item: CartItem): number | null {
  const px = item.pixPrice;
  if (px != null && Number.isFinite(px) && px > 0) return px * item.quantity;
  return null;
}

export function CartDrawer() {
  const router = useRouter();
  const {
    items,
    hydrated,
    subtotal,
    subtotalPix,
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
        className={`absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 ease-out motion-reduce:transition-none ${entered ? "opacity-100" : "opacity-0"
          }`}
        aria-label="Fechar carrinho"
        onClick={closeCart}
      />
      <aside
        className={`absolute top-0 right-0 flex h-full w-full max-w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none sm:max-w-md sm:border-l sm:border-stone-200 ${entered ? "translate-x-0" : "translate-x-full"
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
              {items.map((item) => {
                const lineCardTotal = item.price * item.quantity;
                const cardInst = cartLineCardInstallment(item);
                const linePixTotal = cartLinePixTotal(item);
                return (
                  <li key={item.lineId} className="flex gap-3 py-4 first:pt-0">
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
                      {/* <p className="mt-0.5 text-xs text-stone-500 tabular-nums">
                      {formatPrice(item.price)} cada
                    </p> */}
                      {item.pieceSelections && item.pieceSelections.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {item.pieceSelections.map((row, idx) => {
                            const detail = describeCartPieceSelection(row);
                            if (!detail) return null;
                            return (
                              <li
                                key={`${row.pieceName}-${idx}`}
                                className="text-xs text-stone-600"
                              >
                                {item.pieceSelections!.length > 1 ? (
                                  <>
                                    <span className="font-medium text-stone-700">
                                      {row.pieceName}:{" "}
                                    </span>
                                    {detail}
                                  </>
                                ) : (
                                  detail
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center rounded-md border border-stone-200 text-sm">
                          <button
                            type="button"
                            className="px-2.5 py-1 text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                            aria-label="Diminuir"
                            disabled={item.quantity <= 1}
                            onClick={() =>
                              setQuantity(item.lineId, item.quantity - 1)
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
                              setQuantity(item.lineId, item.quantity + 1)
                            }
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className="text-xs font-medium text-red-700 hover:underline"
                          onClick={() => removeItem(item.lineId)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                    <div
                      className="flex shrink-0 flex-col items-end gap-3 text-right"
                      role="group"
                      aria-label="Valores no cartão e no Pix"
                    >
                      {linePixTotal != null ? (
                        <div className="flex items-start gap-2">
                          <Image
                            src="/pix-icon.svg"
                            alt=""
                            width={16}
                            height={16}
                            unoptimized
                            className="mt-0.5 h-4 w-4 shrink-0 object-contain"
                          />
                          <div>
                            <p className="sr-only">Pix</p>
                            <p className="text-sm font-semibold tabular-nums text-stone-900">
                              {formatPrice(linePixTotal)}
                            </p>
                            <p className="text-xs text-stone-500">À vista</p>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex items-start gap-1">
                        <IconCard className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
                        <div>
                          <p className="sr-only">Cartão</p>
                          <p className="text-sm font-semibold tabular-nums text-stone-900">
                            {formatPrice(lineCardTotal)}
                          </p>
                          {cardInst ? (
                            <p className="text-xs tabular-nums text-stone-500">
                              {cardInst.parts} × {formatPrice(cardInst.each)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {hydrated && items.length > 0 && (
          <div className="border-t border-stone-200 bg-stone-50 px-4 py-4 space-y-3">
            <div className="space-y-2 text-sm">

              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-stone-600">
                  <Image
                    src="/pix-icon.svg"
                    alt=""
                    width={16}
                    height={16}
                    unoptimized
                    className="h-4 w-4 shrink-0 object-contain"
                  />
                  Subtotal Pix
                </span>
                <span className="font-semibold tabular-nums text-emerald-700">
                  {formatPrice(subtotalPix)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-stone-600">
                  <IconCard className="h-4 w-4 shrink-0 text-stone-500" />
                  Subtotal cartão
                </span>
                <span className="font-semibold text-stone-900 tabular-nums">
                  {formatPrice(subtotal)}
                </span>
              </div>
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
