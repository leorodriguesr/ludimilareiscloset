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
  return v?.quantity ?? 0;
}

export function hasVariantMatrix(piece: ProductPiece): boolean {
  return piece.variants.length > 0;
}

export type PieceSelectionMap = Record<
  string,
  { color: string | null; size: string | null }
>;

/** Cor já selecionada quando há só uma opção (inclui estoque só por tamanho). */
export function emptyPieceSelections(pieces: ProductPiece[]): PieceSelectionMap {
  return Object.fromEntries(
    pieces.map((p) => {
      const color = p.colors.length === 1 ? p.colors[0]!.name : null;
      return [p.id, { color, size: null }];
    })
  );
}

export function pieceShowsColorPicker(piece: ProductPiece): boolean {
  return piece.colors.length > 0 && !isSizeOnlyPiece(piece);
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

/** Exige tamanho/cor quando o produto oferece opções; bloqueia combinação sem estoque. */
export function pieceSelectionsAreComplete(
  pieces: ProductPiece[],
  selections: PieceSelectionMap
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
      qtyForCombination(p, s.color, s.size) === 0
    ) {
      return false;
    }
  }
  return true;
}
