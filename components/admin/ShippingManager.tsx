"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { formatPrice } from "@/lib/format";
import { formatDeliveryDaysLabel } from "@/lib/shipping/delivery-days-label";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import { orderCustomerDisplayName } from "@/lib/admin-sale/customer-display";
import {
  arrangedDeliveryLabelFromServiceName,
  resolveArrangedDeliveryDisplay,
  splitArrangedDeliveryNotes,
} from "@/lib/admin-sale/arranged-delivery";
import {
  hasLabelAutoGenerateError,
  labelAutoGenerateErrorTooltip,
  LabelAutoGenerateWarningIcon,
} from "@/components/admin/LabelPendingBanner";

/* ─── Tipos ───────────────────────────────────────────────────────── */

type ShipmentOrder = {
  id: string;
  orderNumber: number | null;
  status: string;
  email: string;
  orderSource?: string;
  customerDataStatus?: string | null;
  fulfillmentType?: string;
  shippingServiceName: string | null;
  deliveryNotes?: string | null;
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

type FilterKey = "needs_label" | "to_pack" | "packed" | "shipped" | "delivered" | "cancelled";

type WalletInfo = {
  balance: number;
  shipmentsPending: number;
  shipmentsAvailable: number;
  walletUrl: string;
  accountEmail?: string;
  environment?: "sandbox" | "production";
  environmentLabel?: string;
};

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

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "needs_label", label: "Sem etiqueta" },
  { key: "to_pack", label: "Por embalar" },
  { key: "packed", label: "Por enviar" },
  { key: "shipped", label: "Postados" },
  { key: "delivered", label: "Entregues" },
  { key: "cancelled", label: "Etiqueta cancelada" },
];

const SHIPPING_STATUS = [
  { value: "to_pack", label: "Por embalar", dot: "bg-amber-400" },
  { value: "packed", label: "Por enviar", dot: "bg-blue-500" },
  { value: "shipped", label: "Enviado", dot: "bg-emerald-500" },
  { value: "delivered", label: "Entregue", dot: "bg-emerald-500" },
  { value: "cancelled", label: "Cancelado", dot: "bg-red-400" },
] as const;

const SHIPPING_TOOLBAR_SIZE =
  "box-border h-9 text-sm font-medium leading-none sm:h-8";

const SHIPPING_TOOLBAR_CONTROL = `${SHIPPING_TOOLBAR_SIZE} rounded-lg border px-3 sm:px-3.5`;

const ACTION_MENU_WIDTH = 236;

const TABLE_CELL_PRIMARY = "text-sm font-medium text-stone-900";
const TABLE_CELL_SECONDARY = "text-xs font-normal text-stone-500";

