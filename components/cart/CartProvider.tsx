"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CART_STORAGE_KEY } from "@/lib/cart/constants";
import {
  addOrMergeItem,
  cartItemCount,
  cartSubtotal,
  cartSubtotalPix,
  emptyCart,
  removeLine,
  setLineQuantity,
} from "@/lib/cart/pure";
import {
  parseStoredCart,
  readCartFromLocalStorage,
  writeCartToLocalStorage,
} from "@/lib/cart/storage";
import type { AddToCartInput, CartState } from "@/lib/cart/types";

export type CartContextValue = {
  items: CartState["items"];
  /** `false` até hidratar a partir do localStorage. */
  hydrated: boolean;
  itemCount: number;
  /** Soma dos preços de cartão (parcelado) × quantidade. */
  subtotal: number;
  /** Soma dos valores à vista no Pix por linha (sem Pix na linha = preço de cartão). */
  subtotalPix: number;
  drawerOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addItem: (input: AddToCartInput) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(() => emptyCart());
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const loadedRef = useRef(false);

  useLayoutEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setState(readCartFromLocalStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeCartToLocalStorage(state);
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CART_STORAGE_KEY || e.newValue == null) return;
      const parsed = parseStoredCart(e.newValue);
      if (parsed) setState(parsed);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hydrated]);

  const persistNow = useCallback((next: CartState) => {
    if (typeof window !== "undefined" && hydrated) {
      writeCartToLocalStorage(next);
    }
  }, [hydrated]);

  const addItem = useCallback(
    (input: AddToCartInput) => {
      setState((s) => {
        const next = addOrMergeItem(s, input);
        persistNow(next);
        return next;
      });
    },
    [persistNow]
  );

  const setQuantity = useCallback(
    (lineId: string, quantity: number) => {
      setState((s) => {
        const next = setLineQuantity(s, lineId, quantity);
        persistNow(next);
        return next;
      });
    },
    [persistNow]
  );

  const removeItem = useCallback(
    (lineId: string) => {
      setState((s) => {
        const next = removeLine(s, lineId);
        persistNow(next);
        return next;
      });
    },
    [persistNow]
  );

  const clear = useCallback(() => {
    setState(() => {
      const next = emptyCart();
      persistNow(next);
      return next;
    });
  }, [persistNow]);

  const openCart = useCallback(() => setDrawerOpen(true), []);
  const closeCart = useCallback(() => setDrawerOpen(false), []);
  const toggleCart = useCallback(() => setDrawerOpen((o) => !o), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items: state.items,
      hydrated,
      itemCount: cartItemCount(state),
      subtotal: cartSubtotal(state),
      subtotalPix: cartSubtotalPix(state),
      drawerOpen,
      openCart,
      closeCart,
      toggleCart,
      addItem,
      setQuantity,
      removeItem,
      clear,
    }),
    [
      state,
      hydrated,
      drawerOpen,
      openCart,
      closeCart,
      toggleCart,
      addItem,
      setQuantity,
      removeItem,
      clear,
    ]
  );

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart deve ser usado dentro de CartProvider.");
  }
  return ctx;
}
