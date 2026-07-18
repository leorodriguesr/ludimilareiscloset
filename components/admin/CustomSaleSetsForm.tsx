"use client";

import { useState, type FormEvent } from "react";
import { formatPrice } from "@/lib/format";

const CUSTOM_SET_SIZES = ["PP", "P", "M", "G", "GG"] as const;

export type CustomSaleSetPiece = {
  name: string;
  size: string;
  color: string;
};

export type CustomSaleSetInput = {
  description: string;
  pieces: CustomSaleSetPiece[];
  unitPrice: number;
};

type CustomSetPieceDraft = {
  key: string;
  name: string;
  size: string;
  color: string;
};

type CustomSetDraft = {
  key: string;
  description: string;
  price: string;
  pieces: CustomSetPieceDraft[];
};

function newCustomSetPieceDraft(): CustomSetPieceDraft {
  return {
    key: `piece-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    size: "",
    color: "",
  };
}

function newCustomSetDraft(): CustomSetDraft {
  return {
    key: `custom-draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: "",
    price: "",
    pieces: [newCustomSetPieceDraft()],
  };
}

function formatDraftPrice(raw: string): string | null {
  const n = Number(raw.replace(",", "."));
  if (!raw.trim() || !Number.isFinite(n) || n < 0) return null;
  return formatPrice(n);
}

type Props = {
  onAdd: (sets: CustomSaleSetInput[]) => void;
  onCancel: () => void;
  title?: string;
  submitLabel?: string;
  descriptionLabel?: string;
  /** Campos e espaçamentos menores (ex.: modal de troca). */
  compact?: boolean;
};

