import type { AddToCartInput, CartItem, CartState } from "@/lib/cart/types";

export function emptyCart(): CartState {
  return { items: [] };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function cartItemCount(state: CartState): number {
  return state.items.reduce((acc, i) => acc + i.quantity, 0);
}

export function cartSubtotal(state: CartState): number {
  return state.items.reduce((acc, i) => acc + i.price * i.quantity, 0);
}

export function addOrMergeItem(
  state: CartState,
  input: AddToCartInput
): CartState {
  const qty = clampInt(input.quantity ?? 1, 1, 99_999);
  const idx = state.items.findIndex((i) => i.productId === input.productId);
  if (idx === -1) {
    const row: CartItem = {
      productId: input.productId,
      name: input.name,
      price: input.price,
      image: input.image,
      quantity: qty,
    };
    return { items: [...state.items, row] };
  }
  const next = [...state.items];
  const cur = next[idx]!;
  next[idx] = {
    ...cur,
    name: input.name,
    price: input.price,
    image: input.image,
    quantity: clampInt(cur.quantity + qty, 1, 99_999),
  };
  return { items: next };
}

export function setLineQuantity(
  state: CartState,
  productId: string,
  quantity: number
): CartState {
  const q = clampInt(quantity, 0, 99_999);
  if (q <= 0) {
    return { items: state.items.filter((i) => i.productId !== productId) };
  }
  const idx = state.items.findIndex((i) => i.productId === productId);
  if (idx === -1) return state;
  const next = [...state.items];
  next[idx] = { ...next[idx]!, quantity: q };
  return { items: next };
}

export function removeLine(state: CartState, productId: string): CartState {
  return { items: state.items.filter((i) => i.productId !== productId) };
}

export function clearCart(_state: CartState): CartState {
  return emptyCart();
}
