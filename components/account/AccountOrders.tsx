"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import { describeCartPieceSelection } from "@/lib/cart/format-piece-selections";
import type { CartPieceSelection } from "@/lib/cart/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountOrderItem = {
  id: string;
  quantity: number;
  price: number;
  pieceSelectionsJson: string | null;
  product: { id: string; name: string; images: { url: string }[] };
};

export type AccountOrderListItem = {
  id: string;
  orderNumber: number | null;
  createdAt: Date;
  status: string;
  expiresAt: Date | null;
  paymentMethod: string | null;
  total: number;
  shippingAmount: number;
  shippingServiceName: string | null;
  shippingServiceId: number | null;
  shippingStatus: string;
  shippingDeliveryDaysMin: number | null;
  shippingDeliveryDaysMax: number | null;
  superfreteShipmentId: string | null;
  trackingCode: string | null;
  superfreteStatus: string | null;
  recipientName: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  destinationCep: string | null;
  items: AccountOrderItem[];
};

type TrackingResponse = {
  trackingCode: string | null;
  shippingServiceId: number | null;
  deliveryMin: number | null;
  deliveryMax: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatWhen(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

function cepMask(v: string) {
  const d = v.replace(/\D/g, "");
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function getCarrierTrackingUrl(serviceId: number | null, code: string) {
  if (serviceId === 3) return `https://www.jadlog.com.br/rastreamento/#tracking/${code}`;
  if (serviceId === 31) return `https://melhorrastreio.com.br/rastreio/${code}`;
  return `https://rastreamento.correios.com.br/app/index.php?code=${code}`;
}

function shippingStep(shippingStatus: string, paymentStatus: string): number {
  if (paymentStatus !== "paid") return -1;
  if (shippingStatus === "cancelled") return -1;
  if (shippingStatus === "delivered") return 3;
  if (shippingStatus === "shipped") return 2;
  if (shippingStatus === "packed" || shippingStatus === "to_pack") return 1;
  // Pedido pago entra direto em preparação
  return 1;
}

function shippingStatusLabel(shippingStatus: string, paymentStatus: string): string {
  if (paymentStatus !== "paid") return "Aguardando pagamento";
  if (shippingStatus === "delivered") return "Entregue";
  if (shippingStatus === "shipped") return "A caminho";
  if (shippingStatus === "packed" || shippingStatus === "to_pack") return "Em preparação";
  if (shippingStatus === "cancelled") return "Cancelado";
  return "Em preparação";
}

function paymentOrderStatusLabel(order: AccountOrderListItem): string {
  if (order.status === "expired") return "Expirado";
  if (order.status === "cancelled") return "Cancelado";
  if (order.status === "paid") {
    return shippingStatusLabel(order.shippingStatus, order.status);
  }
  return "Aguardando pagamento";
}

function orderStatusBadgeClass(order: AccountOrderListItem): string {
  if (order.status === "expired") return "bg-stone-200 text-stone-600";
  if (order.status === "cancelled") return "bg-red-100 text-red-800";
  if (order.status !== "paid") return "bg-amber-100 text-amber-800";
  if (order.shippingStatus === "delivered") return "bg-emerald-100 text-emerald-800";
  if (order.shippingStatus === "shipped") return "bg-sky-100 text-sky-800";
  return "bg-stone-100 text-stone-800";
}

function isPendingPayment(order: AccountOrderListItem): boolean {
  if (order.status !== "pending_payment") return false;
  if (!order.expiresAt) return true;
  return order.expiresAt.getTime() > Date.now();
}

function ContinuePaymentActions({ order }: { order: AccountOrderListItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{
    pixCode: string;
    pixQrBase64: string | null;
    amount: number;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<
    "idle" | "waiting" | "paid"
  >("idle");

  useEffect(() => {
    if (pollingStatus !== "waiting" || !order.id) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/checkout/pix-status/${order.id}`);
        if (!res.ok) return;
        const json = (await res.json()) as { status: string };
        if (json.status === "paid") {
          setPollingStatus("paid");
          router.refresh();
        }
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [order.id, pollingStatus, router]);

  async function handleContinue() {
    setBusy(true);
    setError(null);
    setPixData(null);
    setPollingStatus("idle");
    try {
      const res = await fetch(
        `/api/account/orders/${order.id}/continue-payment`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        error?: string;
        type?: string;
        checkoutUrl?: string;
        pixCode?: string;
        pixQrBase64?: string | null;
        amount?: number;
        expiresAt?: string;
      };

      if (!res.ok) {
        setError(data.error ?? "Não foi possível continuar o pagamento.");
        return;
      }

      if (data.type === "paid") {
        setPollingStatus("paid");
        router.refresh();
        return;
      }

      if (data.type === "card" && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      if (data.type === "pix" && data.pixCode) {
        setPixData({
          pixCode: data.pixCode,
          pixQrBase64: data.pixQrBase64 ?? null,
          amount: data.amount ?? order.total,
          expiresAt:
            data.expiresAt ??
            new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        });
        setPollingStatus("waiting");
        return;
      }

      setError("Resposta inválida ao retomar pagamento.");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPixCode() {
    if (!pixData?.pixCode) return;
    try {
      await navigator.clipboard.writeText(pixData.pixCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar o código PIX.");
    }
  }

  return (
    <div className="border-t border-stone-100 px-5 py-4">
      {error ? (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      ) : null}

      {pixData ? (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          {pollingStatus === "paid" ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Pagamento confirmado!
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-900">
                Pague {formatPrice(pixData.amount)} via Pix
              </p>
              <p className="text-xs text-amber-800">
                Aguardando confirmação do banco… a página atualiza sozinha após o pagamento.
              </p>
            </>
          )}
          {pollingStatus !== "paid" && pixData.pixQrBase64 ? (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${pixData.pixQrBase64}`}
                alt="QR Code PIX"
                className="h-44 w-44 object-contain"
              />
            </div>
          ) : null}
          {pollingStatus !== "paid" ? (
            <button
              type="button"
              onClick={copyPixCode}
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-xs font-mono text-stone-700 break-all hover:bg-amber-100/50"
            >
              {copied ? "Código copiado!" : pixData.pixCode}
            </button>
          ) : null}
          <Link
            href={`/pedido/${order.id}`}
            className="block text-center text-xs font-medium text-amber-900 underline-offset-2 hover:underline"
          >
            Ver detalhes do pedido
          </Link>
        </div>
      ) : pollingStatus === "paid" ? (
        <p className="text-sm font-medium text-emerald-800">
          Pagamento confirmado! Atualizando…
        </p>
      ) : (
        <button
          type="button"
          onClick={handleContinue}
          disabled={busy}
          className="inline-flex w-full items-center justify-center rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:opacity-60 sm:w-auto"
        >
          {busy ? "Preparando pagamento…" : "Continuar pagamento"}
        </button>
      )}
    </div>
  );
}

function paymentMethodLabel(method: string | null) {
  if (method === "pix") return "Pix";
  if (method === "card") return "Cartão";
  return "—";
}

function parsePieceSelections(json: string | null): CartPieceSelection[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json) as unknown;
    if (Array.isArray(p)) {
      return p.filter(
        (r): r is CartPieceSelection =>
          Boolean(r) && typeof r === "object" && "pieceName" in r
      );
    }
  } catch {}
  return [];
}

