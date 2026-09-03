"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { formatPrice } from "@/lib/format";
import {
  EXCHANGE_BALANCE_STATUS_LABELS,
  EXCHANGE_DISPOSITION_LABELS,
  EXCHANGE_KIND_LABELS,
  EXCHANGE_PAID_BY_LABELS,
  EXCHANGE_REASON_LABELS,
  EXCHANGE_STATUS_LABELS,
} from "@/lib/exchanges/constants";
import {
  EXCHANGE_RETURN_METHOD_LABELS,
  EXCHANGE_SHIPPING_METHOD_LABELS,
  defaultExchangeShippingMethodForOrder,
  isLocalExchangeShippingMethod,
} from "@/lib/exchanges/shipping-method";
import { ExchangeWizard } from "@/components/admin/ExchangeWizard";
import { ExchangeOutboundPlanner } from "@/components/admin/ExchangeOutboundPlanner";
import { ExchangeInspectModal } from "@/components/admin/ExchangeInspectModal";
import { ExchangeReverseModal } from "@/components/admin/ExchangeReverseModal";
import { ExchangeRefundModal } from "@/components/admin/ExchangeRefundModal";
import { ExchangeChargeModal } from "@/components/admin/ExchangeChargeModal";
import type {
  ExchangeItemDisposition,
  ExchangeKind,
  ExchangeShippingMethod,
  ExchangeStatus,
} from "@/app/generated/prisma/client";

type ExchangeItemRow = {
  id: string;
  direction: "RETURN" | "OUTBOUND";
  productName: string;
  productImageUrl?: string | null;
  pieceSelectionsJson?: string | null;
  orderItemId?: string | null;
  productId?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  disposition: ExchangeItemDisposition | null;
  stockRestored: boolean;
  stockDebited: boolean;
};

type ExchangeShippingRow = {
  id: string;
  type: "RETURN" | "OUTBOUND";
  method?: ExchangeShippingMethod | null;
  shippingServiceName: string | null;
  shippingServiceId: number | null;
  quotedPrice: number | null;
  cost: number | null;
  paidBy: keyof typeof EXCHANGE_PAID_BY_LABELS;
  trackingCode: string | null;
  postingLocationName?: string | null;
  postingLocationAddress?: string | null;
  postingLocationMapsUrl?: string | null;
  manualConfiguredAt?: string | null;
  labelUrl: string | null;
  shippingStatus: string;
  superfreteShipmentId: string | null;
};

type ExchangeListItem = {
  id: string;
  exchangeNumber: number | null;
  kind: ExchangeKind;
  status: ExchangeStatus;
  reason: keyof typeof EXCHANGE_REASON_LABELS;
  balanceAmount: number;
  balanceStatus: keyof typeof EXCHANGE_BALANCE_STATUS_LABELS;
  inspectedAt: string | null;
  createdAt: string;
  returnedItemsTotal?: number;
  order: {
    id: string;
    orderNumber: number | null;
    recipientName: string | null;
    email: string | null;
    destinationCep?: string | null;
    fulfillmentType?: string | null;
    shippingServiceName?: string | null;
    deliveryNotes?: string | null;
    items?: {
      id: string;
      productName: string;
      productImageUrl?: string | null;
      pieceSelectionsJson?: string | null;
      quantity?: number;
    }[];
  };
  items: ExchangeItemRow[];
  shippings: ExchangeShippingRow[];
};

type ExchangeDetail = ExchangeListItem & {
  reasonNotes: string | null;
  notes: string | null;
  returnedItemsTotal: number;
  newItemsTotal: number;
  productsDelta: number;
  shippingCustomerTotal: number;
  receivedAt: string | null;
  completedAt: string | null;
  events: {
    id: string;
    type: string;
    createdAt: string;
    payloadJson: string | null;
  }[];
  openedBy?: { id: string; name: string } | null;
};

type PaymentResult =
  | {
      type: "pix";
      pixCode: string;
      pixQrBase64: string | null;
      expiresAt: string;
      amount: number;
    }
  | { type: "card"; checkoutUrl: string; amount: number };

function outboundInitialMethod(
  exchange: ExchangeListItem
): ExchangeShippingMethod {
  const returnShip = exchange.shippings.find((s) => s.type === "RETURN");
  if (
    returnShip?.method === "STORE_PICKUP" ||
    returnShip?.method === "LOCAL_COURIER" ||
    returnShip?.method === "CARRIER"
  ) {
    return returnShip.method;
  }
  return defaultExchangeShippingMethodForOrder(exchange.order);
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Criada",
  REVERSE_LABEL_GENERATED: "Etiqueta reversa",
  RETURN_MANUAL_REGISTERED: "Reversa manual",
  RETURN_POSTED: "Cliente postou",
  RECEIVED: "Peça conferida",
  INSPECTED: "Conferência",
  STOCK_RESTORED: "Estoque restaurado",
  STOCK_DEBITED: "Estoque debitado",
  OUTBOUND_LABEL_GENERATED: "Etiqueta de reenvio",
  BALANCE_UPDATED: "Saldo atualizado",
  BALANCE_PAID: "Diferença paga",
  BALANCE_WAIVED: "Saldo dispensado",
  BALANCE_REFUND_MARKED: "Reembolso marcado",
  PAYMENT_LINK_CREATED: "Link de pagamento",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  NOTE_ADDED: "Nota",
};

