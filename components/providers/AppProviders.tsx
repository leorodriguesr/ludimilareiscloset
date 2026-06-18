"use client";

import type { ReactNode } from "react";
import { CartProvider } from "@/components/cart/CartProvider";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { FavoritesProvider } from "@/components/favorites/FavoritesProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      <FavoritesProvider>
        {children}
        <CartDrawer />
      </FavoritesProvider>
    </CartProvider>
  );
}