function formatAddress(order: AccountOrderListItem): string | null {
  if (!order.addressStreet) return null;
  const line1 = [
    order.addressStreet,
    order.addressNumber,
    order.addressComplement,
  ].filter(Boolean).join(", ");
  const line2 = [
    order.addressNeighborhood,
    [order.addressCity, order.addressState].filter(Boolean).join(" — "),
    order.destinationCep ? `CEP ${cepMask(order.destinationCep)}` : null,
  ].filter(Boolean).join(" · ");
  return [line1, line2].filter(Boolean).join(" · ");
}

// ─── Subcomponents ──────────────────────────────────────────────────────────────

const PROGRESS_STEPS = ["Recebido", "Preparando", "Enviado", "Entregue"];

function OrderProgress({ shippingStatus, paymentStatus }: {
  shippingStatus: string;
  paymentStatus: string;
}) {
  const active = shippingStep(shippingStatus, paymentStatus);
  if (active < 0) return null;

  return (
    <div className="flex items-center gap-0">
      {PROGRESS_STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                i <= active
                  ? "bg-stone-900 text-white"
                  : "border border-stone-200 bg-white text-stone-300"
              }`}
            >
              {i <= active ? (
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`mt-1 hidden text-[9px] font-medium sm:block ${
                i === active ? "text-stone-900" : i < active ? "text-stone-500" : "text-stone-300"
              }`}
            >
              {label}
            </span>
          </div>
          {i < PROGRESS_STEPS.length - 1 && (
            <div className={`mb-4 h-px flex-1 sm:mb-0 ${i < active ? "bg-stone-900" : "bg-stone-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function PaymentMethodIcon({ method }: { method: string | null }) {
  if (method === "pix") {
    return (
      <Image
        src="/pix-icon.svg"
        alt="Pix"
        width={14}
        height={14}
        unoptimized
        className="h-3.5 w-3.5 object-contain"
      />
    );
  }
  return (
    <svg className="h-3.5 w-3.5 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function TrackingBlock({ order }: { order: AccountOrderListItem }) {
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const trackingCode = data?.trackingCode ?? order.trackingCode;
  const serviceId = data?.shippingServiceId ?? order.shippingServiceId;
  const deliveryMin = data?.deliveryMin ?? order.shippingDeliveryDaysMin;
  const deliveryMax = data?.deliveryMax ?? order.shippingDeliveryDaysMax;

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch(`/api/account/order-tracking/${order.id}`);
      if (res.ok) setData(await res.json() as TrackingResponse);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    if (order.status === "paid" && !order.trackingCode) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.status, order.trackingCode]);

  if (order.status !== "paid") {
    return (
      <p className="text-sm text-stone-500">
        O rastreio ficará disponível após a confirmação do pagamento.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {trackingCode ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Código de rastreio</p>
            <p className="mt-0.5 font-mono text-sm font-medium text-stone-900">{trackingCode}</p>
          </div>
          <a
            href={getCarrierTrackingUrl(serviceId, trackingCode)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-stone-700"
          >
            Acompanhar entrega
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-500">
            {loading ? "Consultando rastreio…" : "Código de rastreio ainda não disponível."}
          </p>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>
      )}
      {deliveryMin != null && deliveryMax != null && (
        <p className="text-xs text-stone-400">
          Prazo estimado: {deliveryMin} a {deliveryMax} dias úteis
          {order.shippingServiceName ? ` · ${order.shippingServiceName}` : ""}
        </p>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: AccountOrderListItem }) {
  const isPaid = order.status === "paid";
  const isExpired = order.status === "expired";
  const pending = isPendingPayment(order);
  const subtotal = order.items.reduce((a, i) => a + i.price * i.quantity, 0);
  const address = formatAddress(order);
  const statusLabel = paymentOrderStatusLabel(order);

  return (
    <li className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">

      {/* Cabeçalho */}
      <div className="border-b border-stone-100 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-stone-900">
              {order.orderNumber ? `Pedido #${order.orderNumber}` : "Pedido"}
            </p>
            <p className="mt-0.5 text-xs text-stone-400">{formatWhen(order.createdAt)}</p>
          </div>
          <div className="text-right">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${orderStatusBadgeClass(order)}`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {isPaid && (
          <div className="mt-4">
            <OrderProgress shippingStatus={order.shippingStatus} paymentStatus={order.status} />
          </div>
        )}
      </div>

      {/* Corpo: produtos + resumo */}
      <div className="grid gap-0 sm:grid-cols-[1fr_220px] sm:divide-x sm:divide-stone-100">

        {/* Produtos */}
        <ul className="divide-y divide-stone-50 px-5 py-1">
          {order.items.map((line) => {
            const thumb = line.product.images[0]?.url;
            const sel = parsePieceSelections(line.pieceSelectionsJson);
            const selText = sel
              .map((r) => {
                const d = describeCartPieceSelection(r);
                return sel.length > 1 ? `${r.pieceName}: ${d}` : d;
              })
              .filter(Boolean)
              .join(" · ");

            return (
              <li key={line.id} className="flex items-center gap-3 py-3">
                <Link
                  href={`/products/${line.product.id}`}
                  className="relative h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-100"
                >
                  {thumb ? (
                    <Image src={thumb} alt={line.product.name} fill className="object-cover" sizes="48px" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-stone-300">—</div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-900 line-clamp-2">{line.product.name}</p>
                  {selText && <p className="mt-0.5 text-[11px] text-stone-500">{selText}</p>}
                  <p className="mt-0.5 text-[11px] tabular-nums text-stone-400">
                    {line.quantity} × {formatPrice(line.price)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-stone-900">
                  {formatPrice(line.price * line.quantity)}
                </p>
              </li>
            );
          })}
        </ul>

        {/* Resumo financeiro */}
        <div className="border-t border-stone-100 bg-stone-50/50 px-5 py-4 sm:border-t-0">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Pagamento</p>

          <div className="mb-3 flex items-center gap-1.5 text-sm text-stone-700">
            <PaymentMethodIcon method={order.paymentMethod} />
            <span className="font-medium">{paymentMethodLabel(order.paymentMethod)}</span>
          </div>

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-stone-500">
              <dt>Produtos</dt>
              <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-stone-500">
              <dt>
                Frete
                {order.shippingServiceName ? (
                  <span className="block text-[10px] text-stone-400">{order.shippingServiceName}</span>
                ) : null}
              </dt>
              <dd className="tabular-nums self-start">
                {order.shippingAmount > 0 ? formatPrice(order.shippingAmount) : "Grátis"}
              </dd>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-2 font-semibold text-stone-900">
              <dt>{isPaid ? "Total pago" : "Total"}</dt>
              <dd className="tabular-nums">{formatPrice(order.total)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Rastreio / pagamento pendente */}
      {isExpired ? (
        <div className="border-t border-stone-100 px-5 py-4">
          <p className="text-sm text-stone-500">
            Este pedido expirou sem confirmação de pagamento. Você pode comprar os mesmos produtos novamente.
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex items-center justify-center rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
          >
            Comprar novamente
          </Link>
        </div>
      ) : pending ? (
        <ContinuePaymentActions order={order} />
      ) : (
        <div className="border-t border-stone-100 px-5 py-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Acompanhar pedido</p>
          <TrackingBlock order={order} />
        </div>
      )}

      {/* Endereço — oculto para expirados sem pagamento */}
      {!isExpired && address && (
        <div className="border-t border-stone-100 bg-stone-50/40 px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Entrega</p>
          <p className="mt-1 text-sm text-stone-600">
            {order.recipientName ? (
              <span className="font-medium text-stone-800">{order.recipientName} · </span>
            ) : null}
            {address}
          </p>
        </div>
      )}
    </li>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AccountOrders({ orders }: { orders: AccountOrderListItem[] }) {
  if (orders.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-6 py-14 text-center">
        <p className="text-sm font-medium text-stone-600">Nenhum pedido ainda</p>
        <p className="mt-1 text-xs text-stone-400">Seus pedidos aparecerão aqui depois da compra.</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
        >
          Ver produtos
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-5">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </ul>
  );
}
