"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";

type PaymentPiece = {
  pieceName: string;
  color: string | null;
  size: string | null;
};

type PaymentItem = {
  id?: string;
  name: string;
  description?: string | null;
  quantity: number;
  price: number;
  imageUrl: string | null;
  pieces?: PaymentPiece[];
};

type PendingPayment = {
  status: "pending";
  orderNumber: number | null;
  total: number;
  shippingAmount: number;
  items: PaymentItem[];
  pixCode: string;
  pixQrBase64: string | null;
  expiresAt: string;
  amount: number;
};

type PaidPayment = {
  status: "paid";
  orderNumber: number | null;
  total: number;
  shippingAmount: number;
  items: PaymentItem[];
};

type Props = { token: string };

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function AdminSalePixPaymentPage({ token }: Props) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState<PaidPayment | null>(null);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<"waiting" | "paid" | "expired">(
    "waiting"
  );
  const [secondsLeft, setSecondsLeft] = useState(0);

  const loadPayment = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/public/order-payment/${token}`);
      const data = (await res.json()) as
        | (PendingPayment & { error?: string })
        | (PaidPayment & { error?: string });
      if (!res.ok) {
        throw new Error(data.error ?? "Não foi possível carregar o pagamento.");
      }
      if (data.status === "paid") {
        setPaid(data);
        setPending(null);
        setPollingStatus("paid");
        return;
      }
      setPaid(null);
      setPending(data);
      const diff = Math.floor(
        (new Date(data.expiresAt).getTime() - Date.now()) / 1000
      );
      setSecondsLeft(Math.max(0, diff));
      setPollingStatus(diff <= 0 ? "expired" : "waiting");
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Não foi possível carregar o pagamento."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPayment();
  }, [loadPayment]);

  useEffect(() => {
    if (!pending || pollingStatus !== "waiting") return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 0) setPollingStatus("expired");
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pending, pollingStatus]);

  useEffect(() => {
    if (pollingStatus !== "waiting" || !pending) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/order-payment/${token}/status`);
        if (!res.ok) return;
        const json = (await res.json()) as { status: string };
        if (json.status === "paid") {
          setPollingStatus("paid");
          setPaid({
            status: "paid",
            orderNumber: pending.orderNumber,
            total: pending.total,
            shippingAmount: pending.shippingAmount,
            items: pending.items,
          });
          setPending(null);
        }
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pollingStatus, pending, token]);

  async function handleCopy() {
    if (!pending?.pixCode) return;
    try {
      await navigator.clipboard.writeText(pending.pixCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl bg-white/80 px-6 py-16 text-center">
        <p className="text-sm text-stone-500">Carregando pagamento…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-700">{loadError}</p>
      </div>
    );
  }

  if (pollingStatus === "paid" || paid) {
    const summary = paid;
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-xl font-semibold text-stone-900">
            Pagamento confirmado!
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {summary?.orderNumber != null
              ? `Pedido #${summary.orderNumber} recebido com sucesso.`
              : "Recebemos o pagamento do seu pedido."}
          </p>
          <p className="mt-2 text-sm text-stone-500">
            Seu pedido já está sendo preparado e logo será enviado.
          </p>
        </div>
        {summary ? <OrderItemsCard data={summary} /> : null}
      </div>
    );
  }

  if (!pending) return null;

  return (
    <div className="space-y-6 opacity-100">
      <header className="text-center">
        <div className="flex flex-col items-center leading-none">
          <span className="text-lg font-semibold uppercase tracking-[0.22em] text-stone-900">
            Ludimila Reis
          </span>
          <span className="mt-1 text-[10px] font-light uppercase tracking-[0.4em] text-stone-400">
            Closet
          </span>
        </div>
        {pending.orderNumber != null ? (
          <p className="mt-3 text-sm text-stone-500">
            Pedido #{pending.orderNumber}
          </p>
        ) : null}
      </header>

      <OrderItemsCard data={pending} />

      {/* Um único painel: valor + copia e cola + QR opcional */}
      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_12px_40px_-24px_rgba(28,25,23,0.35)]">
        <div className="bg-gradient-to-b from-stone-50 to-white px-5 pb-5 pt-6 text-center">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200/80">
            <Image
              src="/pix-icon.svg"
              alt=""
              width={14}
              height={14}
              unoptimized
            />
            Pix
          </div>
          <p className="text-3xl font-semibold tracking-tight text-stone-900">
            {formatPrice(pending.amount)}
          </p>
          {pollingStatus === "expired" ? (
            <p className="mt-2 text-sm font-medium text-red-600">Pix expirado</p>
          ) : (
            <p className="mt-2 text-xs text-stone-500">
              Expira em{" "}
              <span
                className={`font-mono font-semibold tabular-nums ${
                  secondsLeft < 120 ? "text-red-600" : "text-stone-700"
                }`}
              >
                {formatTime(secondsLeft)}
              </span>
            </p>
          )}
        </div>

        <div className="space-y-4 border-t border-stone-100 px-5 py-5">
          {pending.pixQrBase64 ? (
            <div className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${pending.pixQrBase64}`}
                alt="QR Code PIX"
                className="h-44 w-44 rounded-xl bg-white object-contain p-2 ring-1 ring-stone-100 sm:h-52 sm:w-52"
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void handleCopy()}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all active:scale-[0.99] ${
              copied
                ? "bg-emerald-700 text-white shadow-sm"
                : "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
            }`}
          >
            {copied ? (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Código copiado
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
                  />
                </svg>
                Copiar código Pix
              </>
            )}
          </button>

          <ol className="space-y-1.5 px-0.5">
            {[
              "Toque em Copiar código Pix",
              "Abra o app do banco → Pix Copia e Cola",
              "Cole o código e confirme o pagamento",
            ].map((step, i) => (
              <li
                key={step}
                className="flex items-start gap-2.5 text-xs text-stone-500"
              >
                <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[10px] font-semibold text-stone-600">
                  {i + 1}
                </span>
                <span className="leading-snug">{step}</span>
              </li>
            ))}
          </ol>

          <p className="max-h-16 overflow-y-auto break-all rounded-lg bg-stone-50 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-stone-500">
            {pending.pixCode}
          </p>

          {pollingStatus === "expired" ? (
            <button
              type="button"
              onClick={() => void loadPayment()}
              className="w-full rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Atualizar pagamento
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-stone-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Aguardando confirmação automática
            </div>
          )}
        </div>
      </section>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-stone-400">
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
        Ambiente seguro · Mercado Pago
      </p>
    </div>
  );
}

