"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatPrice } from "@/lib/format";
import { formatDeliveryDaysLabel } from "@/lib/shipping/delivery-days-label";
import { SUPERFRETE_STATUS_LABELS } from "@/lib/shipping/service-id";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import {
  hasLabelAutoGenerateError,
  labelAutoGenerateErrorTooltip,
  LabelAutoGenerateWarningIcon,
} from "@/components/admin/LabelPendingBanner";

type ShipmentOrder = {
  id: string;
  orderNumber: number | null;
  status: string;
  email: string;
  shippingServiceName: string | null;
  shippingServiceId: number | null;
  shippingStatus: string;
  superfreteStatus: string | null;
  trackingCode: string | null;
  recipientName: string | null;
  superfreteShipmentId: string | null;
  labelUrl: string | null;
  labelGeneratedAt: string | null;
  labelAutoGenerateError: string | null;
  paidAt: string | null;
  createdAt: string;
  shippingQuotedPrice: number | null;
  shippingDeliveryDaysMin: number | null;
  shippingDeliveryDaysMax: number | null;
  superfreteShippingPrice: number | null;
};

const COL_COUNT = 8;

type FilterKey = "all" | "needs_label" | "packed" | "shipped" | "delivered" | "cancelled";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "needs_label", label: "Sem etiqueta" },
  { key: "packed", label: "Aguardando postagem" },
  { key: "shipped", label: "Postados" },
  { key: "delivered", label: "Entregues" },
  { key: "cancelled", label: "Etiqueta cancelada" },
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

type QuoteResponse = {
  current?: {
    shippingServiceId: number | null;
    shippingServiceName: string | null;
    shippingQuotedPrice: number | null;
    destinationCep: string | null;
  };
  options: NormalizedShippingOption[];
  error?: string;
};

