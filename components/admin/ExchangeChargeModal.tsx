"use client";

import { useEffect, useState } from "react";
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
  const [copied, setCopied] = useState<"pix" | "card" | null>(null);

  useEffect(() => {
    /* parent polls exchange after generating payment */
  }, []);

  useEffect(() => {
    // Se o link/código mudou (ou o método mudou), reseta feedback de cópia.
    setCopied(null);
  }, [paymentResult?.type]);

  async function copyText(value: string, key: "pix" | "card") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.alert("Não foi possível copiar. Tente novamente.");
    }
  }

  return (
    <AdminModal
      title="Cobrar cliente"
      subtitle="Gere o pagamento da diferença. Depois de pago, o reenvio cai em Envios."
      onClose={onClose}
    >
      <p className="text-xs text-stone-500">Valor pendente de pagamento</p>
      <p className="mt-0.5 text-lg font-semibold text-stone-900">
        {formatPrice(amount)}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {paymentResult?.type === "pix" ? (
          <>
            <button
              type="button"
              disabled
              className="rounded-lg bg-sky-100 px-3 py-2 text-xs font-medium text-sky-900 ring-1 ring-sky-200/80"
            >
              PIX Selecionado
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onGenerate("card")}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-40"
            >
              {busy ? "Gerando cartão…" : "Trocar para cartão"}
            </button>
          </>
        ) : paymentResult?.type === "card" ? (
          <>
            <button
              type="button"
              disabled
              className="rounded-lg bg-sky-100 px-3 py-2 text-xs font-medium text-sky-900 ring-1 ring-sky-200/80"
            >
              Cartão Selecionado
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onGenerate("pix")}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-40"
            >
              {busy ? "Gerando PIX…" : "Trocar para PIX"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onGenerate("pix")}
              className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
            >
              {busy ? "Carregando…" : "Gerar PIX"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onGenerate("card")}
              className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
            >
              {busy ? "Carregando…" : "Gerar link cartão"}
            </button>
          </>
        )}
      </div>
      {paymentResult ? (
        <p className="mt-2 text-[11px] text-stone-500">
          Ao trocar o método, um novo pagamento é gerado e a tentativa anterior
          deixa de ser válida.
        </p>
      ) : null}
      {paymentResult?.type === "pix" && (
        <div className="mt-3 space-y-2 rounded-lg border border-stone-100 p-3 text-sm">
          <p className="font-medium">PIX · {formatPrice(paymentResult.amount)}</p>
          <p className="text-xs text-stone-500">
            Expira em:{" "}
            {new Date(paymentResult.expiresAt).toLocaleString("pt-BR")}
          </p>
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
          <button
            type="button"
            disabled={busy}
            onClick={() => void copyText(paymentResult.pixCode, "pix")}
            className="ml-auto block rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-40"
          >
            {copied === "pix" ? "Mensagem copiada!" : "Copiar link Pix"}
          </button>
          <p className="text-xs text-stone-500">Aguardando pagamento…</p>
        </div>
      )}
      {paymentResult?.type === "card" && (
        <div className="mt-3 space-y-2 rounded-lg border border-stone-100 p-3 text-sm">
          <textarea
            readOnly
            value={paymentResult.checkoutUrl}
            className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void copyText(paymentResult.checkoutUrl, "card")
            }
            className="ml-auto block rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-40"
          >
            {copied === "card"
              ? "Mensagem copiada!"
              : "Copiar link cartão"}
          </button>
          <p className="text-xs text-stone-500">Aguardando pagamento…</p>
        </div>
      )}
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </AdminModal>
  );
}
