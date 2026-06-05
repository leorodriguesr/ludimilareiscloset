import { CART_STORAGE_KEY } from "@/lib/cart/constants";
import { cartLineKey, emptyCart } from "@/lib/cart/pure";
import type {
  CartPieceSelection,
  CartState,
} from "@/lib/cart/types";

function isCartItemRow(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

function parsePieceSelections(
  raw: unknown
): CartPieceSelection[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: CartPieceSelection[] = [];
  for (const row of raw) {
    if (!isCartItemRow(row)) continue;
    const pieceName =
      typeof row.pieceName === "string" ? row.pieceName : "";
    const size =
      typeof row.size === "string"
        ? row.size
        : row.size === null
          ? null
          : null;
    const color =
      typeof row.color === "string"
        ? row.color
        : row.color === null
          ? null
          : null;
    out.push({ pieceName: pieceName || "Peça", size, color });
  }
  return out.length ? out : undefined;
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

      const pieceSelections = parsePieceSelections(row.pieceSelections);
      const lineIdFromStore =
        typeof row.lineId === "string" ? row.lineId.trim() : "";
      const lineId =
        lineIdFromStore ||
        cartLineKey(productId, pieceSelections);

      let pixPrice: number | null = null;
      const pixRaw = row.pixPrice;
      if (pixRaw != null && pixRaw !== "") {
        const p = Number(pixRaw);
        if (Number.isFinite(p) && p > 0) pixPrice = p;
      }

      let installmentCount: number | null = null;
      const icRaw = row.installmentCount;
      if (icRaw != null && icRaw !== "") {
        const n = Math.floor(Number(icRaw));
        if (Number.isFinite(n) && n >= 1 && n <= 24) installmentCount = n;
      }

      items.push({
        lineId,
        productId,
        name: name || "Produto",
        price,
        quantity: Math.min(99_999, Math.floor(quantity)),
        image,
        ...(pixPrice != null ? { pixPrice } : {}),
        ...(installmentCount != null ? { installmentCount } : {}),
        ...(pieceSelections ? { pieceSelections } : {}),
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