export function CustomSaleSetsForm({
  onAdd,
  onCancel,
  title = "Registrar venda avulsa",
  submitLabel = "Adicionar à venda",
  descriptionLabel = "O que foi vendido?",
  compact = false,
}: Props) {
  const [rows, setRows] = useState<CustomSetDraft[]>(() => [newCustomSetDraft()]);
  const [formError, setFormError] = useState<string | null>(null);

  function updateSet(key: string, patch: Partial<CustomSetDraft>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function updatePiece(
    setKey: string,
    pieceKey: string,
    patch: Partial<CustomSetPieceDraft>
  ) {
    setRows((prev) =>
      prev.map((set) =>
        set.key !== setKey
          ? set
          : {
              ...set,
              pieces: set.pieces.map((p) =>
                p.key === pieceKey ? { ...p, ...patch } : p
              ),
            }
      )
    );
  }

  function addPiece(setKey: string) {
    setRows((prev) =>
      prev.map((set) =>
        set.key !== setKey
          ? set
          : {
              ...set,
              pieces: [...set.pieces, newCustomSetPieceDraft()],
            }
      )
    );
  }

  function removePiece(setKey: string, pieceKey: string) {
    setRows((prev) =>
      prev.map((set) => {
        if (set.key !== setKey || set.pieces.length <= 1) return set;
        return {
          ...set,
          pieces: set.pieces.filter((p) => p.key !== pieceKey),
        };
      })
    );
  }

  function handleAddSet() {
    setRows((prev) => [...prev, newCustomSetDraft()]);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed: CustomSaleSetInput[] = [];

    for (const row of rows) {
      const description = row.description.trim();
      const unitPrice = Number(row.price.replace(",", "."));
      const pieces = row.pieces
        .map((p) => ({
          name: p.name.trim(),
          size: p.size.trim(),
          color: p.color.trim(),
        }))
        .filter((p) => p.name || p.size || p.color);

      const empty = !description && !row.price.trim() && pieces.length === 0;
      if (empty) continue;

      if (!description || !row.price.trim()) {
        setFormError("Preencha a descrição e o valor de cada conjunto.");
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setFormError("Informe um valor válido para cada conjunto.");
        return;
      }

      parsed.push({ description, pieces, unitPrice });
    }

    if (parsed.length === 0) {
      setFormError("Adicione ao menos um conjunto.");
      return;
    }

    setFormError(null);
    onAdd(parsed);
  }

  const readyCount = rows.filter(
    (r) => r.description.trim() && r.price.trim()
  ).length;
  const totalPreview = rows.reduce((sum, r) => {
    const n = Number(r.price.replace(",", "."));
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  const shell = compact
    ? "overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
    : "overflow-hidden rounded-2xl border border-stone-200 bg-gradient-to-b from-stone-50 to-white shadow-sm";
  const headerPad = compact ? "px-3 py-2" : "px-4 py-3.5 sm:px-5";
  const bodyPad = compact ? "space-y-2.5 px-3 py-2.5" : "space-y-4 px-4 py-4 sm:px-5";
  const articleRadius = compact ? "rounded-lg" : "rounded-2xl";
  const articleHeaderPad = compact ? "px-2.5 py-1.5" : "px-4 py-2.5";
  const articleBodyPad = compact ? "space-y-2.5 p-2.5" : "space-y-5 p-4";
  const fieldLabel = compact
    ? "mb-1 block text-[11px] font-medium text-stone-600"
    : "mb-1.5 block text-xs font-medium text-stone-600";
  const textareaCls = compact
    ? "w-full resize-none rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs leading-snug text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
    : "w-full resize-none rounded-xl border border-stone-200 bg-stone-50/40 px-3.5 py-3 text-sm leading-relaxed text-stone-900 placeholder:text-stone-400 transition-colors focus:border-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-200";
  const priceInputCls = compact
    ? "box-border h-8 w-full rounded-lg border border-stone-200 bg-white py-0 pl-8 pr-2 text-xs font-semibold tabular-nums text-stone-900 placeholder:font-normal placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
    : "w-full rounded-xl border border-stone-200 bg-stone-50/40 py-3 pl-10 pr-3 text-base font-semibold tabular-nums text-stone-900 placeholder:font-normal placeholder:text-stone-400 transition-colors focus:border-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-200";
  const pieceInputCls = compact
    ? "box-border h-8 w-full rounded-md border border-stone-200 bg-white px-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-200"
    : "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200";
  const sizeBtnCls = (active: boolean) =>
    compact
      ? `min-w-[2rem] rounded-md px-2 py-1 text-[11px] font-semibold transition-all ${
          active
            ? "bg-sky-100 text-sky-900 ring-1 ring-sky-200"
            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
        }`
      : `min-w-[2.5rem] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
          active
            ? "bg-stone-900 text-white shadow-sm"
            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
        }`;

  return (
    <form onSubmit={handleSubmit} className={shell}>
      <div
        className={`flex items-start justify-between gap-2 border-b border-stone-200/80 bg-white/80 ${headerPad}`}
      >
        <div>
          <p
            className={`font-semibold text-stone-900 ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            {title}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 ${
            compact ? "p-1" : "rounded-lg p-1.5"
          }`}
          aria-label="Fechar"
        >
          <svg
            className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className={bodyPad}>
        {formError && (
          <div
            className={`bg-red-50 text-red-700 ${
              compact
                ? "rounded-lg px-2.5 py-1.5 text-xs"
                : "rounded-xl px-3.5 py-2.5 text-sm"
            }`}
          >
            {formError}
          </div>
        )}

        {rows.map((row, setIdx) => {
          const priceLabel = formatDraftPrice(row.price);
          return (
            <article
              key={row.key}
              className={`overflow-hidden border border-stone-200 bg-white shadow-[0_1px_0_rgba(28,25,23,0.04)] ${articleRadius}`}
            >
              <div
                className={`flex items-center justify-between gap-2 border-b border-stone-100 bg-stone-50/70 ${articleHeaderPad}`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center justify-center rounded-full bg-stone-800 font-semibold text-white ${
                      compact
                        ? "h-5 min-w-5 px-1 text-[10px]"
                        : "h-6 min-w-6 px-1.5 text-[11px]"
                    }`}
                  >
                    {setIdx + 1}
                  </span>
                  <span
                    className={`font-medium text-stone-600 ${
                      compact ? "text-[11px]" : "text-xs"
                    }`}
                  >
                    Conjunto
                  </span>
                  {priceLabel ? (
                    <span
                      className={`rounded-full bg-emerald-50 font-semibold tabular-nums text-emerald-700 ${
                        compact
                          ? "px-1.5 py-0.5 text-[10px]"
                          : "px-2 py-0.5 text-[11px]"
                      }`}
                    >
                      {priceLabel}
                    </span>
                  ) : null}
                </div>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) => prev.filter((r) => r.key !== row.key))
                    }
                    className={`font-medium text-stone-400 transition-colors hover:text-red-600 ${
                      compact ? "text-[11px]" : "text-xs"
                    }`}
                  >
                    Remover
                  </button>
                ) : null}
              </div>

              <div className={articleBodyPad}>
                <div
                  className={`grid ${
                    compact
                      ? "gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem]"
                      : "gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem]"
                  }`}
                >
                  <div>
                    <label className={fieldLabel}>{descriptionLabel}</label>
                    <textarea
                      value={row.description}
                      onChange={(e) =>
                        updateSet(row.key, { description: e.target.value })
                      }
                      rows={compact ? 2 : 2}
                      placeholder="Ex.: Conjunto alfaiataria bege, cinto de couro…"
                      autoFocus={setIdx === 0}
                      className={textareaCls}
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>Valor do conjunto</label>
                    <div className="relative">
                      <span
                        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 font-medium text-stone-400 ${
                          compact
                            ? "left-2.5 text-xs"
                            : "left-3.5 text-sm"
                        }`}
                      >
                        R$
                      </span>
                      <input
                        value={row.price}
                        onChange={(e) =>
                          updateSet(row.key, { price: e.target.value })
                        }
                        inputMode="decimal"
                        placeholder="0,00"
                        className={priceInputCls}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className={
                    compact
                      ? "rounded-lg bg-stone-50/80 p-2"
                      : "rounded-xl bg-stone-50/80 p-3.5"
                  }
                >
                  <div
                    className={`flex items-center justify-between gap-2 ${
                      compact ? "mb-2" : "mb-3"
                    }`}
                  >
                    <p
                      className={`font-semibold text-stone-700 ${
                        compact ? "text-[11px]" : "text-xs"
                      }`}
                    >
                      Peças deste conjunto
                    </p>
                    <button
                      type="button"
                      onClick={() => addPiece(row.key)}
                      className={`inline-flex items-center gap-1 font-semibold text-stone-700 shadow-sm ring-1 ring-stone-200/80 transition-colors hover:bg-sky-100 hover:text-sky-900 hover:ring-sky-200 ${
                        compact
                          ? "rounded-md bg-white px-2 py-1 text-[11px]"
                          : "rounded-lg bg-white px-2.5 py-1.5 text-xs hover:bg-stone-900 hover:text-white hover:ring-stone-900"
                      }`}
                    >
                      <svg
                        className={compact ? "h-3 w-3" : "h-3.5 w-3.5"}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                      Peça
                    </button>
                  </div>

                  <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
                    {row.pieces.map((piece, pieceIdx) => (
                      <div
                        key={piece.key}
                        className={
                          compact
                            ? "rounded-md border border-stone-200/80 bg-white p-2"
                            : "rounded-xl border border-stone-200/80 bg-white p-3 shadow-sm"
                        }
                      >
                        <div
                          className={`flex items-center justify-between gap-2 ${
                            compact ? "mb-1.5" : "mb-2.5"
                          }`}
                        >
                          <span className="text-[10px] font-medium uppercase tracking-wide text-stone-400">
                            Peça {pieceIdx + 1}
                          </span>
                          {row.pieces.length > 1 ? (
                            <button
                              type="button"
                              onClick={() =>
                                removePiece(row.key, piece.key)
                              }
                              className="text-[10px] font-medium text-stone-400 transition-colors hover:text-red-600"
                            >
                              Remover
                            </button>
                          ) : null}
                        </div>

                        <div
                          className={`grid ${
                            compact
                              ? "gap-1.5 sm:grid-cols-[minmax(0,1fr)_5.5rem]"
                              : "gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]"
                          }`}
                        >
                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium text-stone-500">
                              Nome
                            </label>
                            <input
                              value={piece.name}
                              onChange={(e) =>
                                updatePiece(row.key, piece.key, {
                                  name: e.target.value,
                                })
                              }
                              placeholder="Calça, blusa, cinto…"
                              className={pieceInputCls}
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium text-stone-500">
                              Cor
                            </label>
                            <input
                              value={piece.color}
                              onChange={(e) =>
                                updatePiece(row.key, piece.key, {
                                  color: e.target.value,
                                })
                              }
                              placeholder="Preto"
                              className={pieceInputCls}
                            />
                          </div>
                        </div>

                        <div className={compact ? "mt-1.5" : "mt-3"}>
                          <label
                            className={`mb-1 block font-medium text-stone-500 ${
                              compact ? "text-[10px]" : "mb-1.5 text-[11px]"
                            }`}
                          >
                            Tamanho
                          </label>
                          <div className="flex flex-wrap gap-1">
                            {CUSTOM_SET_SIZES.map((size) => {
                              const active = piece.size === size;
                              return (
                                <button
                                  key={size}
                                  type="button"
                                  onClick={() =>
                                    updatePiece(row.key, piece.key, {
                                      size: active ? "" : size,
                                    })
                                  }
                                  className={sizeBtnCls(active)}
                                >
                                  {size}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        <button
          type="button"
          onClick={handleAddSet}
          className={`flex w-full items-center justify-center gap-1.5 border border-dashed border-stone-300 bg-white/60 font-medium text-stone-600 transition-colors hover:border-stone-400 hover:bg-white hover:text-stone-900 ${
            compact
              ? "rounded-lg px-3 py-1.5 text-xs"
              : "rounded-2xl px-4 py-3 text-sm"
          }`}
        >
          <svg
            className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Adicionar outro conjunto
        </button>
      </div>

      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 bg-white ${
          compact ? "px-3 py-2" : "px-4 py-3.5 sm:px-5"
        }`}
      >
        <div
          className={`min-w-0 text-stone-500 ${
            compact ? "text-[11px]" : "text-xs"
          }`}
        >
          {readyCount > 0 ? (
            <>
              <span className="font-semibold text-stone-800">
                {readyCount}{" "}
                {readyCount === 1 ? "conjunto" : "conjuntos"}
              </span>
              {totalPreview > 0 ? (
                <span className="text-stone-400">
                  {" "}
                  · {formatPrice(totalPreview)}
                </span>
              ) : null}
            </>
          ) : (
            <span>Preencha descrição e valor para continuar</span>
          )}
        </div>
        <button
          type="submit"
          disabled={readyCount === 0}
          className={`font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            compact
              ? "rounded-lg bg-sky-100 px-3 py-1.5 text-xs text-sky-900 ring-1 ring-sky-200/80 hover:bg-sky-200"
              : "rounded-xl bg-stone-900 px-4 py-2.5 text-sm text-white hover:bg-stone-800"
          }`}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
