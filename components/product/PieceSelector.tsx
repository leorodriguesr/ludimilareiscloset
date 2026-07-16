"use client";

import { useEffect, useMemo, useState } from "react";
import {
  emptyPieceSelections,
  hasVariantMatrix,
  pieceShowsColorPicker,
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

  function emitPieceColorsChanged(map: PieceSelectionMap) {
    const detail: Record<string, string | null> = {};
    for (const piece of pieces) {
      const name = piece.name.trim();
      if (!name) continue;
      detail[name] = map[piece.id]?.color ?? null;
    }
    window.dispatchEvent(
      new CustomEvent("piece-colors:changed", { detail })
    );
  }

  useEffect(() => {
    emitPieceColorsChanged(emptyPieceSelections(pieces));
    // Só reemite ao trocar o conjunto de peças do produto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceKey]);

  const multiplePieces = pieces.length > 1;

  function selectColor(pieceId: string, colorName: string) {
    setSelections((prev) => {
      const next = {
        ...prev,
        [pieceId]: {
          ...(prev[pieceId] ?? { color: null, size: null }),
          color: colorName,
        },
      };
      emitPieceColorsChanged(next);
      return next;
    });
  }

  function selectSize(pieceId: string, sizeName: string) {
    const piece = pieces.find((p) => p.id === pieceId);
    setSelections((prev) => {
      const current = prev[pieceId] ?? { color: null, size: null };
      let color = current.color;
      // Tamanho sem estoque na cor atual → limpa a cor para poder escolher outra
      if (
        piece &&
        hasVariantMatrix(piece) &&
        color != null &&
        qtyForCombination(piece, color, sizeName) === 0
      ) {
        color = null;
      }
      const next = {
        ...prev,
        [pieceId]: { ...current, size: sizeName, color },
      };
      if (color !== current.color) {
        emitPieceColorsChanged(next);
      }
      return next;
    });
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
                ? `relative flex min-w-0 w-full flex-col justify-center px-4 py-5 sm:mx-auto sm:max-w-[20rem] sm:items-center sm:p-4 ${
                    showShortDivider
                      ? // Mobile: traço curto horizontal; sm+: traço curto vertical
                        "after:absolute after:bottom-0 after:left-1/2 after:h-px after:w-14 after:-translate-x-1/2 after:bg-stone-300 sm:after:bottom-auto sm:after:left-auto sm:after:right-0 sm:after:top-1/2 sm:after:h-14 sm:after:w-px sm:after:translate-x-0 sm:after:-translate-y-1/2"
                      : ""
                  }`
                : "space-y-5 sm:space-y-4"
            }
          >
            {multiplePieces ? (
              <div className="w-full space-y-5 text-left sm:max-w-[20rem] sm:space-y-4">
                <h3 className="text-base font-semibold tracking-wide text-stone-900 sm:text-sm">
                  {piece.name}
                </h3>

                {piece.sizes.length > 0 && (
                  <div>
                    <p className="mb-2.5 text-sm text-stone-500 sm:mb-2 sm:text-xs">
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
                    <div className="flex flex-wrap gap-2.5 sm:gap-2">
                      {piece.sizes.map((size) => {
                        // Só bloqueia se não houver estoque em nenhuma cor
                        const disabled =
                          matrix &&
                          piece.colors.every(
                            (c) =>
                              qtyForCombination(piece, c.name, size.name) === 0
                          );
                        const conflictsSelectedColor =
                          matrix &&
                          sel?.color != null &&
                          qtyForCombination(piece, sel.color, size.name) === 0;

                        return (
                          <button
                            key={size.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => selectSize(piece.id, size.name)}
                            className={`min-w-[2.75rem] shrink-0 rounded-md border px-3.5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 sm:min-w-[2.5rem] sm:px-3 sm:py-2 sm:text-sm ${
                              sel?.size === size.name
                                ? "border-2 border-black bg-white text-stone-900"
                                : conflictsSelectedColor
                                  ? "border border-stone-300 bg-white text-stone-400 hover:border-stone-500 hover:text-stone-700"
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

                {pieceShowsColorPicker(piece) && (
                  <div>
                    <p className="mb-2.5 text-sm text-stone-500 sm:mb-2 sm:text-xs">
                      <span className="font-medium text-stone-600">Cor: </span>
                      {sel?.color ? (
                        <span className="font-semibold text-stone-900">
                          {sel.color}
                        </span>
                      ) : piece.sizes.length > 0 && !sel?.size ? (
                        <span className="text-stone-400">
                          {" "}
                          — escolha o tamanho primeiro
                        </span>
                      ) : (
                        <span className="text-stone-400"> — escolha</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-3 sm:gap-2">
                      {piece.colors.map((color) => {
                        const needsSizeFirst =
                          piece.sizes.length > 0 && !sel?.size;
                        const noStockAnySize =
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
                          needsSizeFirst ||
                          noStockAnySize ||
                          noStockForSelectedSize;

                        return (
                          <button
                            key={color.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => selectColor(piece.id, color.name)}
                            title={
                              needsSizeFirst
                                ? "Escolha o tamanho primeiro"
                                : color.name
                            }
                            className={`h-8 w-8 rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-30 sm:h-7 sm:w-7 ${
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
                    <p className="text-sm text-stone-500 sm:text-xs">
                      Indisponível nesta combinação.
                    </p>
                  )}
              </div>
            ) : (
              <>
                {piece.sizes.length > 0 && (
                  <div>
                    <p className="mb-2.5 text-sm text-stone-500 sm:mb-2 sm:text-xs">
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
                    <div className="flex flex-wrap gap-2.5 sm:gap-2">
                      {piece.sizes.map((size) => {
                        const disabled =
                          matrix &&
                          piece.colors.every(
                            (c) =>
                              qtyForCombination(piece, c.name, size.name) === 0
                          );
                        const conflictsSelectedColor =
                          matrix &&
                          sel?.color != null &&
                          qtyForCombination(piece, sel.color, size.name) === 0;

                        return (
                          <button
                            key={size.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => selectSize(piece.id, size.name)}
                            className={`min-w-[2.75rem] shrink-0 rounded-md border px-3.5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 sm:min-w-[2.5rem] sm:px-3 sm:py-2 sm:text-sm ${
                              sel?.size === size.name
                                ? "border-2 border-stone-900 bg-white text-stone-900"
                                : conflictsSelectedColor
                                  ? "border border-stone-300 bg-white text-stone-400 hover:border-stone-500 hover:text-stone-700"
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

                {pieceShowsColorPicker(piece) && (
                  <div>
                    <p className="mb-2.5 text-sm text-stone-500 sm:mb-2 sm:text-xs">
                      <span className="font-medium text-stone-600">Cor: </span>
                      {sel?.color ? (
                        <span className="font-semibold text-stone-900">
                          {sel.color}
                        </span>
                      ) : piece.sizes.length > 0 && !sel?.size ? (
                        <span className="text-stone-400">
                          {" "}
                          — escolha o tamanho primeiro
                        </span>
                      ) : (
                        <span className="text-stone-400"> — escolha</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-3 sm:gap-2">
                      {piece.colors.map((color) => {
                        const needsSizeFirst =
                          piece.sizes.length > 0 && !sel?.size;
                        const noStockAnySize =
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
                          needsSizeFirst ||
                          noStockAnySize ||
                          noStockForSelectedSize;

                        return (
                          <button
                            key={color.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => selectColor(piece.id, color.name)}
                            title={
                              needsSizeFirst
                                ? "Escolha o tamanho primeiro"
                                : color.name
                            }
                            className={`h-8 w-8 rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-30 sm:h-7 sm:w-7 ${
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
                    <p className="text-sm text-stone-500 sm:text-xs">
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