type FilterKey = ExchangeStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "AWAITING_RETURN", label: "Aguardando" },
  { key: "RETURN_IN_TRANSIT", label: "Trânsito" },
  { key: "RECEIVED", label: "Peça conferida" },
  { key: "READY_OUTBOUND", label: "Reenvio" },
  { key: "OUTBOUND", label: "Reenvio andamento" },
  { key: "COMPLETED", label: "Concluídas" },
  { key: "CANCELLED", label: "Canceladas" },
];

const EXCHANGE_TOOLBAR_SIZE =
  "box-border h-9 text-sm font-medium leading-none sm:h-8";
const EXCHANGE_TOOLBAR_CONTROL = `${EXCHANGE_TOOLBAR_SIZE} rounded-lg border px-3 sm:px-3.5`;

const DRAWER_MS = 300;

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function balanceLabel(amount: number) {
  if (amount > 0.009) return `Deve ${formatPrice(amount)}`;
  if (amount < -0.009) return `Crédito ${formatPrice(Math.abs(amount))}`;
  return "Zerado";
}

function trackingUrl(code: string) {
  return `https://rastreamento.superfrete.com/#${encodeURIComponent(code)}`;
}

function returnShippingOf(ex: {
  shippings: ExchangeShippingRow[];
}): ExchangeShippingRow | null {
  return ex.shippings.find((s) => s.type === "RETURN") ?? null;
}

function hasManualReverse(ship: ExchangeShippingRow | null): boolean {
  if (!ship) return false;
  return Boolean(
    ship.trackingCode ||
      ship.postingLocationAddress ||
      ship.labelUrl ||
      ship.manualConfiguredAt
  );
}

function isLocalReturn(ship: ExchangeShippingRow | null): boolean {
  return isLocalExchangeShippingMethod(ship?.method);
}

function returnMethodLabel(ship: ExchangeShippingRow | null): string {
  if (!ship?.method) return "—";
  return EXCHANGE_RETURN_METHOD_LABELS[ship.method];
}

function exchangeStatusLabel(ex: {
  status: ExchangeStatus;
  balanceStatus?: string;
  items?: { direction: string }[];
  shippings: ExchangeShippingRow[];
}): string {
  if (
    ex.status === "RECEIVED" &&
    ex.balanceStatus === "PENDING" &&
    (ex.items ?? []).some((item) => item.direction === "OUTBOUND")
  ) {
    return "Aguardando pagamento";
  }
  if (ex.status === "AWAITING_RETURN") {
    const ship = returnShippingOf(ex);
    if (!isLocalReturn(ship) && !hasManualReverse(ship)) {
      return "Aguardando reverso";
    }
  }
  return EXCHANGE_STATUS_LABELS[ex.status];
}

const LIST_BTN =
  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40";
const LIST_BTN_PRIMARY = `${LIST_BTN} border-stone-900 bg-stone-900 text-white hover:bg-stone-800`;
const LIST_BTN_SOFT = `${LIST_BTN} border-stone-200 bg-white text-stone-700 hover:bg-stone-50`;
const LIST_BTN_OK = `${LIST_BTN} border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800`;

