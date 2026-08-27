"use client";

import { useMemo, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import {
  EXCHANGE_DISPOSITION_LABELS,
  EXCHANGE_DISPOSITIONS,
} from "@/lib/exchanges/constants";
import { parsePieceSelections } from "@/lib/exchanges/serialize";
import type { ExchangeItemDisposition } from "@/app/generated/prisma/client";

export type InspectPiece = {
  id: string;
  productName: string;
  productImageUrl?: string | null;
  quantity: number;
  pieceSelectionsJson?: string | null;
};

export function ExchangeInspectModal({
  pieces,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  pieces: InspectPiece[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (lines: { exchangeItemId: string; disposition: ExchangeItemDisposition }[]) => void;
}) {
  const [dispositions, setDispositions] = useState<
    Record<string, ExchangeItemDisposition>
  >(() =>
    Object.fromEntries(pieces.map((p) => [p.id, "RESELLABLE" as const]))
  );

  const rows = useMemo(
    () =>
      pieces.map((piece) => {
        const selections = parsePieceSelections(piece.pieceSelectionsJson);
        const detail = selections
          .map((s) => [s.pieceName, s.color, s.size].filter(Boolean).join(" · "))
          .filter(Boolean)
          .join(" + ");
        return { ...piece, detail };
      }),
    [pieces]
  );

  return (
    <AdminModal
      title="Conferir peça"
      subtitle="Informe o destino de cada peça recebida."
      onClose={onClose}
    >
      <ul className="space-y-2">
        {rows.map((piece) => (
          <li
            key={piece.id}
            className="rounded-xl border border-stone-200 px-3 py-3"
          >
            <div className="flex gap-3">
              {piece.productImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={piece.productImageUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-900">
                  {piece.productName}
                </p>
                {piece.detail ? (
                  <p className="truncate text-xs text-stone-500">{piece.detail}</p>
                ) : null}
                <select
                  value={dispositions[piece.id] ?? "RESELLABLE"}
                  onChange={(e) =>
                    setDispositions((prev) => ({
                      ...prev,
                      [piece.id]: e.target.value as ExchangeItemDisposition,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
                >
                  {EXCHANGE_DISPOSITIONS.map((disp) => (
                    <option key={disp} value={disp}>
                      {EXCHANGE_DISPOSITION_LABELS[disp]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy || rows.length === 0}
          onClick={() =>
            onConfirm(
              rows.map((piece) => ({
                exchangeItemId: piece.id,
                disposition: dispositions[piece.id] ?? "RESELLABLE",
              }))
            )
          }
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Salvando…" : "Confirmar conferência"}
        </button>
      </div>
    </AdminModal>
  );
}
