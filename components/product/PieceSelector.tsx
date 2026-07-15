"use client";

import { useEffect, useMemo, useState } from "react";
import { emptyPieceSelections } from "@/lib/product-piece-selection";
import {
  hasVariantMatrix,
  qtyForCombination,
  type PieceSelectionMap,
} from "@/lib/product-piece-selection";
import type { ProductPiece } from "@/lib/types";
import { colorSwatchStyle } from "@/lib/color-swatch";

interface PieceSelectorProps {
  pieces: ProductPiece[];
  selections?: PieceSelectionMap;
  onSelectionsChange?: (next: PieceSelectionMap) => void;
}

export function PieceSelector({
  pieces,
  selections: controlledSelections,
  onSelectionsChange,
}: PieceSelectorProps) {
  const isControlled =
    controlledSelections != null && onSelectionsChange != null;

  const [internal, setInternal] = useState<PieceSelectionMap>(() =>
    emptyPieceSelections(pieces)
  );

  const pieceKey = useMemo(() => pieces.map((p) => p.id).join("|"), [pieces]);

  const selections = isControlled ? controlledSelections! : internal;

  function setSelections(updater: (prev: PieceSelectionMap) => PieceSelectionMap) {
    if (isControlled) {
      onSelectionsChange!(updater(controlledSelections!));
    } else {
      setInternal(updater);
    }
  }

  useEffect(() => {
    if (isControlled) return;
    setInternal(emptyPieceSelections(pieces));
  }, [pieceKey, isControlled, pieces]);

  const multiplePieces = pieces.length > 1;

  function selectColor(pieceId: string, colorName: string) {
    setSelections((prev) => ({
      ...prev,
      [pieceId]: { ...prev[pieceId]!, color: colorName },
    }));
    window.dispatchEvent(new CustomEvent("color:selected", { detail: colorName }));
  }

  function selectSize(pieceId: string, sizeName: string) {
    setSelections((prev) => ({
      ...prev,
      [pieceId]: { ...prev[pieceId]!, size: sizeName },
    }));
  }

  if (pieces.length === 0) return null;

  return (
    <div
      className={
        multiplePieces
          ? "grid grid-cols-1 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm sm:grid-cols-2"
          : "space-y-6"
      }
    >
      {pieces.map((piece, index) => {
        const sel = selections[piece.id] ?? { color: null, size: null };
        const matrix = hasVariantMatrix(piece);
        const showShortDivider = multiplePieces && index < pieces.length - 1;
        return (
          <div
            key={piece.id}
            className={
              multiplePieces
                ? `relative mx-auto flex min-w-0 w-full max-w-[20rem] flex-col items-center justify-center p-4 ${
                    showShortDivider
                      ? "after:absolute after:right-0 after:top-1/2 after:h-20 after:w-px after:-translate-y-1/2 after:bg-stone-200"
                      : ""
                  }`
                : "space-y-4"
            }
          >
            {multiplePieces ? (
              <div className="w-full max-w-[20rem] space-y-4 text-left">
                <h3 className="text-sm font-semibold tracking-wide text-stone-900">
                  {piece.name}
                </h3>

                {piece.sizes.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-stone-500">
                      <span className="font-medium text-stone-600">
                        Tamanho:{" "}
                      </span>
                      {sel?.size ? (
                        <span className="font-semibold text-stone-900">
                          {sel.size}
                        </span>
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
                                ? "border-2 border-black bg-white text-stone-900"
                                : "border border-stone-300 bg-white text-stone-700 hover:border-stone-500"
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
                        <span className="font-semibold text-stone-900">
                          {sel.color}
                        </span>
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
                              qtyForCombination(
                                piece,
                                color.name,
                                s.name
                              ) === 0
                          );
                        const noStockForSelectedSize =
                          matrix &&
                          sel?.size != null &&
                          qtyForCombination(piece, color.name, sel.size) === 0;

                        const disabled =
                          matrix &&
                          (noStockEverySize || noStockForSelectedSize);

                        return (
                          <button
                            key={color.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => selectColor(piece.id, color.name)}
                            title={color.name}
                            className={`h-6 w-6 rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-30 sm:h-7 sm:w-7 ${
                              sel?.color === color.name
                                ? "border-2 border-black"
                                : "border-2 border-stone-200 hover:border-stone-400"
                            }`}
                          >
                            <span
                              className="block h-full w-full rounded-full border border-stone-200"
                              style={colorSwatchStyle(color.hex || "#ccc")}
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
            ) : (
              <>
                {piece.sizes.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-stone-500">
                      <span className="font-medium text-stone-600">
                        Tamanho:{" "}
                      </span>
                      {sel?.size ? (
                        <span className="font-semibold text-stone-900">
                          {sel.size}
                        </span>
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
                                ? "border-2 border-stone-900 bg-white text-stone-900"
                                : "border border-stone-300 bg-white text-stone-700 hover:border-stone-500"
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
                        <span className="font-semibold text-stone-900">
                          {sel.color}
                        </span>
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
                              qtyForCombination(
                                piece,
                                color.name,
                                s.name
                              ) === 0
                          );
                        const noStockForSelectedSize =
                          matrix &&
                          sel?.size != null &&
                          qtyForCombination(piece, color.name, sel.size) === 0;

                        const disabled =
                          matrix &&
                          (noStockEverySize || noStockForSelectedSize);

                        return (
                          <button
                            key={color.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => selectColor(piece.id, color.name)}
                            title={color.name}
                            className={`h-6 w-6 rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-30 sm:h-7 sm:w-7 ${
                              sel?.color === color.name
                                ? "border-2 border-stone-900"
                                : "border-2 border-stone-200 hover:border-stone-400"
                            }`}
                          >
                            <span
                              className="block h-full w-full rounded-full border border-stone-200"
                              style={colorSwatchStyle(color.hex || "#ccc")}
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
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
