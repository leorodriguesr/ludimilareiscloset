"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatPrice } from "@/lib/format";
import { formatDeliveryDaysLabel } from "@/lib/shipping/delivery-days-label";
import { SUPERFRETE_STATUS_LABELS } from "@/lib/shipping/service-id";

type ShipmentOrder = {
  id: string;
  orderNumber: number | null;
  email: string;
  shippingServiceName: string | null;
  shippingStatus: string;
  superfreteStatus: string | null;
  trackingCode: string | null;
  recipientName: string | null;
  superfreteShipmentId: string | null;
  labelUrl: string | null;
  labelGeneratedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  shippingQuotedPrice: number | null;
  shippingDeliveryDaysMin: number | null;
  shippingDeliveryDaysMax: number | null;
  superfreteShippingPrice: number | null;
};

const COL_COUNT = 7;

type FilterKey = "all" | "needs_label" | "packed" | "shipped" | "delivered" | "cancelled";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "needs_label", label: "Sem etiqueta" },
  { key: "packed", label: "Aguardando postagem" },
  { key: "shipped", label: "Postados" },
  { key: "delivered", label: "Entregues" },
  { key: "cancelled", label: "Cancelados" },
];

const SHIPPING_LABELS: Record<string, string> = {
  to_pack: "Por embalar",
  packed: "Embalado",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

function fmtOrderDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function orderNumberLabel(o: ShipmentOrder) {
  return o.orderNumber != null ? `#${o.orderNumber}` : o.id.slice(0, 8);
}

function chosenShippingPrice(order: ShipmentOrder): number | null {
  if (order.shippingQuotedPrice != null && order.shippingQuotedPrice >= 0) {
    return order.shippingQuotedPrice;
  }
  if (order.superfreteShippingPrice != null && order.superfreteShippingPrice >= 0) {
    return order.superfreteShippingPrice;
  }
  return null;
}

function trackingUrl(code: string) {
  return `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(code)}`;
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  const cls =
    variant === "danger"
      ? "border-red-200 text-red-700 hover:bg-red-50"
      : "border-stone-300 text-stone-700 hover:bg-stone-50";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border bg-white px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

function ShipmentRow({
  order,
  onRefresh,
}: {
  order: ShipmentOrder;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(
    key: string,
    url: string,
    method = "POST",
    body?: unknown
  ) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as { error?: string; labelUrl?: string; shipmentId?: string };
      if (!res.ok) {
        setError(data.error ?? "Erro na operação.");
        return;
      }
      if (data.labelUrl || data.shipmentId) {
        window.open(`/api/admin/orders/${order.id}/label/pdf`, "_blank");
      }
      onRefresh();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setBusy(null);
    }
  }

  const sfLabel =
    (order.superfreteStatus && SUPERFRETE_STATUS_LABELS[order.superfreteStatus]) ||
    order.superfreteStatus;

  const freightPrice = chosenShippingPrice(order);
  const deliveryLabel = formatDeliveryDaysLabel(
    order.shippingDeliveryDaysMin,
    order.shippingDeliveryDaysMax
  );
  const recipient = order.recipientName?.trim() || order.email.split("@")[0] || "—";

  return (
    <tr className="border-b border-stone-100 align-top">
      <td className="py-3 pl-4 pr-2">
        <p className="font-mono font-semibold text-stone-900">{orderNumberLabel(order)}</p>
        <p className="mt-0.5 text-[10px] text-stone-400">
          {SHIPPING_LABELS[order.shippingStatus] ?? order.shippingStatus}
        </p>
      </td>
      <td className="px-2 py-3 text-sm text-stone-700 whitespace-nowrap">
        {fmtOrderDate(order.createdAt)}
      </td>
      <td className="px-2 py-3 text-sm text-stone-700">
        <p>{deliveryLabel}</p>
        {order.shippingServiceName && (
          <p className="mt-0.5 text-xs text-stone-400 truncate max-w-[140px]" title={order.shippingServiceName}>
            {order.shippingServiceName}
          </p>
        )}
      </td>
      <td className="px-2 py-3 text-sm text-stone-800">
        <p className="font-medium truncate max-w-[160px]" title={recipient}>
          {recipient}
        </p>
        <p className="mt-0.5 text-xs text-stone-400 truncate max-w-[160px]" title={order.email}>
          {order.email}
        </p>
      </td>
      <td className="px-2 py-3 text-sm font-mono text-stone-700">
        {order.trackingCode ? (
          <a
            href={trackingUrl(order.trackingCode)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-800 underline decoration-stone-300 underline-offset-2 hover:text-stone-950"
          >
            {order.trackingCode}
          </a>
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-3 text-sm tabular-nums text-stone-800 whitespace-nowrap">
        {freightPrice != null ? formatPrice(freightPrice) : "—"}
      </td>
      <td className="py-3 pl-2 pr-4">
        <div className="flex flex-wrap gap-1.5 justify-end">
          {!order.labelUrl && order.shippingStatus !== "cancelled" && (
            <ActionButton
              disabled={!!busy}
              onClick={() => runAction("label", `/api/admin/orders/${order.id}/label`)}
            >
              {busy === "label" ? "Gerando…" : "Gerar etiqueta"}
            </ActionButton>
          )}
          {order.labelUrl && (
            <a
              href={`/api/admin/orders/${order.id}/label/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              Etiqueta
            </a>
          )}
          {order.superfreteShipmentId && (
            <>
              <ActionButton
                disabled={!!busy}
                onClick={() =>
                  runAction("print", `/api/admin/orders/${order.id}/shipment/print`)
                }
              >
                {busy === "print" ? "…" : "Reimprimir"}
              </ActionButton>
              <ActionButton
                disabled={!!busy}
                onClick={() =>
                  runAction("sync", `/api/admin/orders/${order.id}/shipment/sync`)
                }
              >
                {busy === "sync" ? "…" : "Sincronizar"}
              </ActionButton>
              {order.shippingStatus !== "cancelled" && (
                <ActionButton
                  disabled={!!busy}
                  variant="danger"
                  onClick={() => {
                    if (!confirm("Cancelar etiqueta na SuperFrete?")) return;
                    runAction("cancel", `/api/admin/orders/${order.id}/shipment/cancel`, "POST", {
                      reason: "Cancelado pelo administrador",
                    });
                  }}
                >
                  {busy === "cancel" ? "…" : "Cancelar"}
                </ActionButton>
              )}
            </>
          )}
        </div>
        {error && (
          <p className="mt-2 text-right text-[11px] text-red-600">{error}</p>
        )}
        {sfLabel && (
          <p className="mt-1 text-right text-[10px] text-stone-400">{sfLabel}</p>
        )}
        <p className="mt-1 text-right text-[10px] text-stone-400">
          Pago {fmtDateTime(order.paidAt)}
          {order.labelGeneratedAt && ` · Etiqueta ${fmtDateTime(order.labelGeneratedAt)}`}
        </p>
      </td>
    </tr>
  );
}

type WalletInfo = {
  balance: number;
  shipmentsPending: number;
  shipmentsAvailable: number;
  walletUrl: string;
  accountEmail?: string;
  environment?: "sandbox" | "production";
  environmentLabel?: string;
};

export function ShippingManager() {
  const [orders, setOrders] = useState<ShipmentOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("needs_label");
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const res = await fetch("/api/admin/superfrete/wallet");
      const data = (await res.json()) as WalletInfo & { error?: string };
      if (!res.ok) {
        setWallet(null);
        setWalletError(data.error ?? "Não foi possível consultar o saldo.");
        return;
      }
      setWallet(data);
    } catch {
      setWallet(null);
      setWalletError("Erro de conexão ao consultar saldo.");
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter === "all" ? "" : `?filter=${filter}`;
      const res = await fetch(`/api/admin/shipments${qs}`);
      const data = (await res.json()) as {
        orders?: ShipmentOrder[];
        total?: number;
        error?: string;
      };
      if (!res.ok) {
        console.error(data.error);
        setOrders([]);
        setTotal(0);
        return;
      }
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchShipments();
  }, [fetchShipments]);

  useEffect(() => {
    void fetchWallet();
  }, [fetchWallet]);

  const refreshAll = () => {
    void fetchShipments();
    void fetchWallet();
  };

  const needsLabel = orders.filter((o) => !o.labelUrl && o.shippingStatus !== "cancelled").length;
  const lowBalance = wallet != null && wallet.balance < 20;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-stone-900">Envios</h2>
          <p className="mt-1 text-sm text-stone-500">
            Operação de expedição: etiquetas, rastreio e status SuperFrete.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="self-start rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Atualizar
        </button>
      </div>

      <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
        {wallet?.environment === "sandbox" && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="font-semibold">Modo Sandbox</span> — cotações e etiquetas são de teste.
            Recarregue saldo em{" "}
            <a
              href="https://sandbox.superfrete.com/#/account/credits"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-amber-950"
            >
              sandbox.superfrete.com
            </a>
            {" "}(Pix simulado: copie o código e cole na barra do navegador).
          </div>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                Saldo SuperFrete
              </p>
              {wallet?.environmentLabel && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    wallet.environment === "sandbox"
                      ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                      : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  }`}
                >
                  {wallet.environmentLabel}
                </span>
              )}
            </div>
            {walletLoading ? (
              <p className="mt-1 text-sm text-stone-400">Consultando…</p>
            ) : walletError ? (
              <p className="mt-1 text-sm text-red-600">{walletError}</p>
            ) : wallet ? (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">
                  {formatPrice(wallet.balance)}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  Etiquetas aguardando postagem: {wallet.shipmentsPending}
                  {wallet.shipmentsAvailable > 0 && (
                    <> · limite disponível: {wallet.shipmentsAvailable}</>
                  )}
                </p>
                {lowBalance && (
                  <p className="mt-2 text-xs text-amber-700">
                    Saldo baixo — recarregue antes de gerar novas etiquetas.
                  </p>
                )}
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {wallet?.walletUrl && (
              <a
                href={wallet.walletUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
              >
                Adicionar saldo
              </a>
            )}
            <button
              type="button"
              onClick={() => void fetchWallet()}
              disabled={walletLoading}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              Atualizar saldo
            </button>
          </div>
        </div>
        <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-400">
          A recarga é feita no painel SuperFrete (Pix ou cartão). A API não permite adicionar saldo
          diretamente — use o botão acima para abrir a carteira.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
            Total (filtro)
          </p>
          <p className="mt-1 text-xl font-semibold text-stone-900">{total}</p>
        </div>
        {filter !== "needs_label" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">
              Sem etiqueta (página)
            </p>
            <p className="mt-1 text-xl font-semibold text-amber-900">{needsLabel}</p>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? "bg-stone-900 text-white"
                : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              <th className="py-3 pl-4 pr-2 text-left">Pedido</th>
              <th className="px-2 py-3 text-left">Data</th>
              <th className="px-2 py-3 text-left">Prazo</th>
              <th className="px-2 py-3 text-left">Destinatário</th>
              <th className="px-2 py-3 text-left">Rastreio</th>
              <th className="px-2 py-3 text-left">Valor frete</th>
              <th className="py-3 pl-2 pr-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COL_COUNT} className="py-12 text-center text-stone-400">
                  Carregando…
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="py-12 text-center text-stone-400">
                  Nenhum envio neste filtro.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <ShipmentRow key={order.id} order={order} onRefresh={refreshAll} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
