"use client";

import { useEffect, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";

export function ExchangeManualReturnModal({
  exchangeId,
  busy,
  error,
  onClose,
  onSaved,
}: {
  exchangeId: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSaved: (body: {
    trackingCode: string;
    postingLocationName: string;
    postingLocationAddress: string;
  }) => void;
}) {
  const [trackingCode, setTrackingCode] = useState("");
  const [postingLocationName, setPostingLocationName] = useState("");
  const [postingLocationAddress, setPostingLocationAddress] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/exchanges/${exchangeId}/return-shipping`
        );
        const data = (await res.json()) as { defaultAddress?: string };
        if (data.defaultAddress) setPostingLocationAddress(data.defaultAddress);
      } catch {
        /* ignore */
      }
    })();
  }, [exchangeId]);

  return (
    <AdminModal
      title="Reversa manual"
      subtitle="Informe o código, o local de postagem e o endereço de destino."
      onClose={onClose}
    >
      <div className="space-y-3">
        <label className="block text-xs font-medium text-stone-600">
          Código de rastreio
          <input
            value={trackingCode}
            onChange={(e) => setTrackingCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            placeholder="Ex.: AA123456789BR"
          />
        </label>
        <label className="block text-xs font-medium text-stone-600">
          Local de postagem
          <input
            value={postingLocationName}
            onChange={(e) => setPostingLocationName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            placeholder="Ex.: Agência dos Correios Centro"
          />
        </label>
        <label className="block text-xs font-medium text-stone-600">
          Endereço de destino
          <textarea
            value={postingLocationAddress}
            onChange={(e) => setPostingLocationAddress(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
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
          onClick={() =>
            onSaved({
              trackingCode,
              postingLocationName,
              postingLocationAddress,
            })
          }
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Salvando…" : "Salvar reversa"}
        </button>
      </div>
    </AdminModal>
  );
}