function OrderItemsCard({
  data,
}: {
  data: {
    orderNumber: number | null;
    total: number;
    shippingAmount: number;
    items: PaymentItem[];
  };
}) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_8px_30px_-20px_rgba(28,25,23,0.25)]">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        Seu pedido
      </p>
      <ul className="space-y-4">
        {data.items.map((item, index) => {
          const pieces = item.pieces ?? [];
          return (
            <li
              key={item.id ?? `${item.name}-${index}`}
              className="flex gap-3"
            >
              <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="48px"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[9px] text-stone-300">
                    —
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug text-stone-900">
                  {item.name}
                </p>
                {pieces.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-stone-400">
                    {pieces.map((p, i) => {
                      const details = [p.pieceName, p.color, p.size]
                        .filter(Boolean)
                        .join(" · ");
                      if (!details) return null;
                      return (
                        <li key={`${item.id ?? index}-piece-${i}`}>{details}</li>
                      );
                    })}
                  </ul>
                ) : null}
                <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="text-stone-500">
                    {item.quantity}× {formatPrice(item.price)}
                  </span>
                  <span className="font-semibold tabular-nums text-stone-900">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 space-y-1 border-t border-stone-100 pt-3 text-sm">
        {data.shippingAmount > 0 ? (
          <div className="flex justify-between text-stone-500">
            <span>Frete</span>
            <span className="tabular-nums">{formatPrice(data.shippingAmount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between font-semibold text-stone-900">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(data.total)}</span>
        </div>
      </div>
    </div>
  );
}
