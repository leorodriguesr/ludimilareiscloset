import type {
  AddToCartInput,
  CartItem,
  CartPieceSelection,
  CartState,
} from "@/lib/cart/types";

export function emptyCart(): CartState {
  return { items: [] };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Chave estável para fundir linhas iguais e identificar linha no carrinho. */
export function cartLineKey(
  productId: string,
  pieceSelections: CartPieceSelection[] | undefined
): string {
  const rows = pieceSelections ?? [];
  const norm = rows.map((p) => ({
    n: p.pieceName,
    s: p.size,
    c: p.color,
  }));
  return `${productId}\0${JSON.stringify(norm)}`;
}

export function cartItemCount(state: CartState): number {
  return state.items.reduce((acc, i) => acc + i.quantity, 0);
}

export function cartSubtotal(state: CartState): number {
  return state.items.reduce((acc, i) => acc + i.price * i.quantity, 0);
}

/** Total se todas as linhas forem pagas no Pix (usa `pixPrice` quando existir; senão o preço de cartão). */
export function cartSubtotalPix(state: CartState): number {
  return state.items.reduce((acc, i) => {
    const px = normalizeCartPixPrice(i.pixPrice);
    const unit = px != null ? px : i.price;
    return acc + unit * i.quantity;
  }, 0);
}

function normalizeCartPixPrice(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeCartInstallmentCount(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > 24) return null;
  return n;
}

function applyPricingToItem(item: CartItem, input: AddToCartInput): CartItem {
  const next: CartItem = { ...item };
  /** `undefined` = não alterar (ex.: merge parcial); `null` ou número = aplicar. */
  if (input.pixPrice !== undefined) {
    const px = normalizeCartPixPrice(input.pixPrice);
    if (px != null) next.pixPrice = px;
    else delete next.pixPrice;
  }
  if (input.installmentCount !== undefined) {
    const ic = normalizeCartInstallmentCount(input.installmentCount);
    if (ic != null) next.installmentCount = ic;
    else delete next.installmentCount;
  }
  return next;
}

export function addOrMergeItem(
  state: CartState,
  input: AddToCartInput
): CartState {
  const qty = clampInt(input.quantity ?? 1, 1, 99_999);
  const lineId = cartLineKey(input.productId, input.pieceSelections);
  const idx = state.items.findIndex((i) => i.lineId === lineId);
  if (idx === -1) {
    const row = applyPricingToItem(
      {
        lineId,
        productId: input.productId,
        name: input.name,
        price: input.price,
        image: input.image,
        quantity: qty,
        ...(input.pieceSelections?.length
          ? { pieceSelections: input.pieceSelections }
          : {}),
      },
      input
    );
    return { items: [...state.items, row] };
  }
  const next = [...state.items];
  const cur = next[idx]!;
  next[idx] = applyPricingToItem(
    {
      ...cur,
      name: input.name,
      price: input.price,
      image: input.image,
      quantity: clampInt(cur.quantity + qty, 1, 99_999),
      ...(input.pieceSelections?.length
        ? { pieceSelections: input.pieceSelections }
        : {}),
    },
    input
  );
  return { items: next };
}

export function setLineQuantity(
  state: CartState,
  lineId: string,
  quantity: number
): CartState {
  const q = clampInt(quantity, 0, 99_999);
  if (q <= 0) {
    return { items: state.items.filter((i) => i.lineId !== lineId) };
  }
  const idx = state.items.findIndex((i) => i.lineId === lineId);
  if (idx === -1) return state;
  const next = [...state.items];
  next[idx] = { ...next[idx]!, quantity: q };
  return { items: next };
}

export function removeLine(state: CartState, lineId: string): CartState {
  return { items: state.items.filter((i) => i.lineId !== lineId) };
}

export function clearCart(_state: CartState): CartState {
  return emptyCart();
}
