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
import Image from "next/image";
import { AdminListPagination } from "@/components/admin/AdminListPagination";
import { formatPrice } from "@/lib/format";
import { formatDeliveryDaysLabel } from "@/lib/shipping/delivery-days-label";
import { isCancelledProviderShipmentStatus } from "@/lib/shipping/service-id";
import { canManuallyMarkCarrierAsShipped } from "@/lib/fulfillment/shipping-status-policy";
import { shippingTrackingUrl } from "@/lib/shipping/tracking-url";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import { ExchangeShipmentQueue } from "@/components/admin/ExchangeShipmentQueue";
import {
  isPendingAdminSaleCustomer,
  orderCustomerDisplayName,
} from "@/lib/admin-sale/customer-display";
import {
  ARRANGED_DELIVERY_LABELS,
  arrangedDeliveryLabelFromServiceName,
  isInsideDelivery,
  orderDeliveryUserNotes,
  resolveArrangedDeliveryDisplay,
  splitArrangedDeliveryNotes,
} from "@/lib/admin-sale/arranged-delivery";
import { OrderNotesHint } from "@/components/admin/OrderNotesHint";
import {
  hasLabelAutoGenerateError,
  labelAutoGenerateErrorTooltip,
  LabelAutoGenerateWarningIcon,
} from "@/components/admin/LabelPendingBanner";
import {
  orderItemDisplayImageUrl,
  orderItemDisplayName,
} from "@/lib/orders/order-item-display";
import type { CartPieceSelection } from "@/lib/cart/types";
import { cepMask, onlyDigits } from "@/lib/admin-sale/customer-form-input";
import { useAuth } from "@/components/auth/AuthProvider";

/* ─── Tipos ───────────────────────────────────────────────────────── */

type ShipmentItem = {
  id: string;
  quantity: number;
  price: number;
  pieceSelectionsJson: string | null;
  productId?: string | null;
  productName?: string | null;
  productDescription?: string | null;
  productImageUrl?: string | null;
  paymentStatus?: string | null;
  product: {
    id: string;
    name: string;
    description: string | null;
    images: { url: string }[];
  } | null;
};

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
  internalNotes?: string | null;
  shippingServiceId: number | null;
  shippingProvider?: string | null;
  shippingStatus: string;
  superfreteStatus: string | null;
  trackingCode: string | null;
  recipientName: string | null;
  phone?: string | null;
  destinationCep?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
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
  items?: ShipmentItem[];
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

type ShippingTone = "amber" | "stone" | "blue" | "emerald" | "red";

const SHIPPING_STATUS = [
  { value: "to_pack", label: "Por embalar", tone: "amber" },
  { value: "packed", label: "Por enviar", tone: "stone" },
  { value: "shipped", label: "Enviado", tone: "blue" },
  { value: "delivered", label: "Entregue", tone: "emerald" },
  { value: "cancelled", label: "Cancelado", tone: "red" },
] as const satisfies ReadonlyArray<{ value: string; label: string; tone: ShippingTone }>;

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

function parsePieces(json: string | null): CartPieceSelection[] {
  try {
    return json ? (JSON.parse(json) as CartPieceSelection[]) : [];
  } catch {
    return [];
  }
}

function shipmentItemIsUnpaid(item: ShipmentItem): boolean {
  return (item.paymentStatus ?? "pending") !== "paid";
}

function cepDisplay(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value.trim();
}

