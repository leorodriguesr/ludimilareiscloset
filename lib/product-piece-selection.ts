import type { CartPieceSelection } from "@/lib/cart/types";
import { isSizeOnlyPiece } from "@/lib/piece-size-only-color";
import type { ProductPiece } from "@/lib/types";

export function qtyForCombination(
  piece: ProductPiece,
  colorName: string,
  sizeName: string
): number {
  const v = piece.variants.find(
    (x) => x.color.name === colorName && x.size.name === sizeName
  );
  if (v?.unlimited) return Number.POSITIVE_INFINITY;
  return v?.quantity ?? 0;
}

export function hasVariantMatrix(piece: ProductPiece): boolean {
  return piece.variants.length > 0;
}

export type PieceSelectionMap = Record<
  string,
  { color: string | null; size: string | null }
>;

/**
 * Estado inicial das seleções.
 * Cor só vem pré-marcada em estoque só por tamanho ("Único") ou quando não há tamanhos.
 * Com tamanho + cores, o cliente escolhe o tamanho primeiro.
 */
export function emptyPieceSelections(pieces: ProductPiece[]): PieceSelectionMap {
  return Object.fromEntries(
    pieces.map((p) => {
      const color =
        p.colors.length === 1 &&
        (isSizeOnlyPiece(p) || p.sizes.length === 0)
          ? p.colors[0]!.name
          : null;
      return [p.id, { color, size: null }];
    })
  );
}

export function pieceShowsColorPicker(piece: ProductPiece): boolean {
  return piece.colors.length > 0 && !isSizeOnlyPiece(piece);
}

/** Teto da quantidade na vitrine quando a combinação não tem estoque finito. */
export const OPEN_PURCHASE_QTY = 99;

type StockPiece = {
  id: string;
  name?: string;
  variants: Array<{
    quantity: number;
    unlimited?: boolean;
    color: { name: string };
    size: { name: string };
  }>;
};

/** Quantidade máxima comprável da seleção atual. Combinação ilimitada não usa a soma do produto. */
export function maxPurchasableQuantity(input: {
  stockType?: string | null;
  stockQuantity?: number | null;
  allowBackorder?: boolean;
  pieces?: StockPiece[];
  selections?: PieceSelectionMap;
  cartSelections?: CartPieceSelection[];
}): number {
  if (input.allowBackorder) return OPEN_PURCHASE_QTY;
  const pieces = (input.pieces ?? []).filter((piece) => piece.variants.length > 0);
  if (pieces.length === 0) {
    if (input.stockType === "LIMITED") {
      return Math.max(0, input.stockQuantity ?? 0);
    }
    return Number.POSITIVE_INFINITY;
  }

  const selectedLimits: number[] = [];
  let selected = false;
  for (const piece of pieces) {
    const fromMap = input.selections?.[piece.id];
    const fromCart = piece.name
      ? input.cartSelections?.find((row) => row.pieceName === piece.name)
      : undefined;
    const color = fromMap?.color ?? fromCart?.color ?? null;
    const size = fromMap?.size ?? fromCart?.size ?? null;
    if (!color || !size) continue;
    selected = true;
    const variant = piece.variants.find(
      (row) => row.color.name === color && row.size.name === size
    );
    if (!variant) return 0;
    if (variant.unlimited) continue;
    selectedLimits.push(Math.max(0, variant.quantity));
  }

  if (!selected) {
    if (pieces.some((piece) => piece.variants.some((row) => row.unlimited))) {
      return Number.POSITIVE_INFINITY;
    }
    const quantities = pieces.flatMap((piece) =>
      piece.variants.map((row) => row.quantity)
    );
    return quantities.length > 0 ? Math.max(...quantities) : 0;
  }

  if (selectedLimits.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...selectedLimits);
}

export function buildCartPieceSelections(
  pieces: ProductPiece[],
  selections: PieceSelectionMap
): CartPieceSelection[] {
  return pieces.map((p) => ({
    pieceName: p.name,
    size: selections[p.id]?.size ?? null,
    color: selections[p.id]?.color ?? null,
  }));
}

/** Hidrata o mapa de seleções a partir do snapshot salvo no pedido. */
export function pieceSelectionMapFromCart(
  pieces: ProductPiece[],
  cartSelections: CartPieceSelection[]
): PieceSelectionMap {
  const base = emptyPieceSelections(pieces);
  for (const piece of pieces) {
    const match = cartSelections.find((s) => s.pieceName === piece.name);
    if (!match) continue;
    base[piece.id] = {
      color: match.color,
      size: match.size,
    };
  }
  return base;
}

/** Exige tamanho/cor quando o produto oferece opções; bloqueia combinação sem estoque. */
export function pieceSelectionsAreComplete(
  pieces: ProductPiece[],
  selections: PieceSelectionMap,
  allowBackorder = false
): boolean {
  for (const p of pieces) {
    const s = selections[p.id];
    if (!s) return false;
    if (p.sizes.length > 0 && !s.size) return false;
    if (pieceShowsColorPicker(p) && !s.color) return false;
    // Estoque só por tamanho: cor interna "Único" pode vir pré-selecionada
    if (isSizeOnlyPiece(p) && !s.color) return false;
    if (
      hasVariantMatrix(p) &&
      s.color &&
      s.size &&
      qtyForCombination(p, s.color, s.size) === 0 &&
      !allowBackorder
    ) {
      return false;
    }
  }
  return true;
}