function ChangeShippingModal({
  order,
  onClose,
  onSaved,
}: {
  order: ShipmentOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<NormalizedShippingOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentServiceId, setCurrentServiceId] = useState<number | null>(
    order.shippingServiceId
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/orders/${order.id}/shipping/quote`);
        const data = (await res.json()) as QuoteResponse;
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "Erro ao cotar frete.");
          return;
        }
        if (cancelled) return;
        setOptions(data.options ?? []);
        setCurrentServiceId(data.current?.shippingServiceId ?? order.shippingServiceId);
        const current = data.options?.find(
          (o) => o.serviceId === (data.current?.shippingServiceId ?? order.shippingServiceId)
        );
        setSelectedId(current?.id ?? data.options?.[0]?.id ?? null);
      } catch {
        if (!cancelled) setError("Erro de conexão.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id, order.shippingServiceId]);

  async function save() {
    if (!selectedId) {
      setError("Selecione uma modalidade de frete.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/shipping`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId: selectedId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erro ao alterar frete.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  const recipient = order.recipientName?.trim() || order.email.split("@")[0] || "—";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-stone-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-stone-100 px-5 py-4">
          <h3 className="text-base font-semibold text-stone-900">Alterar modalidade de frete</h3>
          <p className="mt-1 text-sm text-stone-500">
            Pedido {orderNumberLabel(order)} · {recipient}
          </p>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-stone-400">Consultando opções…</p>
          ) : options.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">Nenhuma opção de frete disponível.</p>
          ) : (
            <ul className="space-y-2">
              {options.map((opt) => {
                const isCurrent = opt.serviceId === currentServiceId;
                const isSelected = selectedId === opt.id;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(opt.id)}
                      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? "border-stone-900 bg-stone-50 ring-1 ring-stone-900"
                          : "border-stone-200 hover:border-stone-300 hover:bg-stone-50/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-stone-900">
                            {opt.carrierName} — {opt.serviceName}
                          </p>
                          <p className="mt-0.5 text-xs text-stone-500">
                            {formatDeliveryDaysLabel(opt.deliveryDaysMin, opt.deliveryDaysMax)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold tabular-nums text-stone-900">
                            {formatPrice(opt.price)}
                          </p>
                          {isCurrent && (
                            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-400">
                              Atual
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-stone-100 px-5 py-4">
          <button
            type="button"
            disabled={saving || loading || !options.length}
            onClick={() => void save()}
            className="flex-1 rounded-lg bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Confirmar frete"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
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
  selected,
  onToggleSelect,
  onChangeShipping,
}: {
  order: ShipmentOrder;
  onRefresh: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  onChangeShipping: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localTracking, setLocalTracking] = useState<string | null>(null);
  const [awaitingTracking, setAwaitingTracking] = useState(false);
  const isSaleCancelled = order.status === "cancelled";
  const canSelectForBulk = !order.labelUrl && !isSaleCancelled;
  const canChangeShipping = !order.labelUrl && !order.superfreteShipmentId && !isSaleCancelled;
  const canGenerateLabel = !order.labelUrl && !isSaleCancelled;
  const labelAutoGenerateFailed = hasLabelAutoGenerateError(order);
  const labelAutoGenerateTitle = labelAutoGenerateErrorTooltip(order);

  async function pollTrackingUntilReady(attemptsLeft = 8) {
    if (attemptsLeft <= 0) {
      setAwaitingTracking(false);
      return;
    }
    try {
      const syncRes = await fetch(`/api/admin/orders/${order.id}/shipment/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quick: true }),
      });
      if (syncRes.ok) {
        const syncData = (await syncRes.json()) as { tracking?: string | null };
        if (syncData.tracking) {
          setLocalTracking(syncData.tracking);
          setAwaitingTracking(false);
          onRefresh();
          return;
        }
      }
    } catch {
      /* retry */
    }
    window.setTimeout(() => void pollTrackingUntilReady(attemptsLeft - 1), 2000);
  }

  async function runAction(
    key: string,
    url: string,
    method = "POST",
    body?: unknown,
    opts?: { openPdf?: boolean }
  ) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as {
        error?: string;
        labelUrl?: string;
        shipmentId?: string;
        tracking?: string | null;
      };
      if (!res.ok) {
        setError(data.error ?? "Erro na operação.");
        return;
      }
      if (opts?.openPdf !== false && data.shipmentId) {
        window.open(`/api/admin/orders/${order.id}/label/pdf`, "_blank");
      }
      if (data.tracking) {
        setLocalTracking(data.tracking);
        setAwaitingTracking(false);
      }
      onRefresh();
      if (key === "label" && !data.tracking) {
        setAwaitingTracking(true);
        void pollTrackingUntilReady();
      }
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
  const trackingCode = localTracking ?? order.trackingCode;

  return (
    <tr className="border-b border-stone-100 align-top">
      <td className="py-3 pl-4 pr-1">
        <input
          type="checkbox"
          checked={selected}
          disabled={!canSelectForBulk}
          title={canSelectForBulk ? "Selecionar para gerar etiqueta" : "Etiqueta já gerada"}
          onChange={onToggleSelect}
          className="h-4 w-4 rounded border-stone-300 accent-stone-900 disabled:opacity-30"
        />
      </td>
      <td className="py-3 pr-2">
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
        {trackingCode ? (
          <a
            href={trackingUrl(trackingCode)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-800 underline decoration-stone-300 underline-offset-2 hover:text-stone-950"
          >
            {trackingCode}
          </a>
        ) : order.labelUrl || order.superfreteShipmentId || awaitingTracking ? (
          <span className="text-stone-400">Aguardando…</span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-3 text-sm tabular-nums text-stone-800 whitespace-nowrap">
        {freightPrice != null ? formatPrice(freightPrice) : "—"}
      </td>
      <td className="py-3 pl-2 pr-4">
        <div className="flex flex-wrap items-center gap-1.5 justify-end">
          {canChangeShipping && (
            <>
              {labelAutoGenerateFailed && (
                <LabelAutoGenerateWarningIcon title={labelAutoGenerateTitle} />
              )}
              <ActionButton disabled={!!busy} onClick={onChangeShipping}>
                Alterar frete
              </ActionButton>
            </>
          )}
          {!canGenerateLabel && isSaleCancelled && !order.labelUrl && (
            <span className="text-[11px] text-stone-400">Venda cancelada</span>
          )}
          {canGenerateLabel && (
            <ActionButton
              disabled={!!busy}
              onClick={() =>
                runAction("label", `/api/admin/orders/${order.id}/label`, "POST", undefined, {
                  openPdf: true,
                })
              }
            >
              {busy === "label"
                ? "Gerando…"
                : order.shippingStatus === "cancelled"
                  ? "Gerar nova etiqueta"
                  : "Gerar etiqueta"}
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
  const [filter, setFilter] = useState<FilterKey>("all");
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [shippingModalOrder, setShippingModalOrder] = useState<ShipmentOrder | null>(null);
  const allRef = useRef<HTMLInputElement>(null);

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
    setSelectedIds(new Set());
    setBulkMsg(null);
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

  useEffect(() => {
    if (!allRef.current) return;
    const selectable = orders.filter((o) => !o.labelUrl && o.status !== "cancelled");
    const n = selectedIds.size;
    allRef.current.indeterminate = n > 0 && n < selectable.length;
    allRef.current.checked = n === selectable.length && selectable.length > 0;
  }, [selectedIds, orders]);

  const refreshAll = () => {
    void fetchShipments();
    void fetchWallet();
  };

  const selectableOrders = orders.filter((o) => !o.labelUrl && o.status !== "cancelled");
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => {
    const ids = selectableOrders.map((o) => o.id);
    setSelectedIds(selectedIds.size === ids.length ? new Set() : new Set(ids));
  };

  async function bulkGenerateLabels() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkLoading(true);
    setBulkMsg(null);
    try {
      const res = await fetch("/api/admin/shipments/labels/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: ids }),
      });
      const data = (await res.json()) as {
        okCount?: number;
        failCount?: number;
        error?: string;
      };
      if (!res.ok) {
        setBulkMsg(data.error ?? "Erro ao gerar etiquetas.");
        return;
      }
      setBulkMsg(
        `${data.okCount ?? 0} etiqueta(s) gerada(s)` +
          (data.failCount ? ` · ${data.failCount} falha(s)` : "")
      );
      refreshAll();
    } catch {
      setBulkMsg("Erro de conexão.");
    } finally {
      setBulkLoading(false);
    }
  }

  const needsLabel = orders.filter((o) => !o.labelUrl).length;
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

      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3">
          <span className="text-sm font-medium text-stone-700">
            {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            disabled={bulkLoading}
            onClick={() => void bulkGenerateLabels()}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {bulkLoading ? "Gerando etiquetas…" : "Gerar etiquetas selecionadas"}
          </button>
          {bulkLoading && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
          )}
          {bulkMsg && <span className="text-xs text-stone-500">{bulkMsg}</span>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              <th className="w-10 py-3 pl-4 pr-1">
                <input
                  ref={allRef}
                  type="checkbox"
                  aria-label="Selecionar todos sem etiqueta"
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-stone-300 accent-stone-900"
                />
              </th>
              <th className="py-3 pr-2 text-left">Pedido</th>
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
                <ShipmentRow
                  key={order.id}
                  order={order}
                  onRefresh={refreshAll}
                  selected={selectedIds.has(order.id)}
                  onToggleSelect={() => toggleSelect(order.id)}
                  onChangeShipping={() => setShippingModalOrder(order)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {shippingModalOrder && (
        <ChangeShippingModal
          order={shippingModalOrder}
          onClose={() => setShippingModalOrder(null)}
          onSaved={refreshAll}
        />
      )}
    </div>
  );
}