function formatShipmentAddress(order: ShipmentOrder): string | null {
  const street = [order.addressStreet, order.addressNumber].filter(Boolean).join(", ");
  const cityLine = [order.addressNeighborhood, order.addressCity, order.addressState]
    .filter(Boolean)
    .join(" · ");
  const cep = cepDisplay(order.destinationCep);
  const lines = [
    street || null,
    order.addressComplement?.trim() || null,
    cityLine || null,
    cep,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
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

const NAME_PARTICLES = new Set(["de", "da", "do", "das", "dos", "e", "del", "di"]);

function shortCustomerGivenNames(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  if (NAME_PARTICLES.has(parts[1].toLowerCase()) && parts[2]) {
    return `${parts[0]} ${parts[1]} ${parts[2]}`;
  }
  return `${parts[0]} ${parts[1]}`;
}

function packingListCustomerName(order: ShipmentOrder): string {
  const full = orderCustomerDisplayName(order);
  if (isPendingAdminSaleCustomer(order)) return full;
  return shortCustomerGivenNames(full);
}

function packingListPieceDetail(
  piece: CartPieceSelection,
  identification: string
): string {
  const pieceName = piece.pieceName.trim();
  const skipName =
    pieceName.length > 0 &&
    pieceName.toLowerCase() === identification.trim().toLowerCase();
  return [skipName ? null : pieceName || null, piece.color, piece.size]
    .filter(Boolean)
    .join(" · ");
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

function CopyTrackingLinkButton({
  code,
  provider,
}: {
  code: string;
  provider?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(shippingTrackingUrl(code, provider));
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

function shippingProviderLabel(provider?: string | null): string {
  return provider === "MELHOR_ENVIO" ? "Melhor Envio" : "SuperFrete";
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

function packingListDeliveryLabel(order: ShipmentOrder): string {
  const label = shipmentFreightTypeLabel(order);
  if (label === ARRANGED_DELIVERY_LABELS.store_delivery) return "Entregador";
  return label;
}

function shipmentDeliveryUserNotes(order: ShipmentOrder): string | null {
  return orderDeliveryUserNotes({
    fulfillmentType: order.fulfillmentType,
    shippingServiceName: order.shippingServiceName,
    deliveryNotes: order.deliveryNotes,
    shippingAmount: order.shippingQuotedPrice,
  });
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function shipmentMatchesCustomerSearch(order: ShipmentOrder, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const haystack = [
    orderCustomerDisplayName(order),
    order.email ?? "",
    order.recipientName ?? "",
    orderNumberLabel(order),
    order.orderNumber != null ? String(order.orderNumber) : "",
    order.trackingCode ?? "",
  ]
    .map(normalizeSearchText)
    .join(" ");

  return haystack.includes(normalizedQuery);
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

function StatusIcon({
  className = "h-3.5 w-3.5 shrink-0",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
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
      {children}
    </svg>
  );
}

function TruckIcon({ className = "h-3.5 w-3.5 shrink-0" }: { className?: string }) {
  return (
    <StatusIcon className={className}>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </StatusIcon>
  );
}

function shippingStatusIcon(status: string) {
  switch (status) {
    case "to_pack":
      return (
        <StatusIcon>
          <path d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </StatusIcon>
      );
    case "packed":
      return (
        <StatusIcon>
          <path d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
        </StatusIcon>
      );
    case "shipped":
      return <TruckIcon />;
    case "delivered":
      return (
        <StatusIcon>
          <path d="M9 12.75 11.25 15 15 9.75" />
          <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </StatusIcon>
      );
    case "cancelled":
      return (
        <StatusIcon>
          <path d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5" />
          <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </StatusIcon>
      );
    default:
      return <TruckIcon />;
  }
}

const SHIPPING_TONE_CLASS: Record<ShippingTone, string> = {
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  stone: "bg-stone-50 text-stone-700 ring-stone-200",
  blue: "bg-blue-50 text-blue-900 ring-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
};

function ShippingStatusBadge({
  label,
  tone,
  status,
}: {
  label: string;
  tone: ShippingTone;
  status: string;
}) {
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${SHIPPING_TONE_CLASS[tone]}`}
    >
      {shippingStatusIcon(status)}
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

  return (
    <div className="flex flex-col items-start gap-0.5">
      <ShippingStatusBadge label={label} tone={info.tone} status={status} />
      {shippingMethod ? (
        <p className={`whitespace-nowrap ${TABLE_CELL_SECONDARY}`}>{shippingMethod}</p>
      ) : null}
    </div>
  );
}

function ActionMenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-stone-500">
      {children}
    </span>
  );
}

function PackBoxIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );
}

/* ─── Modal / impressão de embalagem ──────────────────────────────── */

function PackingSlipContent({ order }: { order: ShipmentOrder }) {
  const name = orderCustomerDisplayName(order);
  const address = formatShipmentAddress(order);
  const freightLabel = shipmentFreightTypeLabel(order);
  const freightPrice = chosenShippingPrice(order);
  const deliveryDaysLabel = formatDeliveryDaysLabel(
    order.shippingDeliveryDaysMin,
    order.shippingDeliveryDaysMax
  );
  const showDeliveryDays =
    order.fulfillmentType !== "ARRANGED" && deliveryDaysLabel !== "—";
  const items = order.items ?? [];
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const hasUnpaidItems = items.some(shipmentItemIsUnpaid);

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
            Destinatário
          </h4>
          <ShippingStatusBadge
            label={tableShippingLabel(order.shippingStatus)}
            tone={sInfo(order.shippingStatus).tone}
            status={order.shippingStatus}
          />
        </div>
        <p className="mt-1.5 text-base font-semibold text-stone-900">{name}</p>
        {address ? (
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-stone-600">
            {address}
          </p>
        ) : order.fulfillmentType === "ARRANGED" ? (
          <p className="mt-1 text-sm text-stone-500">Entrega combinada</p>
        ) : (
          <p className="mt-1 text-sm text-stone-400">Endereço não informado</p>
        )}
        {order.phone?.trim() ? (
          <p className="mt-1.5 text-sm text-stone-500">{order.phone.trim()}</p>
        ) : null}
      </section>

      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
          Frete
        </h4>
        {order.fulfillmentType === "ARRANGED" ? (
          <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">
              Entrega combinada
            </p>
            <p className="mt-1 text-base font-semibold text-amber-950">{freightLabel}</p>
            {freightPrice != null ? (
              <p className="mt-1 text-sm tabular-nums text-amber-800">
                {formatPrice(freightPrice)}
              </p>
            ) : null}
            {order.deliveryNotes?.trim() ? (
              <p className="mt-2 whitespace-pre-wrap text-xs text-amber-900/80">
                {splitArrangedDeliveryNotes(order.deliveryNotes).userNotes ||
                  order.deliveryNotes.trim()}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-base font-semibold text-stone-900">{freightLabel}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-stone-500">
              {showDeliveryDays ? <span>{deliveryDaysLabel}</span> : null}
              {freightPrice != null ? (
                <span className="tabular-nums">{formatPrice(freightPrice)}</span>
              ) : null}
            </div>
          </>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
            Produtos
          </h4>
          <p className="text-xs text-stone-500">
            {items.length} item{items.length !== 1 ? "s" : ""} · {totalUnits} un.
          </p>
        </div>
        {hasUnpaidItems ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            Há peça(s) com pagamento pendente. Não envie essas peças até o pagamento ser confirmado.
          </p>
        ) : null}
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-stone-400">Nenhum produto neste pedido.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100 border-y border-stone-100">
            {items.map((item) => {
              const pieces = parsePieces(item.pieceSelectionsJson);
              const img = orderItemDisplayImageUrl(item);
              const productName = orderItemDisplayName(item);
              const unpaid = shipmentItemIsUnpaid(item);
              return (
                <li key={item.id} className="flex gap-3 py-3.5">
                  <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                    {img ? (
                      <Image
                        src={img}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-stone-300">
                        —
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-snug text-stone-900">{productName}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          unpaid
                            ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
                            : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                        }`}
                      >
                        {unpaid ? "Pagamento pendente" : "Pago"}
                      </span>
                    </div>
                    {pieces.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-xs text-stone-500">
                        {pieces.map((piece, index) => {
                          const details = [piece.pieceName, piece.color, piece.size]
                            .filter(Boolean)
                            .join(" · ");
                          if (!details) return null;
                          return (
                            <li key={`${item.id}-piece-${index}`}>{details}</li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-2xl font-semibold tabular-nums leading-none text-stone-900">
                      {item.quantity}
                    </p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">
                      un.
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function PackingListPrint({
  orders,
  onDone,
}: {
  orders: ShipmentOrder[];
  onDone: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    function handleAfterPrint() {
      onDone();
    }
    window.addEventListener("afterprint", handleAfterPrint);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      window.clearTimeout(timer);
    };
  }, [mounted, onDone]);

  if (!mounted) return null;

  const printedAt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return createPortal(
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #packing-list-print, #packing-list-print * { visibility: visible !important; }
          #packing-list-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            background: white !important;
            color: black !important;
          }
          #packing-list-print table { width: 100%; border-collapse: collapse; }
          #packing-list-print thead { display: table-header-group; }
          #packing-list-print tbody { break-inside: avoid; }
          #packing-list-print .packing-products {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
          }
          #packing-list-print .packing-product {
            min-width: 0;
            border: 1px solid #c8c8c8;
            padding: 4px 6px;
          }
          #packing-list-print .packing-row-with-notes td {
            border-bottom-color: #c8c8c8;
          }
          #packing-list-print .packing-notes td {
            border-top-color: #c8c8c8;
          }
        }
      `}</style>
      <div
        id="packing-list-print"
        className="fixed left-[-9999px] top-0 w-[210mm] bg-white p-8 text-black"
        aria-hidden
      >
        <header className="mb-3 flex items-baseline justify-between gap-4 border-b border-black pb-2">
          <h1 className="text-base font-bold">Lista por embalar</h1>
          <p className="text-xs">
            {orders.length} pedido{orders.length !== 1 ? "s" : ""} · {printedAt}
          </p>
        </header>

        <table className="w-full border-collapse text-[11px] leading-snug">
          <thead>
            <tr>
              <th className="w-[9%] border border-black px-1.5 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide">
                Pedido
              </th>
              <th className="w-[16%] border border-black px-1.5 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide">
                Cliente
              </th>
              <th className="w-[11%] border border-black px-1.5 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide">
                Pagamento
              </th>
              <th className="w-[13%] border border-black px-1.5 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide">
                Entrega
              </th>
              <th className="border border-black px-1.5 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide">
                Produtos
              </th>
              <th className="w-8 border border-black px-1 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide">
                ✓
              </th>
            </tr>
          </thead>
          {orders.map((order) => {
            const items = order.items ?? [];
            const saleNote = order.internalNotes?.trim() || null;
            const deliveryNote = shipmentDeliveryUserNotes(order);
            const noteBits = [
              saleNote ? `Venda: ${saleNote}` : null,
              deliveryNote ? `Entrega: ${deliveryNote}` : null,
            ].filter(Boolean);
            return (
              <tbody key={order.id}>
                <tr className={`align-top${noteBits.length > 0 ? " packing-row-with-notes" : ""}`}>
                  <td className="border border-black px-1.5 py-2 text-center font-mono text-xs font-semibold">
                    {orderNumberLabel(order)}
                  </td>
                  <td className="border border-black px-1.5 py-2 font-semibold">
                    {packingListCustomerName(order)}
                  </td>
                  <td className="border border-black px-1.5 py-2 text-center tabular-nums">
                    {order.paidAt ? fmtDate(order.paidAt) : "—"}
                  </td>
                  <td className="border border-black px-1.5 py-2 text-center">
                    {packingListDeliveryLabel(order)}
                  </td>
                  <td className="border border-black px-1.5 py-2">
                    {items.length > 0 ? (
                      <div className="packing-products grid grid-cols-2 gap-1.5">
                        {items.map((item) => {
                          const identification = orderItemDisplayName(item);
                          const pieces = parsePieces(item.pieceSelectionsJson);
                          const unpaid = shipmentItemIsUnpaid(item);
                          return (
                            <div
                              key={item.id}
                              className="packing-product min-w-0 border border-stone-300 px-1.5 py-1"
                            >
                              <p className="font-semibold leading-snug">
                                {identification}
                                {item.quantity > 1 ? (
                                  <span className="font-normal"> × {item.quantity}</span>
                                ) : null}
                                {unpaid ? (
                                  <span className="font-normal"> (pendente)</span>
                                ) : null}
                              </p>
                              {pieces.length > 0 ? (
                                <ul className="mt-0.5 space-y-0.5">
                                  {pieces.map((piece, index) => {
                                    const details = packingListPieceDetail(
                                      piece,
                                      identification
                                    );
                                    if (!details) return null;
                                    return (
                                      <li key={`${item.id}-piece-${index}`}>
                                        {details}
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  <td className="border border-black px-1 py-2 text-center align-middle">
                    <span
                      className="inline-block h-3.5 w-3.5 border-2 border-black"
                      aria-hidden
                    />
                  </td>
                </tr>
                {noteBits.length > 0 ? (
                  <tr className="packing-notes">
                    <td
                      colSpan={6}
                      className="border border-black border-t-stone-300 bg-stone-100 px-2 py-1.5 text-[10px] leading-snug"
                    >
                      <span className="font-semibold">Obs.:</span> {noteBits.join(" · ")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            );
          })}
        </table>
      </div>
    </>,
    document.body
  );
}

function PackingSlipModal({
  order,
  canMarkPacked,
  canMarkShipped,
  packingBusy,
  onClose,
  onMarkPacked,
  onMarkShipped,
}: {
  order: ShipmentOrder;
  canMarkPacked: boolean;
  canMarkShipped: boolean;
  packingBusy: boolean;
  onClose: () => void;
  onMarkPacked: () => void;
  onMarkShipped: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92vh,880px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-stone-200 bg-white shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Embalagem do pedido ${orderNumberLabel(order)}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-stone-900">
              Pedido {orderNumberLabel(order)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <PackingSlipContent order={order} />
        </div>

        <div className="flex flex-col gap-2 border-t border-stone-100 px-5 py-4 sm:flex-row">
          {canMarkPacked ? (
            <button
              type="button"
              disabled={packingBusy}
              onClick={onMarkPacked}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-50 disabled:opacity-50"
            >
              <PackBoxIcon className="h-4 w-4" />
              {packingBusy ? "Salvando…" : "Marcar como embalada"}
            </button>
          ) : null}
          {canMarkShipped ? (
            <button
              type="button"
              disabled={packingBusy}
              onClick={onMarkShipped}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-50"
            >
              <TruckIcon className="h-4 w-4" />
              {packingBusy ? "Salvando…" : "Marcar como enviado"}
            </button>
          ) : null}
          {!canMarkPacked && !canMarkShipped ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
            >
              Fechar
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── Modal cotação rápida de frete ───────────────────────────────── */

const QUICK_QUOTE_PACKAGE_LABEL = "30 × 20 × 10 cm · 500 g · seguro R$ 200";

function QuickFreightQuoteModal({ onClose }: { onClose: () => void }) {
  const [cep, setCep] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<NormalizedShippingOption[]>([]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function calculate() {
    const digits = onlyDigits(cep, 8);
    if (digits.length !== 8) {
      setError("Informe um CEP válido com 8 dígitos.");
      return;
    }
    setLoading(true);
    setError(null);
    setOptions([]);
    try {
      const res = await fetch("/api/admin/shipments/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationCep: digits }),
      });
      const data = (await res.json()) as {
        options?: NormalizedShippingOption[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Erro ao calcular frete.");
        return;
      }
      setOptions(data.options ?? []);
      if (!(data.options?.length)) {
        setError("Nenhuma opção de frete disponível para este CEP.");
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-stone-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-stone-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Calcular frete"
      >
        <div className="border-b border-stone-100 px-5 py-4">
          <h3 className="text-base font-semibold text-stone-900">Calcular frete</h3>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-500">
              CEP de destino
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="00000-000"
                value={cepMask(onlyDigits(cep, 8))}
                onChange={(e) => setCep(onlyDigits(e.target.value, 8))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void calculate();
                  }
                }}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
              />
              <button
                type="button"
                disabled={loading || onlyDigits(cep, 8).length !== 8}
                onClick={() => void calculate()}
                className="shrink-0 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-50"
              >
                {loading ? "…" : "Calcular"}
              </button>
            </div>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}

          {options.length > 0 ? (
            <ul className="max-h-[min(50vh,360px)] space-y-2 overflow-y-auto">
              {options.map((opt) => (
                <li
                  key={opt.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900">
                      {opt.carrierName} — {opt.serviceName}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {formatDeliveryDaysLabel(opt.deliveryDaysMin, opt.deliveryDaysMax)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-stone-900">
                    {formatPrice(opt.price)}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="border-t border-stone-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
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
  onSaved: (patch: Partial<ShipmentOrder>) => void;
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
      const data = (await res.json()) as {
        error?: string;
        shippingServiceName?: string | null;
        shippingServiceId?: number | null;
        shippingQuotedPrice?: number | null;
        shippingDeliveryDaysMin?: number | null;
        shippingDeliveryDaysMax?: number | null;
        shippingStatus?: string;
        shippingProvider?: string | null;
      };
      if (!res.ok) {
        setError(data.error ?? "Erro ao alterar frete.");
        return;
      }
      onSaved({
        shippingServiceName: data.shippingServiceName ?? null,
        shippingServiceId: data.shippingServiceId ?? null,
        shippingQuotedPrice: data.shippingQuotedPrice ?? null,
        shippingDeliveryDaysMin: data.shippingDeliveryDaysMin ?? null,
        shippingDeliveryDaysMax: data.shippingDeliveryDaysMax ?? null,
        ...(data.shippingStatus ? { shippingStatus: data.shippingStatus } : {}),
        ...(data.shippingProvider !== undefined
          ? { shippingProvider: data.shippingProvider }
          : {}),
      });
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
          ) : error && options.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">
              Não foi possível cotar o frete deste pedido.
            </p>
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

function useShipmentActions(
  order: ShipmentOrder,
  onPatchOrder: (id: string, patch: Partial<ShipmentOrder>) => void
) {
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

  async function pollTrackingUntilReady(attemptsLeft = 6) {
    if (attemptsLeft <= 0) {
      setAwaitingTracking(false);
      return;
    }
    try {
      // Sem quick: o sync faz print (se preciso) e espera o rastreio no provedor.
      const syncRes = await fetch(`/api/admin/orders/${order.id}/shipment/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quick: false }),
      });
      if (syncRes.ok) {
        const syncData = (await syncRes.json()) as {
          tracking?: string | null;
          trackingCode?: string | null;
          labelUrl?: string | null;
          shippingStatus?: string;
          superfreteStatus?: string | null;
          superfreteShipmentId?: string | null;
        };
        const tracking = syncData.trackingCode ?? syncData.tracking ?? null;
        if (tracking) {
          setLocalTracking(tracking);
          setAwaitingTracking(false);
          onPatchOrder(order.id, {
            trackingCode: tracking,
            ...(syncData.labelUrl !== undefined
              ? { labelUrl: syncData.labelUrl }
              : {}),
            ...(syncData.shippingStatus
              ? { shippingStatus: syncData.shippingStatus }
              : {}),
            ...(syncData.superfreteStatus !== undefined
              ? { superfreteStatus: syncData.superfreteStatus }
              : {}),
            ...(syncData.superfreteShipmentId !== undefined
              ? { superfreteShipmentId: syncData.superfreteShipmentId }
              : {}),
          });
          return;
        }
      }
    } catch {
      /* retry */
    }
    window.setTimeout(() => void pollTrackingUntilReady(attemptsLeft - 1), 2500);
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
        message?: string;
        labelUrl?: string;
        shipmentId?: string;
        tracking?: string | null;
        trackingCode?: string | null;
        paymentPending?: boolean;
        superfreteStatus?: string;
        status?: string;
        shippingStatus?: string;
        superfreteShipmentId?: string | null;
      };
      if (!res.ok) {
        setError(data.error ?? "Erro na operação.");
        return false;
      }
      const paymentPending =
        data.paymentPending === true ||
        data.superfreteStatus === "pending" ||
        data.status === "pending";
      if (paymentPending) {
        const providerName = shippingProviderLabel(order.shippingProvider);
        setError(
          data.message ??
            `Etiqueta ainda aguarda pagamento no ${providerName}. Pague lá e sincronize de novo.`
        );
        setAwaitingTracking(false);
      }
      const tracking = data.trackingCode ?? data.tracking ?? null;
      if (key === "cancel") {
        setLocalTracking(null);
        setAwaitingTracking(false);
      } else if (tracking) {
        setLocalTracking(tracking);
        setAwaitingTracking(false);
      } else if (key === "sync") {
        // Sync manual sem rastreio: para o "buscando…" e deixa o estado pendente.
        setAwaitingTracking(false);
      }
      if (key === "label" && !tracking && !paymentPending) {
        setAwaitingTracking(true);
      }

      const patch: Partial<ShipmentOrder> = {};
      if (key === "pack") patch.shippingStatus = "packed";
      if (key === "ship") patch.shippingStatus = "shipped";
      if (key === "arranged-delivered") {
        patch.shippingStatus = "delivered";
      }
      if (key === "cancel") {
        patch.shippingStatus = "cancelled";
        patch.superfreteShipmentId = null;
        patch.labelUrl = null;
        patch.trackingCode = null;
        patch.superfreteStatus = "cancelled";
        patch.labelGeneratedAt = null;
      }
      if (key === "label") {
        if (data.shipmentId) patch.superfreteShipmentId = data.shipmentId;
        if (data.labelUrl !== undefined) patch.labelUrl = data.labelUrl || null;
        if (tracking) patch.trackingCode = tracking;
        if (data.superfreteStatus || data.status) {
          patch.superfreteStatus = data.superfreteStatus ?? data.status ?? null;
        }
        patch.labelAutoGenerateError = null;
        if (!paymentPending && data.shipmentId) {
          patch.shippingStatus = "packed";
        }
      }
      if (key === "sync") {
        const syncedCancelled =
          data.shippingStatus === "cancelled" ||
          isCancelledProviderShipmentStatus(
            data.superfreteStatus ?? data.status
          );
        if (syncedCancelled) {
          patch.shippingStatus = "cancelled";
          patch.superfreteStatus = "cancelled";
          patch.superfreteShipmentId = null;
          patch.labelUrl = null;
          patch.trackingCode = null;
          patch.labelGeneratedAt = null;
          setLocalTracking(null);
          setAwaitingTracking(false);
        } else {
          if (tracking) patch.trackingCode = tracking;
          if (data.labelUrl !== undefined) patch.labelUrl = data.labelUrl || null;
          if (data.shippingStatus) patch.shippingStatus = data.shippingStatus;
          if (data.superfreteStatus || data.status) {
            patch.superfreteStatus = data.superfreteStatus ?? data.status ?? null;
          }
          if (data.superfreteShipmentId !== undefined) {
            patch.superfreteShipmentId = data.superfreteShipmentId;
          }
        }
      }
      if (Object.keys(patch).length > 0) {
        onPatchOrder(order.id, patch);
      }

      if (opts?.openPdf !== false && data.shipmentId && !paymentPending) {
        window.open(`/api/admin/orders/${order.id}/label/pdf`, "_blank");
      }
      if (key === "label" && !tracking && !paymentPending) {
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

function orderHasUnpaidItems(order: ShipmentOrder): boolean {
  return (order.items ?? []).some(shipmentItemIsUnpaid);
}

function shipmentCapabilities(order: ShipmentOrder, trackingCode?: string | null) {
  const isArranged = order.fulfillmentType === "ARRANGED";
  const isSaleCancelled = order.status === "cancelled";
  const isPaid = Boolean(order.paidAt);
  const hasUnpaidItems = orderHasUnpaidItems(order);
  const insideDelivery = isInsideDelivery({
    fulfillmentType: order.fulfillmentType,
    shippingServiceName: order.shippingServiceName,
    deliveryNotes: order.deliveryNotes,
  });

  return {
    isArranged,
    isSaleCancelled,
    canSelectForBulk: !order.labelUrl && !isSaleCancelled && !isArranged && !hasUnpaidItems,
    canChangeShipping: !order.labelUrl && !order.superfreteShipmentId && !isSaleCancelled && !isArranged,
    canMarkPacked: isPaid && !isSaleCancelled && !hasUnpaidItems && order.shippingStatus === "to_pack",
    canMarkShipped: canManuallyMarkCarrierAsShipped({
      fulfillmentType: order.fulfillmentType,
      shippingStatus: order.shippingStatus,
      trackingCode: trackingCode ?? order.trackingCode,
    }),
    canMarkArrangedDelivered:
      insideDelivery &&
      isPaid &&
      !isSaleCancelled &&
      !hasUnpaidItems &&
      order.shippingStatus !== "delivered",
    canGenerateLabel:
      !isSaleCancelled &&
      !isArranged &&
      !hasUnpaidItems &&
      (!order.labelUrl ||
        order.shippingStatus === "cancelled" ||
        isCancelledProviderShipmentStatus(order.superfreteStatus)),
    hasUnpaidItems,
    labelAutoGenerateFailed: hasLabelAutoGenerateError(order),
    labelAutoGenerateTitle: labelAutoGenerateErrorTooltip(order),
  };
}

/* ─── Menu de ações da linha ──────────────────────────────────────── */

function ShipmentRowActionsMenu({
  order,
  busy,
  trackingCode,
  runAction,
  onChangeShipping,
  onViewPacking,
}: {
  order: ShipmentOrder;
  busy: string | null;
  trackingCode: string | null;
  runAction: (
    key: string,
    url: string,
    method?: string,
    body?: unknown,
    opts?: { openPdf?: boolean }
  ) => Promise<boolean>;
  onChangeShipping: () => void;
  onViewPacking: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const caps = shipmentCapabilities(order, trackingCode);

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

    items.push({
      id: "view-packing",
      label: "Ver detalhes",
      icon: (
        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .638C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      ),
      onClick: onViewPacking,
    });

    if (caps.canChangeShipping) {
      items.push({
        id: "change-shipping",
        label: "Alterar frete",
        separatorBefore: items.length > 0,
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
        icon: <PackBoxIcon />,
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

    if (caps.canMarkShipped) {
      items.push({
        id: "ship",
        label: busy === "ship" ? "Salvando…" : "Marcar como enviado",
        separatorBefore: items.length > 0,
        disabled: busy === "ship",
        icon: <TruckIcon className="h-[18px] w-[18px]" />,
        onClick: () =>
          void runAction(
            "ship",
            `/api/admin/orders/${order.id}`,
            "PATCH",
            { shippingStatus: "shipped" },
            { openPdf: false }
          ),
      });
    }

    if (caps.canGenerateLabel) {
      const pendingPayment =
        Boolean(order.superfreteShipmentId) &&
        !order.labelUrl &&
        order.superfreteStatus === "pending";
      items.push({
        id: "label",
        label:
          busy === "label"
            ? "Gerando…"
            : order.shippingStatus === "cancelled"
              ? "Gerar nova etiqueta"
              : pendingPayment
                ? "Tentar pagar etiqueta"
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

    if (caps.canMarkArrangedDelivered) {
      items.push({
        id: "arranged-delivered",
        label: busy === "arranged-delivered" ? "Salvando…" : "Marcar como entregue",
        separatorBefore: items.length > 0,
        disabled: busy === "arranged-delivered",
        icon: (
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        ),
        onClick: () =>
          void runAction(
            "arranged-delivered",
            `/api/admin/sales/${order.id}/mark-shipped`
          ),
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
            if (
              !confirm(
                `Cancelar a etiqueta no ${shippingProviderLabel(order.shippingProvider)}?`
              )
            )
              return;
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
    caps.canMarkArrangedDelivered,
    caps.canMarkPacked,
    caps.canMarkShipped,
    onChangeShipping,
    onViewPacking,
    order.id,
    order.labelUrl,
    order.shippingProvider,
    order.shippingStatus,
    order.superfreteShipmentId,
    order.superfreteStatus,
    runAction,
  ]);

  return (
    <td className="px-3 py-3.5" onClick={(event) => event.stopPropagation()}>
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
  onPatchOrder,
  selected,
  onToggleSelect,
  onChangeShipping,
  onViewPacking,
}: {
  order: ShipmentOrder;
  onPatchOrder: (id: string, patch: Partial<ShipmentOrder>) => void;
  selected: boolean;
  onToggleSelect: () => void;
  onChangeShipping: () => void;
  onViewPacking: () => void;
}) {
  const { busy, error, trackingCode, awaitingTracking, runAction } =
    useShipmentActions(order, onPatchOrder);
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
  const saleNotes = order.internalNotes?.trim() ?? "";
  const deliveryNotesHint = shipmentDeliveryUserNotes(order) ?? "";

  return (
    <tr
      className="cursor-pointer border-b border-stone-100 align-top transition-colors hover:bg-stone-50/60"
      onClick={onViewPacking}
    >
      <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
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
            {saleNotes ? (
              <span onClick={(event) => event.stopPropagation()}>
                <OrderNotesHint
                  notes={saleNotes}
                  title="Observações da venda"
                  ariaLabel="Ver observações internas da venda"
                  tone="violet"
                  icon="doc"
                />
              </span>
            ) : null}
            {deliveryNotesHint ? (
              <span onClick={(event) => event.stopPropagation()}>
                <OrderNotesHint
                  notes={deliveryNotesHint}
                  title="Observações da entrega"
                  ariaLabel="Ver observações da entrega"
                  tone="sky"
                  icon="truck"
                />
              </span>
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
        {order.paidAt ? (
          <>
            <p className={TABLE_CELL_PRIMARY}>{fmtDate(order.paidAt)}</p>
            <p className={TABLE_CELL_SECONDARY}>{fmtTime(order.paidAt)}</p>
          </>
        ) : (
          <p className={TABLE_CELL_SECONDARY}>—</p>
        )}
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
              href={shippingTrackingUrl(trackingCode, order.shippingProvider)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-stone-800 underline decoration-stone-300 underline-offset-2 hover:text-stone-950"
            >
              {trackingCode}
            </a>
            <CopyTrackingLinkButton
              code={trackingCode}
              provider={order.shippingProvider}
            />
          </div>
        ) : order.superfreteStatus === "pending" && order.superfreteShipmentId ? (
          <span
            className="text-xs font-medium text-amber-700"
            title={`Pague a etiqueta no ${shippingProviderLabel(order.shippingProvider)} e sincronize.`}
          >
            Aguardando pagamento ({shippingProviderLabel(order.shippingProvider)})
          </span>
        ) : awaitingTracking ? (
          <span className="text-xs text-stone-400">Buscando rastreio…</span>
        ) : order.labelUrl || order.superfreteShipmentId ? (
          <span
            className="text-xs text-stone-400"
            title="Etiqueta gerada. O código de rastreio pode demorar a aparecer no provedor — use Sincronizar status."
          >
            Rastreio pendente
          </span>
        ) : (
          <span className="text-xs text-stone-300">—</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        <p className={`tabular-nums ${TABLE_CELL_PRIMARY}`}>
          {freightPrice != null ? formatPrice(freightPrice) : "—"}
        </p>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5">
        <TableShippingStatus
          status={order.shippingStatus}
          shippingMethod={shippingMethod}
        />
      </td>
      <ShipmentRowActionsMenu
        order={order}
        busy={busy}
        trackingCode={trackingCode}
        runAction={runAction}
        onChangeShipping={onChangeShipping}
        onViewPacking={onViewPacking}
      />
    </tr>
  );
}

/* ─── Componente principal ────────────────────────────────────────── */

type MelhorEnvioStatus = {
  enabled: boolean;
  activeProvider: string;
  configured: boolean;
  connected: boolean;
  environmentLabel: string | null;
  walletUrl: string | null;
  expiresAt: string | null;
  error?: string;
};

export function ShippingManager() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState<ShipmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [listAllTotal, setListAllTotal] = useState(0);
  const [listLimit, setListLimit] = useState(50);
  const [filterCounts, setFilterCounts] = useState({
    needs_label: 0,
    to_pack: 0,
    packed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  });
  const [printPackingOrders, setPrintPackingOrders] = useState<ShipmentOrder[] | null>(
    null
  );
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [meStatus, setMeStatus] = useState<MelhorEnvioStatus | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [meMsg, setMeMsg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [shippingModalOrder, setShippingModalOrder] = useState<ShipmentOrder | null>(null);
  const [packingModalOrder, setPackingModalOrder] = useState<ShipmentOrder | null>(null);
  const [packingBusy, setPackingBusy] = useState(false);
  const [printingPackingList, setPrintingPackingList] = useState(false);
  const [showFreightQuoteModal, setShowFreightQuoteModal] = useState(false);
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

  const fetchMelhorEnvioStatus = useCallback(async () => {
    setMeLoading(true);
    try {
      const res = await fetch("/api/admin/melhor-envio/status");
      const data = (await res.json()) as MelhorEnvioStatus;
      if (!res.ok) {
        setMeStatus(null);
        setMeMsg(data.error ?? "Não foi possível consultar Melhor Envio.");
        return;
      }
      setMeStatus(data);
    } catch {
      setMeStatus(null);
      setMeMsg("Erro de conexão ao consultar Melhor Envio.");
    } finally {
      setMeLoading(false);
    }
  }, []);

  const connectMelhorEnvio = useCallback(async () => {
    setMeMsg(null);
    try {
      const res = await fetch("/api/admin/melhor-envio/authorize");
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setMeMsg(data.error ?? "Não foi possível iniciar a autorização.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setMeMsg("Erro ao iniciar autorização Melhor Envio.");
    }
  }, []);

  const disconnectMelhorEnvio = useCallback(async () => {
    if (!confirm("Desconectar a conta Melhor Envio desta loja?")) return;
    setMeMsg(null);
    try {
      const res = await fetch("/api/admin/melhor-envio/disconnect", {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMeMsg(data.error ?? "Falha ao desconectar.");
        return;
      }
      setMeMsg("Conta Melhor Envio desconectada.");
      await fetchMelhorEnvioStatus();
    } catch {
      setMeMsg("Erro ao desconectar Melhor Envio.");
    }
  }, [fetchMelhorEnvioStatus]);

  const fetchShipments = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) {
        setLoading(true);
        setSelectedIds(new Set());
        setBulkMsg(null);
      }
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        if (filter) params.set("filter", filter);
        if (debouncedSearch) params.set("q", debouncedSearch);
        const res = await fetch(`/api/admin/shipments?${params.toString()}`);
        const data = (await res.json()) as {
          orders?: ShipmentOrder[];
          total?: number;
          allTotal?: number;
          page?: number;
          limit?: number;
          counts?: typeof filterCounts;
          error?: string;
        };
        if (!res.ok) {
          console.error(data.error);
          if (!silent) setOrders([]);
          return;
        }
        setOrders(data.orders ?? []);
        setListTotal(data.total ?? 0);
        setListAllTotal(data.allTotal ?? data.total ?? 0);
        setListLimit(data.limit ?? 50);
        if (data.counts) setFilterCounts(data.counts);
        if (data.page && data.page !== page) setPage(data.page);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, filter, debouncedSearch]
  );

  const patchOrder = useCallback((id: string, patch: Partial<ShipmentOrder>) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === id ? { ...order, ...patch } : order))
    );
  }, []);

  useEffect(() => {
    void fetchShipments();
  }, [fetchShipments]);

  useEffect(() => {
    if (!isAdmin) {
      setWallet(null);
      setWalletError(null);
      setWalletLoading(false);
      setMeStatus(null);
      return;
    }
    void fetchWallet();
    void fetchMelhorEnvioStatus();
  }, [fetchWallet, fetchMelhorEnvioStatus, isAdmin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("me_oauth");
    if (!oauth) return;
    if (oauth === "ok") {
      setMeMsg("Melhor Envio conectado com sucesso.");
      void fetchMelhorEnvioStatus();
    } else {
      setMeMsg(
        params.get("me_oauth_msg") || "Falha na autorização do Melhor Envio."
      );
    }
    params.delete("me_oauth");
    params.delete("me_oauth_msg");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }, [fetchMelhorEnvioStatus]);

  const visibleOrders = orders;

  const finishPackingListPrint = useCallback(() => {
    setPrintingPackingList(false);
    setPrintPackingOrders(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = customerSearchQuery.trim();
      setDebouncedSearch((current) => {
        if (current !== next) setPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [customerSearchQuery]);

  async function startPackingListPrint() {
    try {
      const res = await fetch("/api/admin/shipments?filter=to_pack&limit=200");
      const data = (await res.json()) as { orders?: ShipmentOrder[]; error?: string };
      if (!res.ok) {
        alert(data.error ?? "Não foi possível montar a lista por embalar.");
        return;
      }
      setPrintPackingOrders(data.orders ?? []);
      setPrintingPackingList(true);
    } catch {
      alert("Erro de conexão.");
    }
  }

  useEffect(() => {
    if (!allRef.current) return;
    const selectable = visibleOrders.filter((o) => shipmentCapabilities(o).canSelectForBulk);
    const n = selectedIds.size;
    allRef.current.indeterminate = n > 0 && n < selectable.length;
    allRef.current.checked = n === selectable.length && selectable.length > 0;
  }, [selectedIds, visibleOrders]);

  const refreshAll = (opts?: { silent?: boolean }) => {
    void fetchShipments(opts);
    if (isAdmin) void fetchWallet();
  };

  function toggleFilter(key: FilterKey) {
    setPage(1);
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
      refreshAll({ silent: true });
    } catch {
      setBulkMsg("Erro de conexão.");
    } finally {
      setBulkLoading(false);
    }
  }

  const lowBalance = isAdmin && wallet != null && wallet.balance < 20;
  const hasCustomerSearch = customerSearchQuery.trim().length > 0;
  const hasActiveFilter = filter !== null;
  const hasListFilters = hasActiveFilter || hasCustomerSearch;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Envios</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            {hasListFilters
              ? `${listTotal} de ${listAllTotal} envio${listAllTotal !== 1 ? "s" : ""}`
              : `${listAllTotal} envio${listAllTotal !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFreightQuoteModal(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 ${SHIPPING_TOOLBAR_SIZE}`}
          >
            <TruckIcon className="h-3.5 w-3.5" />
            Calcular frete
          </button>
          <button
            type="button"
            onClick={() => refreshAll()}
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
      </div>

      {isAdmin ? (
      <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
              Melhor Envio
            </p>
            {meLoading ? (
              <p className="mt-1 text-sm text-stone-400">Consultando…</p>
            ) : meStatus ? (
              <>
                <p className="mt-1 text-sm text-stone-800">
                  {meStatus.enabled
                    ? meStatus.connected
                      ? `Conectado · provedor ativo: ${meStatus.activeProvider}`
                      : "Habilitado, mas ainda não autorizado"
                    : "Desabilitado (MELHOR_ENVIO_ENABLED)"}
                  {meStatus.environmentLabel
                    ? ` · ${meStatus.environmentLabel}`
                    : ""}
                </p>
                {meStatus.expiresAt ? (
                  <p className="mt-1 text-xs text-stone-500">
                    Token válido até{" "}
                    {new Date(meStatus.expiresAt).toLocaleString("pt-BR")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-sm text-stone-500">
                Configure as variáveis do Melhor Envio para conectar.
              </p>
            )}
            {meMsg ? (
              <p className="mt-2 text-sm text-stone-700">{meMsg}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {meStatus?.walletUrl ? (
              <a
                href={meStatus.walletUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center justify-center rounded-lg bg-emerald-100 px-3 text-xs font-semibold text-emerald-900 shadow-sm ring-1 ring-emerald-200/80 transition-colors hover:bg-emerald-200 ${SHIPPING_TOOLBAR_SIZE}`}
              >
                Carteira ME
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void connectMelhorEnvio()}
              className={`inline-flex items-center justify-center rounded-lg bg-stone-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-stone-800 ${SHIPPING_TOOLBAR_SIZE}`}
            >
              {meStatus?.connected ? "Reconectar" : "Conectar"}
            </button>
            {meStatus?.connected ? (
              <button
                type="button"
                onClick={() => void disconnectMelhorEnvio()}
                className={`inline-flex items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 ${SHIPPING_TOOLBAR_SIZE}`}
              >
                Desconectar
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void fetchMelhorEnvioStatus()}
              disabled={meLoading}
              className={`inline-flex items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-50 ${SHIPPING_TOOLBAR_SIZE}`}
            >
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        {wallet?.environment === "sandbox" ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="font-semibold">Modo Sandbox SuperFrete</span> — legado, usado quando Melhor Envio não está ativo.
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
      </div>
      ) : null}

      <div className="flex min-w-0 w-full flex-col gap-1.5">
        <div className="flex min-w-0 w-full flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
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
          <label className="relative w-full shrink-0 md:w-52 lg:w-64">
          <span className="sr-only">Buscar por cliente ou número do pedido</span>
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            inputMode="search"
            value={customerSearchQuery}
            onChange={(event) => setCustomerSearchQuery(event.target.value)}
            placeholder="Buscar cliente ou pedido…"
            className={`w-full rounded-lg border border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 ${SHIPPING_TOOLBAR_SIZE} pl-8 ${hasCustomerSearch ? "pr-8" : "pr-3"}`}
          />
          {hasCustomerSearch ? (
            <button
              type="button"
              onClick={() => setCustomerSearchQuery("")}
              aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          ) : null}
          </label>
        </div>
        {filter === "to_pack" && filterCounts.to_pack > 0 ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void startPackingListPrint()}
              className={`inline-flex shrink-0 items-center gap-1.5 border-stone-200 bg-white text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50 ${SHIPPING_TOOLBAR_CONTROL}`}
              title="Imprimir lista de todos os pedidos por embalar"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.163a48.042 48.042 0 0 1 1.087-.128m12.725 0c.977.148 1.837 1.082 1.837 2.163V15.75A2.25 2.25 0 0 1 18.66 18h-1.08m-12.725 0h12.725" />
              </svg>
              Imprimir lista
            </button>
          </div>
        ) : null}
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

      <ExchangeShipmentQueue filter={filter} />

      {loading ? (
        <div className="flex items-center gap-2.5 py-10 text-sm text-stone-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" />
          Carregando envios…
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-stone-50 py-14 text-center">
          <p className="text-sm text-stone-500">
            {hasCustomerSearch
              ? `Nenhum envio encontrado para “${customerSearchQuery.trim()}”.`
              : hasActiveFilter
                ? "Nenhum envio neste filtro."
                : "Nenhum envio encontrado."}
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
                  <th className="px-4 py-3.5 text-left">Pagamento</th>
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
                    onPatchOrder={patchOrder}
                    selected={selectedIds.has(order.id)}
                    onToggleSelect={() => toggleSelect(order.id)}
                    onChangeShipping={() => setShippingModalOrder(order)}
                    onViewPacking={() => setPackingModalOrder(order)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AdminListPagination
        page={page}
        limit={listLimit}
        total={listTotal}
        disabled={loading}
        onPageChange={setPage}
      />

      {shippingModalOrder ? (
        <ChangeShippingModal
          order={shippingModalOrder}
          onClose={() => setShippingModalOrder(null)}
          onSaved={(patch) => {
            patchOrder(shippingModalOrder.id, patch);
          }}
        />
      ) : null}

      {showFreightQuoteModal ? (
        <QuickFreightQuoteModal onClose={() => setShowFreightQuoteModal(false)} />
      ) : null}

      {packingModalOrder ? (
        <PackingSlipModal
          order={
            orders.find((o) => o.id === packingModalOrder.id) ?? packingModalOrder
          }
          canMarkPacked={
            shipmentCapabilities(
              orders.find((o) => o.id === packingModalOrder.id) ?? packingModalOrder
            ).canMarkPacked
          }
          canMarkShipped={
            shipmentCapabilities(
              orders.find((o) => o.id === packingModalOrder.id) ?? packingModalOrder
            ).canMarkShipped
          }
          packingBusy={packingBusy}
          onClose={() => setPackingModalOrder(null)}
          onMarkPacked={() => {
            void (async () => {
              const orderId = packingModalOrder.id;
              setPackingBusy(true);
              try {
                const res = await fetch(`/api/admin/orders/${orderId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ shippingStatus: "packed" }),
                });
                if (!res.ok) {
                  const data = (await res.json()) as { error?: string };
                  alert(data.error ?? "Erro ao marcar como embalada.");
                  return;
                }
                patchOrder(orderId, { shippingStatus: "packed" });
                setPackingModalOrder(null);
              } catch {
                alert("Erro de conexão.");
              } finally {
                setPackingBusy(false);
              }
            })();
          }}
          onMarkShipped={() => {
            void (async () => {
              const orderId = packingModalOrder.id;
              setPackingBusy(true);
              try {
                const res = await fetch(`/api/admin/orders/${orderId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ shippingStatus: "shipped" }),
                });
                if (!res.ok) {
                  const data = (await res.json()) as { error?: string };
                  alert(data.error ?? "Erro ao marcar como enviado.");
                  return;
                }
                patchOrder(orderId, { shippingStatus: "shipped" });
                setPackingModalOrder(null);
              } catch {
                alert("Erro de conexão.");
              } finally {
                setPackingBusy(false);
              }
            })();
          }}
        />
      ) : null}

      {printingPackingList ? (
        <PackingListPrint
          orders={printPackingOrders ?? []}
          onDone={finishPackingListPrint}
        />
      ) : null}
    </div>
  );
}