const TABLE_SHIPPING_LABELS: Record<string, string> = {
  to_pack: "Por embalar",
  packed: "Por enviar",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

/* ─── Helpers ─────────────────────────────────────────────────────── */

function sInfo(value: string) {
  return SHIPPING_STATUS.find((s) => s.value === value) ?? SHIPPING_STATUS[0];
}

function tableShippingLabel(status: string): string {
  return TABLE_SHIPPING_LABELS[status] ?? sInfo(status).label;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function orderNumberLabel(order: ShipmentOrder) {
  return order.orderNumber != null ? `#${order.orderNumber}` : order.id.slice(0, 8);
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
  return `https://rastreamento.superfrete.com/#${encodeURIComponent(code)}`;
}

function CopyTrackingLinkButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(trackingUrl(code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => void handleCopy(e)}
      title={copied ? "Link copiado!" : "Copiar link de rastreio"}
      aria-label={copied ? "Link de rastreio copiado" : "Copiar link de rastreio"}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
    >
      {copied ? (
        <svg
          className="h-3.5 w-3.5 text-emerald-600"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m4.5 12.75 6 6 9-13.5"
          />
        </svg>
      ) : (
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
          />
        </svg>
      )}
    </button>
  );
}

function shortCarrierLabel(serviceName: string | null): string | null {
  if (!serviceName?.trim()) return null;

  const lower = serviceName.toLowerCase();
  if (lower.includes("sedex")) return "SEDEX";
  if (/\bpac\b/i.test(lower) || lower.includes(" pac ") || lower.startsWith("pac ")) return "PAC";
  if (lower.includes("jadlog")) return "Jadlog";
  if (lower.includes("loggi")) return "Loggi";

  const servicePart = serviceName.split("—").pop()?.trim() ?? serviceName.trim();
  if (/sedex/i.test(servicePart)) return "SEDEX";
  if (/\bpac\b/i.test(servicePart)) return "PAC";
  if (/jadlog/i.test(servicePart)) return "Jadlog";
  if (/loggi/i.test(servicePart)) return "Loggi";

  return servicePart.length > 18 ? `${servicePart.slice(0, 16)}…` : servicePart;
}

function shortShippingMethod(
  serviceName: string | null,
  fulfillmentType?: string,
  deliveryNotes?: string | null
): string | null {
  if (fulfillmentType === "ARRANGED") {
    const fromService = arrangedDeliveryLabelFromServiceName(serviceName);
    if (fromService) return fromService;
    const split = splitArrangedDeliveryNotes(deliveryNotes);
    return split.systemLabel;
  }

  return shortCarrierLabel(serviceName);
}

function shipmentFreightTypeLabel(order: ShipmentOrder): string {
  if (order.fulfillmentType === "ARRANGED") {
    return resolveArrangedDeliveryDisplay({
      shippingServiceName: order.shippingServiceName,
      deliveryNotes: order.deliveryNotes ?? null,
      shippingAmount: order.shippingQuotedPrice ?? 0,
    }).typeLabel;
  }

  return shortCarrierLabel(order.shippingServiceName) ?? "—";
}

function shipmentMatchesFilter(order: ShipmentOrder, filter: FilterKey | null): boolean {
  if (!filter) return true;
  if (filter === "needs_label") {
    return !order.labelUrl && order.fulfillmentType !== "ARRANGED";
  }
  if (filter === "to_pack") return order.shippingStatus === "to_pack";
  if (filter === "packed") return order.shippingStatus === "packed";
  if (filter === "shipped") return order.shippingStatus === "shipped";
  if (filter === "delivered") return order.shippingStatus === "delivered";
  if (filter === "cancelled") return order.shippingStatus === "cancelled";
  return true;
}

/* ─── UI auxiliar ─────────────────────────────────────────────────── */

function TruckIcon({ className = "h-3.5 w-3.5 shrink-0" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}

function ShippingStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "blue" | "emerald";
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-50 text-blue-900 ring-blue-200"
      : "bg-emerald-50 text-emerald-700 ring-emerald-200";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${toneClass}`}
    >
      <TruckIcon />
      {label}
    </span>
  );
}

function TableShippingStatus({
  status,
  shippingMethod,
}: {
  status: string;
  shippingMethod: string | null;
}) {
  const label = tableShippingLabel(status);
  const info = sInfo(status);

  if (status === "packed") {
    return (
      <>
        <ShippingStatusBadge label={label} tone="blue" />
        {shippingMethod ? (
          <p className={`mt-1 ${TABLE_CELL_SECONDARY}`}>{shippingMethod}</p>
        ) : null}
      </>
    );
  }

  if (status === "delivered") {
    return (
      <>
        <ShippingStatusBadge label={label} tone="emerald" />
        {shippingMethod ? (
          <p className={`mt-1 ${TABLE_CELL_SECONDARY}`}>{shippingMethod}</p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <span className={`inline-flex items-center gap-1.5 ${TABLE_CELL_PRIMARY}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${info.dot}`} />
        {label}
      </span>
      {shippingMethod ? (
        <p className={TABLE_CELL_SECONDARY}>{shippingMethod}</p>
      ) : null}
    </>
  );
}

function ActionMenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-stone-500">
      {children}
    </span>
  );
}

/* ─── Modal alterar frete ─────────────────────────────────────────── */

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

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-stone-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-stone-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-stone-100 px-5 py-4">
          <h3 className="text-base font-semibold text-stone-900">Alterar modalidade de frete</h3>
          <p className="mt-1 text-sm text-stone-500">
            Pedido {orderNumberLabel(order)} · {orderCustomerDisplayName(order)}
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
                          {isCurrent ? (
                            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-400">
                              Atual
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}
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

/* ─── Ações de envio ──────────────────────────────────────────────── */

function useShipmentActions(order: ShipmentOrder, onRefresh: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localTracking, setLocalTracking] = useState<string | null>(null);
  const [awaitingTracking, setAwaitingTracking] = useState(false);

  // Descarta rastreio otimista quando a etiqueta foi cancelada ou não há envio ativo.
  useEffect(() => {
    if (order.shippingStatus === "cancelled") {
      setLocalTracking(null);
      setAwaitingTracking(false);
      return;
    }
    if (
      !order.trackingCode &&
      !order.labelUrl &&
      !order.superfreteShipmentId &&
      !awaitingTracking
    ) {
      setLocalTracking(null);
    }
  }, [
    order.shippingStatus,
    order.trackingCode,
    order.labelUrl,
    order.superfreteShipmentId,
    awaitingTracking,
  ]);

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
        return false;
      }
      if (opts?.openPdf !== false && data.shipmentId) {
        window.open(`/api/admin/orders/${order.id}/label/pdf`, "_blank");
      }
      if (key === "cancel") {
        setLocalTracking(null);
        setAwaitingTracking(false);
      } else if (data.tracking) {
        setLocalTracking(data.tracking);
        setAwaitingTracking(false);
      }
      onRefresh();
      if (key === "label" && !data.tracking) {
        setAwaitingTracking(true);
        void pollTrackingUntilReady();
      }
      return true;
    } catch {
      setError("Erro de conexão.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const trackingCode = localTracking ?? order.trackingCode;

  return {
    busy,
    error,
    trackingCode,
    awaitingTracking,
    runAction,
  };
}

function shipmentCapabilities(order: ShipmentOrder) {
  const isArranged = order.fulfillmentType === "ARRANGED";
  const isSaleCancelled = order.status === "cancelled";
  const isPaid = Boolean(order.paidAt);

  return {
    isArranged,
    isSaleCancelled,
    canSelectForBulk: !order.labelUrl && !isSaleCancelled && !isArranged,
    canChangeShipping: !order.labelUrl && !order.superfreteShipmentId && !isSaleCancelled && !isArranged,
    canMarkPacked: isPaid && !isSaleCancelled && order.shippingStatus === "to_pack",
    canGenerateLabel: !order.labelUrl && !isSaleCancelled && !isArranged,
    labelAutoGenerateFailed: hasLabelAutoGenerateError(order),
    labelAutoGenerateTitle: labelAutoGenerateErrorTooltip(order),
  };
}

/* ─── Menu de ações da linha ──────────────────────────────────────── */

function ShipmentRowActionsMenu({
  order,
  busy,
  runAction,
  onChangeShipping,
}: {
  order: ShipmentOrder;
  busy: string | null;
  runAction: (
    key: string,
    url: string,
    method?: string,
    body?: unknown,
    opts?: { openPdf?: boolean }
  ) => Promise<boolean>;
  onChangeShipping: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const caps = shipmentCapabilities(order);

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
      Math.min(rect.right - ACTION_MENU_WIDTH, window.innerWidth - ACTION_MENU_WIDTH - 8)
    );
    setMenuPos({ top: rect.bottom + 6, left });
    setOpen(true);
  }

  type MenuAction = {
    id: string;
    label: string;
    icon: ReactNode;
    onClick: () => void | Promise<void>;
    disabled?: boolean;
    danger?: boolean;
    separatorBefore?: boolean;
  };

  const actions = useMemo(() => {
    const items: MenuAction[] = [];

    if (caps.canChangeShipping) {
      items.push({
        id: "change-shipping",
        label: "Alterar frete",
        icon: <TruckIcon className="h-[18px] w-[18px]" />,
        onClick: onChangeShipping,
      });
    }

    if (caps.canMarkPacked) {
      items.push({
        id: "pack",
        label: busy === "pack" ? "Salvando…" : "Marcar como embalada",
        separatorBefore: items.length > 0,
        disabled: busy === "pack",
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        ),
        onClick: () =>
          void runAction(
            "pack",
            `/api/admin/orders/${order.id}`,
            "PATCH",
            { shippingStatus: "packed" },
            { openPdf: false }
          ),
      });
    }

    if (caps.canGenerateLabel) {
      items.push({
        id: "label",
        label:
          busy === "label"
            ? "Gerando…"
            : order.shippingStatus === "cancelled"
              ? "Gerar nova etiqueta"
              : "Gerar etiqueta",
        separatorBefore: items.length > 0,
        disabled: busy === "label",
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.163a48.042 48.042 0 0 1 1.087-.128m12.725 0c.977.148 1.837 1.082 1.837 2.163V15.75A2.25 2.25 0 0 1 18.66 18h-1.08m-12.725 0h12.725" />
          </svg>
        ),
        onClick: () =>
          void runAction("label", `/api/admin/orders/${order.id}/label`, "POST", undefined, {
            openPdf: true,
          }),
      });
    }

    if (order.labelUrl) {
      items.push({
        id: "pdf",
        label: "Imprimir etiqueta",
        separatorBefore: items.length > 0,
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 11.25 12 15.75m0 0 4.5-4.5M12 15.75V3" />
          </svg>
        ),
        onClick: () => {
          window.open(`/api/admin/orders/${order.id}/label/pdf`, "_blank");
        },
      });
    }

    if (
      caps.isArranged &&
      order.shippingStatus !== "shipped" &&
      order.shippingStatus !== "delivered"
    ) {
      items.push({
        id: "shipped",
        label: busy === "shipped" ? "Salvando…" : "Marcar enviado",
        separatorBefore: items.length > 0,
        disabled: busy === "shipped",
        icon: <TruckIcon className="h-[18px] w-[18px]" />,
        onClick: () => void runAction("shipped", `/api/admin/sales/${order.id}/mark-shipped`),
      });
    }

    if (order.superfreteShipmentId) {
      // Reimprimir etiqueta: oculto no menu — "Baixar etiqueta" já renova URL expirada via /label/pdf.
      // items.push({
      //   id: "print",
      //   label: busy === "print" ? "Reimprimindo…" : "Reimprimir etiqueta",
      //   separatorBefore: items.length > 0,
      //   disabled: busy === "print",
      //   icon: (
      //     <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      //       <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.163a48.042 48.042 0 0 1 1.087-.128m12.725 0c.977.148 1.837 1.082 1.837 2.163V15.75A2.25 2.25 0 0 1 18.66 18h-1.08m-12.725 0h12.725" />
      //     </svg>
      //   ),
      //   onClick: () => void runAction("print", `/api/admin/orders/${order.id}/shipment/print`),
      // });

      items.push({
        id: "sync",
        label: busy === "sync" ? "Sincronizando…" : "Sincronizar status",
        separatorBefore: items.length > 0,
        disabled: busy === "sync",
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        ),
        onClick: () => void runAction("sync", `/api/admin/orders/${order.id}/shipment/sync`),
      });

      if (order.shippingStatus !== "cancelled") {
        items.push({
          id: "cancel",
          label: busy === "cancel" ? "Cancelando…" : "Cancelar etiqueta",
          danger: true,
          separatorBefore: true,
          disabled: busy === "cancel",
          icon: (
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          ),
          onClick: () => {
            if (!confirm("Cancelar etiqueta na SuperFrete?")) return;
            void runAction("cancel", `/api/admin/orders/${order.id}/shipment/cancel`, "POST", {
              reason: "Cancelado pelo administrador",
            });
          },
        });
      }
    }

    return items;
  }, [
    busy,
    caps.canChangeShipping,
    caps.canGenerateLabel,
    caps.canMarkPacked,
    caps.isArranged,
    onChangeShipping,
    order.id,
    order.labelUrl,
    order.shippingStatus,
    order.superfreteShipmentId,
    runAction,
  ]);

  return (
    <td className="px-3 py-3.5">
      <div className="flex justify-center">
        <button
          ref={btnRef}
          type="button"
          aria-label="Ações do envio"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={toggleMenu}
          disabled={actions.length === 0}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30 ${
            open ? "bg-blue-50 text-blue-600" : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          }`}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="5" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="12" cy="19" r="1.75" />
          </svg>
        </button>
      </div>

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
                aria-label="Ações do envio"
                className="fixed z-[91] overflow-hidden rounded-xl border border-stone-200 bg-white py-1.5 shadow-lg"
                style={{ top: menuPos.top, left: menuPos.left, width: ACTION_MENU_WIDTH }}
              >
                {actions.map((action) => (
                  <div key={action.id}>
                    {action.separatorBefore ? (
                      <div className="my-1 border-t border-stone-100" role="separator" />
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={action.disabled}
                      onClick={() => {
                        void action.onClick();
                        closeMenu();
                      }}
                      className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                        action.danger
                          ? "text-red-600 hover:bg-red-50"
                          : "text-stone-700 hover:bg-stone-50"
                      }`}
                    >
                      <ActionMenuIcon>{action.icon}</ActionMenuIcon>
                      <span>{action.label}</span>
                    </button>
                  </div>
                ))}
              </div>
            </>,
            document.body
          )
        : null}
    </td>
  );
}

/* ─── Linha da tabela ─────────────────────────────────────────────── */

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
  const { busy, error, trackingCode, awaitingTracking, runAction } =
    useShipmentActions(order, onRefresh);
  const caps = shipmentCapabilities(order);
  const freightPrice = chosenShippingPrice(order);
  const freightTypeLabel = shipmentFreightTypeLabel(order);
  const deliveryDaysLabel = formatDeliveryDaysLabel(
    order.shippingDeliveryDaysMin,
    order.shippingDeliveryDaysMax
  );
  const showDeliveryDays =
    order.fulfillmentType !== "ARRANGED" && deliveryDaysLabel !== "—";
  const name = orderCustomerDisplayName(order);
  const shippingMethod = shortShippingMethod(
    order.shippingServiceName,
    order.fulfillmentType,
    order.deliveryNotes
  );

  return (
    <tr className="border-b border-stone-100 align-top transition-colors hover:bg-stone-50/60">
      <td className="px-4 py-3.5">
        <input
          type="checkbox"
          checked={selected}
          disabled={!caps.canSelectForBulk}
          title={caps.canSelectForBulk ? "Selecionar para gerar etiqueta" : "Etiqueta já gerada"}
          onChange={onToggleSelect}
          className="h-4 w-4 rounded border-stone-300 accent-stone-900 disabled:opacity-30"
        />
      </td>
      <td className="px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`font-mono ${TABLE_CELL_PRIMARY}`}>{orderNumberLabel(order)}</span>
            {order.orderSource === "ADMIN_SALE" ? (
              <span className="text-xs font-normal text-stone-600">Avulsa</span>
            ) : null}
            {caps.labelAutoGenerateFailed ? (
              <LabelAutoGenerateWarningIcon title={caps.labelAutoGenerateTitle} />
            ) : null}
          </div>
          {error ? (
            <p
              className="mt-1.5 max-w-[16rem] rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs leading-snug text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3.5">
        <p className={TABLE_CELL_PRIMARY}>{fmtDate(order.createdAt)}</p>
        <p className={TABLE_CELL_SECONDARY}>{fmtTime(order.createdAt)}</p>
      </td>
      <td className="px-4 py-3.5 truncate">
        <p
          className={TABLE_CELL_PRIMARY}
          title={order.shippingServiceName ?? undefined}
        >
          {freightTypeLabel}
        </p>
        {showDeliveryDays ? (
          <p className={TABLE_CELL_SECONDARY}>{deliveryDaysLabel}</p>
        ) : null}
      </td>
      <td className="px-4 py-3.5">
        <p className={`truncate max-w-[160px] ${TABLE_CELL_PRIMARY}`} title={name}>
          {name}
        </p>
      </td>
      <td className="px-4 py-3.5">
        {trackingCode ? (
          <div className="flex items-center gap-1.5">
            <a
              href={trackingUrl(trackingCode)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-stone-800 underline decoration-stone-300 underline-offset-2 hover:text-stone-950"
            >
              {trackingCode}
            </a>
            <CopyTrackingLinkButton code={trackingCode} />
          </div>
        ) : order.labelUrl || order.superfreteShipmentId || awaitingTracking ? (
          <span className="text-xs text-stone-400">Aguardando…</span>
        ) : (
          <span className="text-xs text-stone-300">—</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        <p className={`tabular-nums ${TABLE_CELL_PRIMARY}`}>
          {freightPrice != null ? formatPrice(freightPrice) : "—"}
        </p>
      </td>
      <td className="px-4 py-3.5">
        <TableShippingStatus
          status={order.shippingStatus}
          shippingMethod={shippingMethod}
        />
      </td>
      <ShipmentRowActionsMenu
        order={order}
        busy={busy}
        runAction={runAction}
        onChangeShipping={onChangeShipping}
      />
    </tr>
  );
}

/* ─── Componente principal ────────────────────────────────────────── */

export function ShippingManager() {
  const [orders, setOrders] = useState<ShipmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey | null>(null);
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
      const res = await fetch("/api/admin/shipments");
      const data = (await res.json()) as {
        orders?: ShipmentOrder[];
        error?: string;
      };
      if (!res.ok) {
        console.error(data.error);
        setOrders([]);
        return;
      }
      setOrders(data.orders ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchShipments();
  }, [fetchShipments]);

  useEffect(() => {
    void fetchWallet();
  }, [fetchWallet]);

  const filterCounts = useMemo(
    () => ({
      needs_label: orders.filter(
        (order) => !order.labelUrl && order.fulfillmentType !== "ARRANGED"
      ).length,
      to_pack: orders.filter((order) => order.shippingStatus === "to_pack").length,
      packed: orders.filter((order) => order.shippingStatus === "packed").length,
      shipped: orders.filter((order) => order.shippingStatus === "shipped").length,
      delivered: orders.filter((order) => order.shippingStatus === "delivered").length,
      cancelled: orders.filter((order) => order.shippingStatus === "cancelled").length,
    }),
    [orders]
  );

  const visibleOrders = useMemo(
    () => orders.filter((order) => shipmentMatchesFilter(order, filter)),
    [orders, filter]
  );

  useEffect(() => {
    if (!allRef.current) return;
    const selectable = visibleOrders.filter((o) => shipmentCapabilities(o).canSelectForBulk);
    const n = selectedIds.size;
    allRef.current.indeterminate = n > 0 && n < selectable.length;
    allRef.current.checked = n === selectable.length && selectable.length > 0;
  }, [selectedIds, visibleOrders]);

  const refreshAll = () => {
    void fetchShipments();
    void fetchWallet();
  };

  function toggleFilter(key: FilterKey) {
    setFilter((current) => (current === key ? null : key));
  }

  const selectableOrders = visibleOrders.filter((o) => shipmentCapabilities(o).canSelectForBulk);
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

  const lowBalance = wallet != null && wallet.balance < 20;
  const hasActiveFilter = filter !== null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Envios</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            {hasActiveFilter
              ? `${visibleOrders.length} de ${orders.length} envio${orders.length !== 1 ? "s" : ""}`
              : `${orders.length} envio${orders.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={loading}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-50 ${SHIPPING_TOOLBAR_SIZE}`}
        >
          <svg
            className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
        </button>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        {wallet?.environment === "sandbox" ? (
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
        ) : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                Saldo SuperFrete
              </p>
              {wallet?.environment === "sandbox" && wallet.environmentLabel ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                  {wallet.environmentLabel}
                </span>
              ) : null}
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
                  {wallet.shipmentsAvailable > 0 ? (
                    <> · limite disponível: {wallet.shipmentsAvailable}</>
                  ) : null}
                </p>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {wallet?.walletUrl ? (
              <a
                href={wallet.walletUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center justify-center rounded-lg bg-sky-100 px-3 text-xs font-semibold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 ${SHIPPING_TOOLBAR_SIZE}`}
              >
                Adicionar saldo
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void fetchWallet()}
              disabled={walletLoading}
              aria-label="Atualizar saldo"
              title="Atualizar saldo"
              className={`inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-50 ${SHIPPING_TOOLBAR_SIZE}`}
            >
              <svg
                className={`h-3 w-3 ${walletLoading ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleFilter(key)}
            className={`inline-flex shrink-0 items-center gap-2 transition-colors ${SHIPPING_TOOLBAR_CONTROL} ${
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

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm font-medium text-stone-700">
            {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            disabled={bulkLoading}
            onClick={() => void bulkGenerateLabels()}
            className="ml-2 rounded-lg border border-stone-900 bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-50"
          >
            {bulkLoading ? "Gerando etiquetas…" : "Gerar etiquetas selecionadas"}
          </button>
          {bulkLoading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
          ) : null}
          {bulkMsg ? <span className="text-xs text-stone-500">{bulkMsg}</span> : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2.5 py-10 text-sm text-stone-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" />
          Carregando envios…
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 py-14 text-center">
          <p className="text-sm text-stone-500">
            {hasActiveFilter ? "Nenhum envio neste filtro." : "Nenhum envio encontrado."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80 text-xs font-medium text-stone-500">
                  <th className="w-10 px-4 py-3.5">
                    <input
                      ref={allRef}
                      type="checkbox"
                      aria-label="Selecionar todos sem etiqueta"
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-stone-300 accent-stone-900"
                    />
                  </th>
                  <th className="px-4 py-3.5 text-left">Pedido</th>
                  <th className="px-4 py-3.5 text-left">Data</th>
                  <th className="px-4 py-3.5 text-left">Frete</th>
                  <th className="px-4 py-3.5 text-left">Destinatário</th>
                  <th className="px-4 py-3.5 text-left">Rastreio</th>
                  <th className="px-4 py-3.5 text-right">Valor</th>
                  <th className="px-4 py-3.5 text-left">Status</th>
                  <th className="w-12 px-3 py-3.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <ShipmentRow
                    key={order.id}
                    order={order}
                    onRefresh={refreshAll}
                    selected={selectedIds.has(order.id)}
                    onToggleSelect={() => toggleSelect(order.id)}
                    onChangeShipping={() => setShippingModalOrder(order)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {shippingModalOrder ? (
        <ChangeShippingModal
          order={shippingModalOrder}
          onClose={() => setShippingModalOrder(null)}
          onSaved={refreshAll}
        />
      ) : null}
    </div>
  );
}
