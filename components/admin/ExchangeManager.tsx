"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatPrice } from "@/lib/format";
import {
  EXCHANGE_BALANCE_STATUS_LABELS,
  EXCHANGE_DISPOSITION_LABELS,
  EXCHANGE_DISPOSITIONS,
  EXCHANGE_KIND_LABELS,
  EXCHANGE_PAID_BY_LABELS,
  EXCHANGE_REASON_LABELS,
  EXCHANGE_STATUS_LABELS,
} from "@/lib/exchanges/constants";
import {
  EXCHANGE_SHIPPING_METHOD_LABELS,
  isLocalExchangeShippingMethod,
} from "@/lib/exchanges/shipping-method";
import { ExchangeWizard } from "@/components/admin/ExchangeWizard";
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
  order: {
    id: string;
    orderNumber: number | null;
    recipientName: string | null;
    email: string | null;
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

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Criada",
  REVERSE_LABEL_GENERATED: "Etiqueta reversa",
  RETURN_POSTED: "Cliente postou",
  RECEIVED: "Recebido",
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
  { key: "RECEIVED", label: "Recebidas" },
  { key: "READY_OUTBOUND", label: "Reenvio" },
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

function returnShippingOf(ex: ExchangeListItem): ExchangeShippingRow | null {
  return ex.shippings.find((s) => s.type === "RETURN") ?? null;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExchangeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dispositions, setDispositions] = useState<
    Record<string, ExchangeItemDisposition>
  >({});
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(
    null
  );

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
    setPaymentResult(null);
    try {
      const res = await fetch(`/api/admin/exchanges/${id}`);
      const data = (await res.json()) as { exchange?: ExchangeDetail };
      if (data.exchange) {
        setDetail(data.exchange);
        const initial: Record<string, ExchangeItemDisposition> = {};
        for (const item of data.exchange.items) {
          if (item.direction === "RETURN") {
            initial[item.id] = item.disposition ?? "RESELLABLE";
          }
        }
        setDispositions(initial);
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
      if (data.exchange && (selectedId === id || !selectedId)) {
        setDetail(data.exchange);
        setSelectedId(id);
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

  async function quickInspect(ex: ExchangeListItem) {
    const returnItems = ex.items.filter((i) => i.direction === "RETURN");
    if (returnItems.length === 0) {
      setSelectedId(ex.id);
      return;
    }
    await runAction(
      "/inspect",
      {
        lines: returnItems.map((item) => ({
          exchangeItemId: item.id,
          disposition: "RESELLABLE",
        })),
      },
      ex.id
    );
  }

  async function generatePayment(paymentMethod: "pix" | "card") {
    if (!selectedId) return;
    setBusy(true);
    setActionError(null);
    setPaymentResult(null);
    try {
      const res = await fetch(`/api/admin/exchanges/${selectedId}/payment`, {
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
      await loadDetail(selectedId);
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
            onClick={() => setWizardOpen(true)}
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
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80 text-xs font-medium text-stone-500">
                  <th className="px-4 py-3 text-left">Registro</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Saldo</th>
                  <th className="px-4 py-3 text-left">Etiqueta</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleExchanges.map((ex) => {
                  const retShip = returnShippingOf(ex);
                  const canInspect =
                    !ex.inspectedAt &&
                    ex.status !== "CANCELLED" &&
                    ex.status !== "COMPLETED";
                  const canRefund =
                    !!ex.inspectedAt &&
                    ex.balanceStatus === "CREDIT_PENDING";
                  const canCharge = ex.balanceStatus === "PENDING";
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
                        className="cursor-pointer px-4 py-3"
                        onClick={open}
                      >
                        <p className="font-medium text-stone-900">
                          {EXCHANGE_KIND_LABELS[ex.kind ?? "EXCHANGE"]}{" "}
                          {ex.exchangeNumber != null
                            ? `#${ex.exchangeNumber}`
                            : ex.id.slice(0, 6)}
                        </p>
                        <p className="text-xs text-stone-500">
                          Pedido{" "}
                          {ex.order.orderNumber != null
                            ? `#${ex.order.orderNumber}`
                            : "—"}{" "}
                          · {EXCHANGE_REASON_LABELS[ex.reason]}
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
                        <p className="text-[11px] text-stone-400">
                          {fmtDateTime(ex.createdAt)}
                        </p>
                      </td>
                      <td
                        className="cursor-pointer px-4 py-3"
                        onClick={open}
                      >
                        <p className="text-stone-800">
                          {EXCHANGE_STATUS_LABELS[ex.status]}
                        </p>
                        {ex.inspectedAt ? (
                          <p className="text-[11px] text-emerald-700">
                            Conferido
                          </p>
                        ) : null}
                      </td>
                      <td
                        className="cursor-pointer px-4 py-3"
                        onClick={open}
                      >
                        <p className="text-stone-800">
                          {balanceLabel(ex.balanceAmount)}
                        </p>
                        <p className="text-[11px] text-stone-400">
                          {EXCHANGE_BALANCE_STATUS_LABELS[ex.balanceStatus]}
                        </p>
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          {retShip &&
                          isLocalExchangeShippingMethod(retShip.method) ? (
                            <span className="text-xs text-stone-600">
                              {EXCHANGE_SHIPPING_METHOD_LABELS[
                                retShip.method ?? "STORE_PICKUP"
                              ]}
                            </span>
                          ) : (
                            <>
                              {retShip?.trackingCode ? (
                                <a
                                  href={trackingUrl(retShip.trackingCode)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`${LIST_BTN_SOFT} font-mono`}
                                  title="Acompanhar rastreio"
                                >
                                  {retShip.trackingCode}
                                </a>
                              ) : null}
                              {retShip?.labelUrl ? (
                                <a
                                  href={retShip.labelUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={LIST_BTN_SOFT}
                                >
                                  PDF
                                </a>
                              ) : null}
                              {!retShip?.superfreteShipmentId &&
                                (ex.status === "AWAITING_RETURN" ||
                                  ex.status === "RETURN_IN_TRANSIT") && (
                                  <button
                                    type="button"
                                    disabled={
                                      busy || !retShip?.shippingServiceId
                                    }
                                    onClick={() =>
                                      void runAction(
                                        "/labels",
                                        {
                                          type: "RETURN",
                                          serviceId:
                                            retShip?.shippingServiceId,
                                        },
                                        ex.id
                                      )
                                    }
                                    className={LIST_BTN_PRIMARY}
                                    title={
                                      retShip?.shippingServiceId
                                        ? "Gerar etiqueta reversa"
                                        : "Cotação sem serviço — abra os detalhes"
                                    }
                                  >
                                    Gerar etiqueta
                                  </button>
                                )}
                              {!retShip?.trackingCode &&
                                !retShip?.labelUrl &&
                                retShip?.superfreteShipmentId && (
                                  <span className="text-[11px] text-stone-400">
                                    Etiqueta gerada
                                  </span>
                                )}
                            </>
                          )}
                          {!retShip && (
                            <span className="text-[11px] text-stone-400">—</span>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {canInspect && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void quickInspect(ex)}
                              className={LIST_BTN_OK}
                            >
                              Conferir
                            </button>
                          )}
                          {canCharge && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setSelectedId(ex.id)}
                              className={LIST_BTN_PRIMARY}
                            >
                              Cobrar
                            </button>
                          )}
                          {canRefund && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void runAction(
                                  "/balance",
                                  { action: "mark_credit_settled" },
                                  ex.id
                                )
                              }
                              className={LIST_BTN_PRIMARY}
                            >
                              Reembolso
                            </button>
                          )}
                          {ex.balanceStatus === "CREDIT_PENDING" &&
                            !ex.inspectedAt && (
                              <span className="text-[11px] text-stone-400">
                                Confira antes do reembolso
                              </span>
                            )}
                          <button
                            type="button"
                            onClick={open}
                            className={LIST_BTN_SOFT}
                          >
                            Detalhes
                          </button>
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
        dispositions={dispositions}
        setDispositions={setDispositions}
        paymentResult={paymentResult}
        returnItems={returnItems}
        outboundItems={outboundItems}
        onClose={() => setSelectedId(null)}
        onRunAction={runAction}
        onGeneratePayment={generatePayment}
      />

      <ExchangeWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(id) => {
          setSelectedId(id);
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
  dispositions,
  setDispositions,
  paymentResult,
  returnItems,
  outboundItems,
  onClose,
  onRunAction,
  onGeneratePayment,
}: {
  open: boolean;
  detail: ExchangeDetail | null;
  loading: boolean;
  busy: boolean;
  actionError: string | null;
  dispositions: Record<string, ExchangeItemDisposition>;
  setDispositions: React.Dispatch<
    React.SetStateAction<Record<string, ExchangeItemDisposition>>
  >;
  paymentResult: PaymentResult | null;
  returnItems: ExchangeItemRow[];
  outboundItems: ExchangeItemRow[];
  onClose: () => void;
  onRunAction: (
    path: string,
    body?: Record<string, unknown>,
    exchangeId?: string
  ) => Promise<boolean>;
  onGeneratePayment: (method: "pix" | "card") => Promise<void>;
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
                {EXCHANGE_STATUS_LABELS[d.status]} · Pedido #
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
                <Mini label="Devolvido" value={formatPrice(d.returnedItemsTotal)} />
                {kind === "EXCHANGE" && (
                  <Mini label="Novo" value={formatPrice(d.newItemsTotal)} />
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
                            {local
                              ? EXCHANGE_SHIPPING_METHOD_LABELS[
                                  s.method ?? "STORE_PICKUP"
                                ]
                              : EXCHANGE_PAID_BY_LABELS[s.paidBy]}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500">
                          {local
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
                        {!local && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {!s.superfreteShipmentId &&
                              ((s.type === "RETURN" &&
                                (d.status === "AWAITING_RETURN" ||
                                  d.status === "RETURN_IN_TRANSIT")) ||
                                (s.type === "OUTBOUND" &&
                                  (d.status === "READY_OUTBOUND" ||
                                    d.status === "OUTBOUND"))) && (
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

              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                  Conferência
                </h4>
                <ul className="space-y-2">
                  {returnItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-stone-100 px-3 py-2 text-sm"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-stone-900">
                          {item.productName}
                        </span>
                        <span className="text-stone-500">
                          {item.quantity}× {formatPrice(item.unitPrice)}
                        </span>
                      </div>
                      {!d.inspectedAt &&
                        d.status !== "CANCELLED" &&
                        d.status !== "COMPLETED" && (
                          <select
                            value={dispositions[item.id] ?? "RESELLABLE"}
                            onChange={(e) =>
                              setDispositions((prev) => ({
                                ...prev,
                                [item.id]: e.target
                                  .value as ExchangeItemDisposition,
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
                        )}
                      {item.disposition && (
                        <p className="mt-1 text-xs text-stone-500">
                          {EXCHANGE_DISPOSITION_LABELS[item.disposition]}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {!d.inspectedAt &&
                  d.status !== "CANCELLED" &&
                  d.status !== "COMPLETED" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void onRunAction("/inspect", {
                          lines: returnItems.map((item) => ({
                            exchangeItemId: item.id,
                            disposition:
                              dispositions[item.id] ?? "RESELLABLE",
                          })),
                        })
                      }
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Recebi e conferir
                    </button>
                  )}
                {d.inspectedAt && (
                  <p className="text-xs text-emerald-700">Peças conferidas.</p>
                )}
              </section>

              {outboundItems.length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                    Enviar
                  </h4>
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
                    Reembolso · {formatPrice(Math.abs(d.balanceAmount))}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Disponível depois de marcar “Recebi e conferir”.
                  </p>
                </section>
              )}

              {d.balanceStatus === "CREDIT_PENDING" && d.inspectedAt && (
                <section className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                  <p className="text-sm font-medium text-sky-950">
                    Reembolso · {formatPrice(Math.abs(d.balanceAmount))}
                  </p>
                  <p className="text-xs text-sky-900/80">
                    Peças conferidas. Marque quando o dinheiro for devolvido —
                    isso registra saída no caixa.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void onRunAction("/balance", {
                        action: "mark_credit_settled",
                      })
                    }
                    className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                  >
                    Marcar reembolso feito
                  </button>
                </section>
              )}

              {d.balanceStatus === "PENDING" && (
                <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-sm font-medium text-amber-950">
                    Cobrar diferença · {formatPrice(d.balanceAmount)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onGeneratePayment("pix")}
                      className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Gerar PIX
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onGeneratePayment("card")}
                      className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Link cartão
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void onRunAction("/balance", { action: "mark_paid" })
                      }
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-800 disabled:opacity-40"
                    >
                      Marcar pago
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void onRunAction("/balance", { action: "waive" })
                      }
                      className="rounded-lg px-3 py-2 text-xs font-medium text-stone-600 hover:bg-white/80 disabled:opacity-40"
                    >
                      Dispensar
                    </button>
                  </div>
                  {paymentResult?.type === "pix" && (
                    <div className="space-y-2 rounded-lg bg-white p-3 text-sm">
                      <p className="font-medium text-stone-900">
                        PIX · {formatPrice(paymentResult.amount)}
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
                        onClick={() =>
                          void navigator.clipboard.writeText(
                            paymentResult.pixCode
                          )
                        }
                        className="text-xs font-medium text-sky-800"
                      >
                        Copiar código
                      </button>
                    </div>
                  )}
                  {paymentResult?.type === "card" && (
                    <div className="rounded-lg bg-white p-3 text-sm">
                      <p className="font-medium text-stone-900">
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
                      <button
                        type="button"
                        onClick={() =>
                          void navigator.clipboard.writeText(
                            paymentResult.checkoutUrl
                          )
                        }
                        className="ml-2 text-xs font-medium text-sky-800"
                      >
                        Copiar link
                      </button>
                    </div>
                  )}
                </section>
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
                      onClick={() => {
                        const reason = window.prompt(
                          "Motivo do cancelamento (opcional):"
                        );
                        if (reason === null) return;
                        void onRunAction("/cancel", { reason });
                      }}
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
                  {d.events.map((ev) => (
                    <li key={ev.id} className="text-sm">
                      <p className="font-medium text-stone-800">
                        {EVENT_LABELS[ev.type] ?? ev.type}
                      </p>
                      <p className="text-xs text-stone-400">
                        {fmtDateTime(ev.createdAt)}
                      </p>
                    </li>
                  ))}
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2">
      <p className="text-[11px] text-stone-400">{label}</p>
      <p className="truncate font-medium text-stone-900">{value}</p>
    </div>
  );
}
