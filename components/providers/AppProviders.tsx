"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { CartProvider } from "@/components/cart/CartProvider";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { FavoritesProvider } from "@/components/favorites/FavoritesProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>
        <FavoritesProvider>
          {children}
          <CartDrawer />
        </FavoritesProvider>
      </CartProvider>
    </AuthProvider>
  );
}
