"use client";

import { useEffect } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { formatPrice } from "@/lib/format";

type PaymentResult =
  | {
      type: "pix";
      pixCode: string;
      pixQrBase64: string | null;
      expiresAt: string;
      amount: number;
    }
  | { type: "card"; checkoutUrl: string; amount: number };

export function ExchangeChargeModal({
  amount,
  busy,
  error,
  paymentResult,
  onClose,
  onGenerate,
}: {
  amount: number;
  busy: boolean;
  error: string | null;
  paymentResult: PaymentResult | null;
  onClose: () => void;
  onGenerate: (method: "pix" | "card") => void;
}) {
  useEffect(() => {
    /* parent polls exchange after generating payment */
  }, []);

  return (
    <AdminModal
      title="Cobrar cliente"
      subtitle="Gere o pagamento da diferença. Depois de pago, o reenvio cai em Envios."
      onClose={onClose}
    >
      <p className="text-lg font-semibold text-stone-900">
        {formatPrice(amount)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onGenerate("pix")}
          className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          Gerar PIX
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onGenerate("card")}
          className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          Link cartão
        </button>
      </div>
      {paymentResult?.type === "pix" && (
        <div className="mt-3 space-y-2 rounded-lg border border-stone-100 p-3 text-sm">
          <p className="font-medium">PIX · {formatPrice(paymentResult.amount)}</p>
          {paymentResult.pixQrBase64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${paymentResult.pixQrBase64}`}
              alt="QR Code PIX"
              className="mx-auto h-40 w-40"
            />
          )}
          <textarea
            readOnly
            value={paymentResult.pixCode}
            className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="text-xs text-stone-500">Aguardando pagamento…</p>
        </div>
      )}
      {paymentResult?.type === "card" && (
        <div className="mt-3 rounded-lg border border-stone-100 p-3 text-sm">
          <p className="font-medium">
            Cartão · {formatPrice(paymentResult.amount)}
          </p>
          <a
            href={paymentResult.checkoutUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex rounded-lg bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-900 ring-1 ring-sky-200"
          >
            Abrir link de pagamento
          </a>
          <p className="mt-2 text-xs text-stone-500">Aguardando pagamento…</p>
        </div>
      )}
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </AdminModal>
  );
}