export function ExchangeManager() {
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [exchanges, setExchanges] = useState<ExchangeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardEditId, setWizardEditId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExchangeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [manualReturnId, setManualReturnId] = useState<string | null>(null);
  const [outboundId, setOutboundId] = useState<string | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(
    null
  );
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/exchanges");
      const data = (await res.json()) as { exchanges?: ExchangeListItem[] };
      setExchanges(Array.isArray(data.exchanges) ? data.exchanges : []);
    } catch {
      setExchanges([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/exchanges/${id}`);
      const data = (await res.json()) as { exchange?: ExchangeDetail };
      if (data.exchange) {
        setDetail(data.exchange);
      } else {
        setDetail(null);
      }
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {
      setDetail(null);
      setPaymentResult(null);
    }
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!chargeId || !paymentResult) return;
    const timer = window.setInterval(() => {
      void (async () => {
        await loadList();
        const res = await fetch(`/api/admin/exchanges/${chargeId}`);
        const data = (await res.json()) as { exchange?: ExchangeDetail };
        if (data.exchange?.balanceStatus && data.exchange.balanceStatus !== "PENDING") {
          setPaymentResult(null);
          setChargeId(null);
          await loadList();
          if (selectedId === chargeId) await loadDetail(chargeId);
        }
      })();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [chargeId, paymentResult, loadList, loadDetail, selectedId]);

  useEffect(() => {
    if (!chargeId) return;
    let cancelled = false;
    setPaymentLoading(true);
    setActionError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/exchanges/${chargeId}/payment`);
        const data = (await res.json()) as {
          payment?: PaymentResult | null;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setActionError(
            data.error ?? "Não foi possível consultar o pagamento."
          );
          return;
        }
        setPaymentResult(data.payment ?? null);
      } catch {
        if (!cancelled) {
          setActionError("Erro de rede ao consultar pagamento.");
        }
      } finally {
        if (!cancelled) setPaymentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chargeId]);

  async function runAction(
    path: string,
    body?: Record<string, unknown>,
    exchangeId?: string
  ): Promise<boolean> {
    const id = exchangeId ?? selectedId;
    if (!id) return false;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/exchanges/${id}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as {
        exchange?: ExchangeDetail;
        error?: string;
      };
      if (!res.ok) {
        setActionError(data.error ?? "Falha na ação.");
        if (exchangeId) window.alert(data.error ?? "Falha na ação.");
        return false;
      }
      if (data.exchange && selectedId === id) {
        setDetail(data.exchange);
      }
      await loadList();
      return true;
    } catch {
      setActionError("Erro de rede.");
      if (exchangeId) window.alert("Erro de rede.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function generatePayment(paymentMethod: "pix" | "card") {
    const id = chargeId ?? selectedId;
    if (!id) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/exchanges/${id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod }),
      });
      const data = (await res.json()) as PaymentResult & { error?: string };
      if (!res.ok || data.error) {
        setActionError(data.error ?? "Não foi possível gerar o pagamento.");
        return;
      }
      if (data.type === "pix") {
        setPaymentResult({
          type: "pix",
          pixCode: data.pixCode,
          pixQrBase64: data.pixQrBase64,
          expiresAt: data.expiresAt,
          amount: data.amount,
        });
      } else if (data.type === "card") {
        setPaymentResult({
          type: "card",
          checkoutUrl: data.checkoutUrl,
          amount: data.amount,
        });
      }
      await loadDetail(id);
      await loadList();
    } catch {
      setActionError("Erro de rede ao gerar pagamento.");
    } finally {
      setBusy(false);
    }
  }

  const returnItems = useMemo(
    () => detail?.items.filter((i) => i.direction === "RETURN") ?? [],
    [detail]
  );
  const outboundItems = useMemo(
    () => detail?.items.filter((i) => i.direction === "OUTBOUND") ?? [],
    [detail]
  );

  const filterCounts = useMemo(() => {
    const counts = Object.fromEntries(
      FILTERS.map((f) => [f.key, 0])
    ) as Record<FilterKey, number>;
    for (const ex of exchanges) {
      if (ex.status in counts) counts[ex.status as FilterKey] += 1;
    }
    return counts;
  }, [exchanges]);

  const visibleExchanges = useMemo(
    () =>
      filter ? exchanges.filter((ex) => ex.status === filter) : exchanges,
    [exchanges, filter]
  );

  const inspectTarget =
    exchanges.find((ex) => ex.id === inspectId) ??
    (detail?.id === inspectId ? detail : null);
  const outboundTarget =
    exchanges.find((ex) => ex.id === outboundId) ??
    (detail?.id === outboundId ? detail : null);
  const refundTarget =
    exchanges.find((ex) => ex.id === refundId) ??
    (detail?.id === refundId ? detail : null);
  const chargeTarget =
    exchanges.find((ex) => ex.id === chargeId) ??
    (detail?.id === chargeId ? detail : null);

  function toggleFilter(key: FilterKey) {
    setFilter((current) => (current === key ? null : key));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Trocas</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            {loading
              ? "Carregando…"
              : filter
                ? `${visibleExchanges.length} de ${exchanges.length} registro${exchanges.length !== 1 ? "s" : ""}`
                : `${exchanges.length} registro${exchanges.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setWizardEditId(null);
              setWizardOpen(true);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-sky-100 px-3 text-xs font-semibold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 ${EXCHANGE_TOOLBAR_SIZE}`}
          >
            Nova troca / devolução
          </button>
          <button
            type="button"
            onClick={() => void loadList()}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-50 ${EXCHANGE_TOOLBAR_SIZE}`}
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleFilter(key)}
            className={`inline-flex shrink-0 items-center gap-2 transition-colors ${EXCHANGE_TOOLBAR_CONTROL} ${
              filter === key
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50"
            }`}
          >
            <span>{label}</span>
            <span
              className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm border px-1 text-[11px] font-semibold tabular-nums ${
                filter === key
                  ? "border-white/25 bg-white/10 text-white"
                  : "border-stone-200 bg-stone-100 text-stone-700"
              }`}
            >
              {filterCounts[key]}
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-4 text-sm text-stone-500">Carregando…</p>
        ) : visibleExchanges.length === 0 ? (
          <p className="p-4 text-sm text-stone-500">
            {filter
              ? "Nenhum registro neste filtro."
              : "Nenhum registro encontrado."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80 text-xs font-medium text-stone-500">
                  <th className="px-4 py-3 text-left">Nº</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Reembolso</th>
                  <th className="px-4 py-3 text-left">Devolução</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleExchanges.map((ex) => {
                  const retShip = returnShippingOf(ex);
                  const localReturn = isLocalReturn(retShip);
                  const hasReverse = hasManualReverse(retShip);
                  const canCreateReverse =
                    !localReturn &&
                    !hasReverse &&
                    ex.status !== "CANCELLED" &&
                    ex.status !== "COMPLETED";
                  const canInspect =
                    (hasReverse || localReturn) &&
                    !ex.inspectedAt &&
                    ex.status !== "CANCELLED" &&
                    ex.status !== "COMPLETED";
                  const canEdit =
                    ex.status !== "CANCELLED" &&
                    ex.status !== "COMPLETED" &&
                    !ex.inspectedAt;
                  const canCancel =
                    !ex.inspectedAt &&
                    ex.status !== "CANCELLED" &&
                    ex.status !== "COMPLETED";
                  const canRefund =
                    !!ex.inspectedAt &&
                    ex.balanceStatus === "CREDIT_PENDING";
                  const canCharge =
                    !!ex.inspectedAt && ex.balanceStatus === "PENDING";
                  const canDefineOutbound =
                    ex.kind === "EXCHANGE" &&
                    !!ex.inspectedAt &&
                    !ex.items.some((i) => i.direction === "OUTBOUND") &&
                    ex.status !== "CANCELLED" &&
                    ex.status !== "COMPLETED";
                  const primaryAction = canCreateReverse
                    ? {
                        label: "Criar reverso",
                        className: LIST_BTN_PRIMARY,
                        onClick: () => setManualReturnId(ex.id),
                      }
                    : canInspect
                      ? {
                          label: "Conferir peça",
                          className: LIST_BTN_OK,
                          disabled: busy,
                          onClick: () => setInspectId(ex.id),
                        }
                      : canDefineOutbound
                        ? {
                            label: "Definir novo envio",
                            className: LIST_BTN_PRIMARY,
                            onClick: () => setOutboundId(ex.id),
                          }
                        : canRefund
                          ? {
                              label: "Devolver dinheiro",
                              className: LIST_BTN_PRIMARY,
                              disabled: busy,
                              onClick: () => setRefundId(ex.id),
                            }
                          : canCharge
                            ? {
                                label: "Cobrar cliente",
                                className: LIST_BTN_PRIMARY,
                                disabled: busy,
                                onClick: () => {
                                  setChargeId(ex.id);
                                  setPaymentResult(null);
                                },
                              }
                            : null;
                  const menuItems: ExchangeMenuItem[] = [
                    ...(canEdit
                      ? [
                          {
                            id: "edit",
                            label: "Editar",
                            icon: ICONS.edit,
                            onClick: () => {
                              setWizardEditId(ex.id);
                              setWizardOpen(true);
                            },
                          },
                        ]
                      : []),
                    ...(canDefineOutbound && canRefund
                      ? [
                          {
                            id: "refund",
                            label: "Devolver dinheiro",
                            icon: ICONS.refund,
                            disabled: busy,
                            onClick: () => setRefundId(ex.id),
                          },
                        ]
                      : []),
                    ...(canCancel
                      ? [
                          {
                            id: "cancel",
                            label: "Cancelar",
                            icon: ICONS.cancel,
                            danger: true,
                            separatorBefore: canEdit || canCharge || canRefund,
                            onClick: () => setCancelId(ex.id),
                          },
                        ]
                      : []),
                  ];
                  const open = () => setSelectedId(ex.id);

                  return (
                    <tr
                      key={ex.id}
                      className={`border-b border-stone-100 transition-colors ${
                        selectedId === ex.id
                          ? "bg-stone-50/70"
                          : "hover:bg-stone-50/60"
                      }`}
                    >
                      <td
                        className="cursor-pointer whitespace-nowrap px-4 py-3"
                        onClick={open}
                      >
                        <p className="font-mono font-medium text-stone-900">
                          {ex.exchangeNumber != null
                            ? `#${ex.exchangeNumber}`
                            : ex.id.slice(0, 6)}
                        </p>
                        <p className="whitespace-nowrap text-xs text-stone-500">
                          Pedido{" "}
                          {ex.order.orderNumber != null
                            ? `#${ex.order.orderNumber}`
                            : "—"}
                        </p>
                      </td>
                      <td
                        className="cursor-pointer px-4 py-3"
                        onClick={open}
                      >
                        <p className="font-medium text-stone-900">
                          {EXCHANGE_KIND_LABELS[ex.kind ?? "EXCHANGE"]}
                        </p>
                      </td>
                      <td
                        className="cursor-pointer px-4 py-3"
                        onClick={open}
                      >
                        <p className="max-w-[160px] truncate text-stone-800">
                          {ex.order.recipientName ||
                            ex.order.email ||
                            "Cliente"}
                        </p>
                      </td>
                      
                      <td
                        className="cursor-pointer px-4 py-3"
                        onClick={open}
                      >
                        <p className="text-stone-800">
                          {ex.kind === "RETURN" &&
                          Math.abs(ex.balanceAmount) > 0.009
                            ? formatPrice(Math.abs(ex.balanceAmount))
                            : "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {localReturn ? (
                          <p className="text-sm text-stone-800">
                            {returnMethodLabel(retShip)}
                          </p>
                        ) : hasManualReverse(retShip) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setManualReturnId(ex.id);
                            }}
                            className={LIST_BTN_SOFT}
                          >
                            {retShip?.trackingCode || "Ver etiqueta"}
                          </button>
                        ) : (
                          <span className="text-[11px] text-stone-400">
                            Transportadora
                          </span>
                        )}
                      </td>
                      <td
                        className="cursor-pointer whitespace-nowrap px-4 py-3"
                        onClick={open}
                      >
                        <p className="whitespace-nowrap text-stone-800">
                          {exchangeStatusLabel(ex)}
                        </p>
                        {ex.inspectedAt && ex.status !== "RECEIVED" ? (
                          <p className="text-[11px] text-emerald-700">
                            Conferido
                          </p>
                        ) : null}
                      </td>
                      <td
                        className="px-3 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-2">
                          {primaryAction ? (
                            <button
                              type="button"
                              disabled={primaryAction.disabled}
                              onClick={primaryAction.onClick}
                              className={`${primaryAction.className} inline-flex min-w-[10.75rem] justify-center whitespace-nowrap`}
                            >
                              {primaryAction.label}
                            </button>
                          ) : (
                            <span className="inline-flex min-w-[10.75rem]" />
                          )}
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                            {menuItems.length > 0 ? (
                              <ExchangeRowMenu items={menuItems} />
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ExchangeDetailDrawer
        open={selectedId !== null}
        detail={detail}
        loading={detailLoading}
        busy={busy}
        actionError={actionError}
        returnItems={returnItems}
        outboundItems={outboundItems}
        onClose={() => setSelectedId(null)}
        onRunAction={runAction}
        onInspect={() => selectedId && setInspectId(selectedId)}
        onOutbound={() => selectedId && setOutboundId(selectedId)}
        onCharge={() => {
          if (!selectedId) return;
          setChargeId(selectedId);
          setPaymentResult(null);
        }}
        onRefund={() => selectedId && setRefundId(selectedId)}
        onManualReturn={() => selectedId && setManualReturnId(selectedId)}
        onCancel={() => selectedId && setCancelId(selectedId)}
      />

      {inspectTarget ? (
        <ExchangeInspectModal
          pieces={inspectTarget.items.filter((i) => i.direction === "RETURN")}
          busy={busy}
          error={actionError}
          onClose={() => setInspectId(null)}
          onConfirm={(lines) => {
            void runAction("/inspect", { lines }, inspectTarget.id).then(
              (ok) => {
                if (ok) setInspectId(null);
              }
            );
          }}
        />
      ) : null}

      {manualReturnId ? (
        <ExchangeReverseModal
          exchangeId={manualReturnId}
          busy={busy}
          error={actionError}
          onClose={() => setManualReturnId(null)}
          onSaved={async (body) => {
            setBusy(true);
            setActionError(null);
            try {
              const res = await fetch(
                `/api/admin/exchanges/${manualReturnId}/return-shipping`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                }
              );
              const data = (await res.json()) as { error?: string };
              if (!res.ok) {
                setActionError(data.error ?? "Falha ao salvar reversa.");
                return false;
              }
              await loadList();
              if (selectedId) await loadDetail(selectedId);
              return true;
            } catch {
              setActionError("Erro de rede.");
              return false;
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      {outboundTarget ? (
        <ExchangeOutboundPlanner
          key={outboundTarget.id}
          exchangeId={outboundTarget.id}
          destinationCep={outboundTarget.order.destinationCep ?? null}
          initialMethod={outboundInitialMethod(outboundTarget)}
          returnedItems={outboundTarget.items.filter(
            (i) => i.direction === "RETURN"
          )}
          orderItems={outboundTarget.order.items ?? []}
          returnedCredit={
            (outboundTarget as ExchangeDetail).returnedItemsTotal ??
            outboundTarget.items
              .filter((i) => i.direction === "RETURN")
              .reduce((acc, i) => acc + i.lineTotal, 0)
          }
          busy={busy}
          error={actionError}
          onClose={() => setOutboundId(null)}
          onSaved={async () => {
            setOutboundId(null);
            await loadList();
            if (selectedId) await loadDetail(selectedId);
          }}
        />
      ) : null}

      {refundTarget ? (
        <ExchangeRefundModal
          amount={refundTarget.balanceAmount}
          busy={busy}
          error={actionError}
          onClose={() => setRefundId(null)}
          onConfirm={(notes) => {
            void runAction(
              "/balance",
              { action: "mark_credit_settled", notes },
              refundTarget.id
            ).then((ok) => {
              if (ok) setRefundId(null);
            });
          }}
        />
      ) : null}

      {cancelId ? (
        <ExchangeCancelModal
          busy={busy}
          error={actionError}
          onClose={() => {
            setCancelId(null);
            setActionError(null);
          }}
          onConfirm={(reason) => {
            void (async () => {
              const ok = await runAction("/cancel", { reason }, cancelId);
              if (ok) {
                setCancelId(null);
                if (selectedId === cancelId) setSelectedId(null);
              }
            })();
          }}
        />
      ) : null}

      {chargeTarget ? (
        <ExchangeChargeModal
          amount={chargeTarget.balanceAmount}
          busy={busy || paymentLoading}
          error={actionError}
          paymentResult={paymentResult}
          onClose={() => {
            setChargeId(null);
            setPaymentResult(null);
          }}
          onGenerate={(method) => void generatePayment(method)}
        />
      ) : null}

      <ExchangeWizard
        open={wizardOpen}
        editExchangeId={wizardEditId}
        onClose={() => {
          setWizardOpen(false);
          setWizardEditId(null);
        }}
        onCreated={() => {
          void loadList();
        }}
      />
    </div>
  );
}

function ExchangeDetailDrawer({
  open,
  detail,
  loading,
  busy,
  actionError,
  returnItems,
  outboundItems,
  onClose,
  onRunAction,
  onInspect,
  onOutbound,
  onCharge,
  onRefund,
  onManualReturn,
  onCancel,
}: {
  open: boolean;
  detail: ExchangeDetail | null;
  loading: boolean;
  busy: boolean;
  actionError: string | null;
  returnItems: ExchangeItemRow[];
  outboundItems: ExchangeItemRow[];
  onClose: () => void;
  onRunAction: (
    path: string,
    body?: Record<string, unknown>,
    exchangeId?: string
  ) => Promise<boolean>;
  onInspect: () => void;
  onOutbound: () => void;
  onCharge: () => void;
  onRefund: () => void;
  onManualReturn: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [display, setDisplay] = useState<ExchangeDetail | null>(null);

  useEffect(() => {
    if (open && detail) {
      setDisplay(detail);
      setMounted(true);
      setEntered(false);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        if (inner) cancelAnimationFrame(inner);
      };
    }
    if (open && !detail && loading) {
      setMounted(true);
      setEntered(false);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        if (inner) cancelAnimationFrame(inner);
      };
    }
    if (!open) {
      setEntered(false);
      const t = window.setTimeout(() => {
        setMounted(false);
        setDisplay(null);
      }, DRAWER_MS);
      return () => clearTimeout(t);
    }
  }, [open, detail, loading]);

  useEffect(() => {
    if (detail) setDisplay(detail);
  }, [detail]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  const d = display;
  const kind = d?.kind ?? "EXCHANGE";
  const title = d
    ? `${EXCHANGE_KIND_LABELS[kind]} #${d.exchangeNumber ?? d.id.slice(0, 6)}`
    : "Detalhes";

  const balanceOpen =
    d?.balanceStatus === "PENDING" || d?.balanceStatus === "CREDIT_PENDING";
  const canComplete =
    d &&
    (d.status === "READY_OUTBOUND" ||
      d.status === "OUTBOUND" ||
      (d.status === "RECEIVED" &&
        outboundItems.length === 0 &&
        kind !== "EXCHANGE" &&
        !balanceOpen));

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        className={`absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 ease-out ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Fechar"
        onClick={onClose}
      />
      <aside
        className={`absolute top-0 right-0 flex h-full w-full max-w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] sm:max-w-md sm:border-l sm:border-stone-200 ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-4 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-stone-900">
              {title}
            </h2>
            {d && (
              <p className="mt-0.5 truncate text-xs text-stone-500">
                {exchangeStatusLabel(d)} · Pedido #
                {d.order.orderNumber ?? "—"}
              </p>
            )}
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-stone-500 hover:bg-stone-100"
            aria-label="Fechar"
            onClick={onClose}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading && !d ? (
            <p className="text-sm text-stone-500">Carregando…</p>
          ) : !d ? (
            <p className="text-sm text-stone-500">Registro não encontrado.</p>
          ) : (
            <div className="space-y-5">
              {actionError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-sm">
                <Mini label="Cliente" value={d.order.recipientName || d.order.email || "—"} />
                <Mini label="Motivo" value={EXCHANGE_REASON_LABELS[d.reason]} />
                {kind === "RETURN" && (
                  <Mini label="Reembolso" value={formatPrice(d.returnedItemsTotal)} />
                )}
                {kind === "EXCHANGE" && (
                  <>
                    <Mini label="Devolvido" value={formatPrice(d.returnedItemsTotal)} />
                    <Mini label="Novo" value={formatPrice(d.newItemsTotal)} />
                    <Mini
                      label="Diferença"
                      value={
                        d.productsDelta > 0.009
                          ? `Cliente ${formatPrice(d.productsDelta)}`
                          : d.productsDelta < -0.009
                            ? `Restituir ${formatPrice(Math.abs(d.productsDelta))}`
                            : formatPrice(0)
                      }
                    />
                  </>
                )}
                <Mini label="Saldo" value={balanceLabel(d.balanceAmount)} />
                <Mini
                  label="Status saldo"
                  value={EXCHANGE_BALANCE_STATUS_LABELS[d.balanceStatus]}
                />
              </div>

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                  Logística
                </h4>
                <ul className="space-y-2">
                  {d.shippings.map((s) => {
                    const local = isLocalExchangeShippingMethod(s.method);
                    return (
                      <li
                        key={s.id}
                        className="rounded-lg border border-stone-100 px-3 py-2 text-sm"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">
                            {s.type === "RETURN" ? "Retorno" : "Reenvio"}
                          </span>
                          <span className="text-xs text-stone-500">
                            {s.type === "RETURN"
                              ? EXCHANGE_RETURN_METHOD_LABELS[
                                  s.method ?? "CARRIER"
                                ]
                              : local
                                ? EXCHANGE_SHIPPING_METHOD_LABELS[
                                    s.method ?? "STORE_PICKUP"
                                  ]
                                : EXCHANGE_PAID_BY_LABELS[s.paidBy]}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500">
                          {s.type === "RETURN"
                            ? s.method === "CARRIER"
                              ? s.superfreteShipmentId
                                ? s.shippingServiceName ||
                                  "Código de postagem gerado."
                                : s.manualConfiguredAt
                                  ? [
                                      s.trackingCode,
                                      s.postingLocationName,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")
                                  : "Realizar manualmente."
                              : s.method === "STORE_PICKUP"
                                ? "A cliente devolve a peça."
                                : "Moto boy da loja busca a peça."
                            : local
                              ? s.method === "STORE_PICKUP"
                                ? "Sem etiqueta — cliente na loja ou já combinado."
                                : "Coleta/entrega local — sem SuperFrete."
                            : s.shippingServiceName || "Sem serviço cotado"}
                          {!local && s.quotedPrice != null
                            ? ` · ${formatPrice(s.quotedPrice)}`
                            : ""}
                        </p>
                        {!local && s.trackingCode && (
                          <a
                            href={trackingUrl(s.trackingCode)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block text-xs font-medium text-sky-800"
                          >
                            Rastreio: {s.trackingCode}
                          </a>
                        )}
                        {s.type === "RETURN" &&
                          s.postingLocationName &&
                          !s.superfreteShipmentId && (
                            <p className="mt-1 text-xs text-stone-500">
                              {s.postingLocationAddress || s.postingLocationName}
                            </p>
                          )}
                        {s.type === "RETURN" &&
                          !local &&
                          d.status !== "CANCELLED" && (
                            <button
                              type="button"
                              onClick={onManualReturn}
                              className="mt-2 rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700"
                            >
                              {hasManualReverse(s)
                                ? "Ver etiqueta"
                                : "Criar reverso"}
                            </button>
                          )}
                        {!local && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {!s.superfreteShipmentId &&
                              s.type === "OUTBOUND" &&
                              (d.status === "READY_OUTBOUND" ||
                                d.status === "OUTBOUND") && (
                                <button
                                  type="button"
                                  disabled={busy || !s.shippingServiceId}
                                  onClick={() =>
                                    void onRunAction("/labels", {
                                      type: s.type,
                                      serviceId: s.shippingServiceId,
                                    })
                                  }
                                  className="rounded-md bg-stone-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                                >
                                  Gerar etiqueta
                                </button>
                              )}
                            {s.labelUrl && (
                              <a
                                href={s.labelUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700"
                              >
                                Abrir PDF
                              </a>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                  Peças devolvidas
                </h4>
                <ul className="space-y-2">
                  {returnItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex justify-between rounded-lg border border-stone-100 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-stone-900">
                        {item.productName}
                      </span>
                      <span className="text-xs text-stone-500">
                        {item.disposition
                          ? EXCHANGE_DISPOSITION_LABELS[item.disposition]
                          : "A conferir"}
                      </span>
                    </li>
                  ))}
                </ul>
                {!d.inspectedAt &&
                  d.status !== "CANCELLED" &&
                  d.status !== "COMPLETED" &&
                  (hasManualReverse(returnShippingOf(d)) ||
                    isLocalReturn(returnShippingOf(d))) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onInspect}
                      className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Conferir peça
                    </button>
                  )}
              </section>

              {kind === "EXCHANGE" &&
                d.inspectedAt &&
                outboundItems.length === 0 &&
                d.status !== "CANCELLED" && (
                  <button
                    type="button"
                    onClick={onOutbound}
                    className="rounded-lg bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-900 ring-1 ring-sky-200"
                  >
                    Definir novo envio
                  </button>
                )}

              {outboundItems.length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                    Enviar
                  </h4>
                  {d.balanceStatus === "PENDING" ? (
                    <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                      O envio libera depois do pagamento da cliente e aparece
                      em Envios.
                    </p>
                  ) : null}
                  <ul className="space-y-2">
                    {outboundItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex justify-between rounded-lg border border-stone-100 px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{item.productName}</span>
                        <span className="text-stone-500">
                          {item.quantity}× {formatPrice(item.unitPrice)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {d.balanceStatus === "CREDIT_PENDING" && !d.inspectedAt && (
                <section className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
                  <p className="text-sm font-medium text-stone-900">
                    Valor a restituir · {formatPrice(Math.abs(d.balanceAmount))}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Confira as peças antes de devolver o dinheiro.
                  </p>
                </section>
              )}

              {d.balanceStatus === "CREDIT_PENDING" && d.inspectedAt && (
                <button
                  type="button"
                  onClick={onRefund}
                  className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white"
                >
                  Devolver dinheiro · {formatPrice(Math.abs(d.balanceAmount))}
                </button>
              )}

              {d.balanceStatus === "PENDING" && (
                <button
                  type="button"
                  onClick={onCharge}
                  className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white"
                >
                  Cobrar cliente · {formatPrice(d.balanceAmount)}
                </button>
              )}

              <section className="flex flex-wrap gap-2">
                {canComplete && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onRunAction("/complete")}
                    className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                  >
                    Concluir
                  </button>
                )}

                {!d.inspectedAt &&
                  d.status !== "CANCELLED" &&
                  d.status !== "COMPLETED" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onCancel}
                      className="rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      Cancelar
                    </button>
                  )}
              </section>

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                  Timeline
                </h4>
                <ol className="space-y-2 border-l border-stone-200 pl-3">
                  {d.events.map((ev) => {
                    let note: string | null = null;
                    if (ev.payloadJson) {
                      try {
                        const payload = JSON.parse(ev.payloadJson) as {
                          message?: unknown;
                        };
                        if (typeof payload.message === "string") {
                          note = payload.message;
                        }
                      } catch {
                        note = null;
                      }
                    }
                    return (
                      <li key={ev.id} className="text-sm">
                        <p className="font-medium text-stone-800">
                          {ev.type === "NOTE_ADDED" && note
                            ? note
                            : (EVENT_LABELS[ev.type] ?? ev.type)}
                        </p>
                        <p className="text-xs text-stone-400">
                          {fmtDateTime(ev.createdAt)}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}

const ACTION_MENU_WIDTH = 236;

const ICONS = {
  edit: (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  ),
  charge: (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
    </svg>
  ),
  refund: (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
    </svg>
  ),
  cancel: (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
};

function ActionMenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-stone-500">
      {children}
    </span>
  );
}

type ExchangeMenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
};

function ExchangeRowMenu({ items }: { items: ExchangeMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  function toggleMenu() {
    if (open) {
      closeMenu();
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(
      8,
      Math.min(
        rect.right - ACTION_MENU_WIDTH,
        window.innerWidth - ACTION_MENU_WIDTH - 8
      )
    );
    setMenuPos({ top: rect.bottom + 6, left });
    setOpen(true);
  }

  return (
    <div className="flex justify-center">
      <button
        ref={btnRef}
        type="button"
        aria-label="Ações da troca"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggleMenu}
        disabled={items.length === 0}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30 ${
          open
            ? "bg-blue-50 text-blue-600"
            : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
        }`}
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>

      {mounted && open && menuPos
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Fechar menu de ações"
                className="fixed inset-0 z-[90]"
                onClick={closeMenu}
              />
              <div
                role="menu"
                aria-label="Ações da troca"
                className="fixed z-[91] overflow-hidden rounded-xl border border-stone-200 bg-white py-1.5 shadow-lg"
                style={{
                  top: menuPos.top,
                  left: menuPos.left,
                  width: ACTION_MENU_WIDTH,
                }}
              >
                {items.map((item) => (
                  <div key={item.id}>
                    {item.separatorBefore ? (
                      <div
                        className="my-1 border-t border-stone-100"
                        role="separator"
                      />
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        if (item.disabled) return;
                        item.onClick();
                        closeMenu();
                      }}
                      className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                        item.danger
                          ? "text-red-600 hover:bg-red-50"
                          : "text-stone-700 hover:bg-stone-50"
                      }`}
                    >
                      <ActionMenuIcon>{item.icon}</ActionMenuIcon>
                      <span>{item.label}</span>
                    </button>
                  </div>
                ))}
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2">
      <p className="text-[11px] text-stone-400">{label}</p>
      <p className="truncate font-medium text-stone-900">{value}</p>
    </div>
  );
}

function ExchangeCancelModal({
  busy,
  error,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-stone-900">
          Cancelar troca
        </h3>
        <p className="mt-1 text-sm text-stone-500">
          Informe o motivo do cancelamento.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Motivo"
          className="mt-3 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-400"
        />
        {error ? (
          <p className="mt-2 text-xs text-red-600">{error}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-40"
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={busy || !trimmed}
            onClick={() => onConfirm(trimmed)}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
          >
            {busy ? "Cancelando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
