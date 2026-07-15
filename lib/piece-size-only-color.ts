/** Cor interna para estoque só por tamanho (DB exige colorId em PieceVariant). */
export const SIZE_ONLY_COLOR_NAME = "Único";
export const SIZE_ONLY_COLOR_HEX = "#E7E5E4";

export function isSizeOnlyColorName(name: string | null | undefined): boolean {
  return (name?.trim() ?? "") === SIZE_ONLY_COLOR_NAME;
}

export function isSizeOnlyPiece(piece: {
  colors: { name: string }[];
}): boolean {
  return (
    piece.colors.length === 1 && isSizeOnlyColorName(piece.colors[0]?.name)
  );
}
