"use client";

import { useCart } from "@/components/cart/CartProvider";

export function CartHeaderLink() {
  const { itemCount, hydrated, openCart } = useCart();
  const showBadge = hydrated && itemCount > 0;

  return (
    <button
      type="button"
      onClick={openCart}
      className="relative flex items-center justify-center rounded-full p-2 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
      aria-label={
        showBadge
          ? `Abrir carrinho com ${itemCount} item(ns)`
          : "Abrir carrinho de compras"
      }
    >
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l-1 12H6L5 9z"
        />
      </svg>
      {showBadge && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-stone-900 px-1 text-[10px] font-semibold text-white">
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </button>
  );
}
