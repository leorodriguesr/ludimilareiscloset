"use client";

import { useState } from "react";
import type { ProductPiece } from "@/lib/types";

interface PieceSelectorProps {
  pieces: ProductPiece[];
}

function qtyForCombination(
  piece: ProductPiece,
  colorName: string,
  sizeName: string
): number {
  const v = piece.variants.find(
    (x) => x.color.name === colorName && x.size.name === sizeName
  );
  return v?.quantity ?? 0;
}

function hasVariantMatrix(piece: ProductPiece): boolean {
  return piece.variants.length > 0;
}

export function PieceSelector({ pieces }: PieceSelectorProps) {
  const [selections, setSelections] = useState<
    Record<string, { color: string | null; size: string | null }>
  >(
    Object.fromEntries(
      pieces.map((p) => [p.id, { color: null, size: null }])
    )
  );

  const multiplePieces = pieces.length > 1;

  function selectColor(pieceId: string, colorName: string) {
    setSelections((prev) => ({
      ...prev,
      [pieceId]: { ...prev[pieceId], color: colorName },
    }));
  }

  function selectSize(pieceId: string, sizeName: string) {
    setSelections((prev) => ({
      ...prev,
      [pieceId]: { ...prev[pieceId], size: sizeName },
    }));
  }

  if (pieces.length === 0) return null;

  return (
    <div
      className={
        multiplePieces
          ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]"
          : "space-y-6"
      }
    >
      {pieces.map((piece) => {
        const sel = selections[piece.id];
        const matrix = hasVariantMatrix(piece);
        return (
          <div
            key={piece.id}
            className={
              multiplePieces
                ? "min-w-0 space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                : "space-y-4"
            }
          >
            {multiplePieces && (
              <h3 className="border-b border-stone-100 pb-3 text-sm font-semibold tracking-wide text-stone-900">
                {piece.name}
              </h3>
            )}

            {piece.sizes.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-stone-500">
                  <span className="font-medium text-stone-600">Tamanho: </span>
                  {sel?.size ? (
                    <>
                      {" "}
                      <span className="font-semibold text-stone-900">
                        {sel.size}
                      </span>
                    </>
                  ) : (
                    <span className="text-stone-400"> — escolha</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {piece.sizes.map((size) => {
                    const noStockEveryColor =
                      matrix &&
                      piece.colors.every(
                        (c) =>
                          qtyForCombination(piece, c.name, size.name) === 0
                      );
                    const noStockForSelectedColor =
                      matrix &&
                      sel?.color != null &&
                      qtyForCombination(piece, sel.color, size.name) === 0;

                    const disabled =
                      matrix &&
                      (noStockEveryColor || noStockForSelectedColor);

                    return (
                      <button
                        key={size.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => selectSize(piece.id, size.name)}
                        className={`min-w-[2.25rem] shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 sm:min-w-[2.5rem] sm:px-3 sm:py-2 sm:text-sm ${
                          sel?.size === size.name
                            ? "border-stone-400 bg-stone-200 text-stone-900 shadow-sm"
                            : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
                        }`}
                      >
                        {size.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {piece.colors.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-stone-500">
                  <span className="font-medium text-stone-600">Cor: </span>
                  {sel?.color ? (
                    <>
                      {" "}
                      <span className="font-semibold text-stone-900">
                        {sel.color}
                      </span>
                    </>
                  ) : (
                    <span className="text-stone-400"> — escolha</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {piece.colors.map((color) => {
                    const noStockEverySize =
                      matrix &&
                      piece.sizes.every(
                        (s) =>
                          qtyForCombination(piece, color.name, s.name) === 0
                      );
                    const noStockForSelectedSize =
                      matrix &&
                      sel?.size != null &&
                      qtyForCombination(piece, color.name, sel.size) === 0;

                    const disabled =
                      matrix && (noStockEverySize || noStockForSelectedSize);

                    return (
                      <button
                        key={color.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => selectColor(piece.id, color.name)}
                        title={color.name}
                        className={`h-6 w-6 rounded-full border-2 transition-all disabled:cursor-not-allowed disabled:opacity-30 sm:h-7 sm:w-7 ${
                          sel?.color === color.name
                            ? "border-stone-500 ring-2 ring-stone-400 ring-offset-1"
                            : "border-stone-200 hover:border-stone-400"
                        }`}
                      >
                        <span
                          className="block h-full w-full rounded-full border border-stone-200"
                          style={{
                            backgroundColor: color.hex || "#ccc",
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {matrix &&
              sel?.color &&
              sel?.size &&
              qtyForCombination(piece, sel.color, sel.size) === 0 && (
                <p className="text-xs text-stone-500">
                  Indisponível nesta combinação.
                </p>
              )}
          </div>
        );
      })}
    </div>
  );
}
