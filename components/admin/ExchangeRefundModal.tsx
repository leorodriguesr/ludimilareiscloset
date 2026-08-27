"use client";

import { useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { formatPrice } from "@/lib/format";

export function ExchangeRefundModal({
  amount,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  amount: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");

  return (
    <AdminModal
      title="Devolver dinheiro"
      subtitle="Confirme depois de restituir o valor à cliente."
      onClose={onClose}
    >
      <p className="text-lg font-semibold text-stone-900">
        {formatPrice(Math.abs(amount))}
      </p>
      <p className="mt-1 text-xs text-stone-500">
        Isso registra a saída no caixa e conclui a devolução.
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Observações (opcional)"
        className="mt-3 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
      />
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
          disabled={busy}
          onClick={() => onConfirm(notes)}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Confirmando…" : "Confirmar restituição"}
        </button>
      </div>
    </AdminModal>
  );
}
