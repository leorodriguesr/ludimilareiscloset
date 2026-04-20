import { CART_STORAGE_KEY } from "@/lib/cart/constants";
import { emptyCart } from "@/lib/cart/pure";
import type { CartState } from "@/lib/cart/types";

function isCartItemRow(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

export function parseStoredCart(raw: string | null): CartState | null {
  if (raw == null || raw === "") return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const itemsRaw = (data as Record<string, unknown>).items;
    if (!Array.isArray(itemsRaw)) return null;

    const items: CartState["items"] = [];
    for (const row of itemsRaw) {
      if (!isCartItemRow(row)) continue;
      const productId =
        typeof row.productId === "string" ? row.productId.trim() : "";
      if (!productId) continue;
      const name = typeof row.name === "string" ? row.name : "";
      const price = Number(row.price);
      const quantity = Number(row.quantity);
      const image = typeof row.image === "string" ? row.image : "";
      if (!Number.isFinite(price) || price < 0) continue;
      if (!Number.isFinite(quantity) || quantity < 1) continue;
      items.push({
        productId,
        name: name || "Produto",
        price,
        quantity: Math.min(99_999, Math.floor(quantity)),
        image,
      });
    }
    return { items };
  } catch {
    return null;
  }
}

export function serializeCart(state: CartState): string {
  return JSON.stringify(state);
}

export function readCartFromLocalStorage(): CartState {
  if (typeof window === "undefined") return emptyCart();
  try {
    const parsed = parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY));
    return parsed ?? emptyCart();
  } catch {
    return emptyCart();
  }
}

export function writeCartToLocalStorage(state: CartState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(state));
  } catch {
    /* quota / private mode */
  }
}
