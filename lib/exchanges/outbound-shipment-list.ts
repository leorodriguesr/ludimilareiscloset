import { searchDigits } from "@/lib/admin/list-pagination";
import { ExchangeStatus } from "@/app/generated/prisma/client";

export type ShipmentListFilter =
  | "needs_label"
  | "to_pack"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled";

/** Trocas com reenvio visível na lista de envios (fila + histórico). */
export const EXCHANGE_OUTBOUND_LIST_STATUSES: ExchangeStatus[] = [
  ExchangeStatus.READY_OUTBOUND,
  ExchangeStatus.OUTBOUND,
  ExchangeStatus.COMPLETED,
  ExchangeStatus.CANCELLED,
];

export function resolveExchangeOutboundListPaidAt(input: {
  balancePaidAt: Date | null;
  outboundDefinedAt: Date | null;
  inspectedAt: Date | null;
  createdAt: Date;
}): Date {
  return (
    input.balancePaidAt ??
    input.outboundDefinedAt ??
    input.inspectedAt ??
    input.createdAt
  );
}

export function mapExchangeOutboundListStatus(shippingStatus: string): Exclude<
  ShipmentListFilter,
  "needs_label"
> {
  const status = shippingStatus.trim().toLowerCase();
  if (status === "cancelled") return "cancelled";
  if (status === "delivered") return "delivered";
  if (status === "posted" || status === "shipped") return "shipped";
  if (status === "packed") return "packed";
  return "to_pack";
}

export function exchangeOutboundMatchesFilter(input: {
  shippingStatus: string;
  labelUrl: string | null;
  fulfillmentType: string;
  exchangeStatus?: string | null;
  filter: string | null;
}): boolean {
  if (input.exchangeStatus === ExchangeStatus.CANCELLED) {
    return input.filter === "cancelled";
  }
  const status = mapExchangeOutboundListStatus(input.shippingStatus);
  if (!input.filter) return true;
  if (input.filter === "needs_label") {
    return (
      !input.labelUrl &&
      input.fulfillmentType === "CARRIER" &&
      status !== "cancelled"
    );
  }
  return status === input.filter;
}

export function exchangeOutboundMatchesSearch(
  row: {
    exchangeNumber: number | null;
    recipientName: string | null;
    email: string | null;
    trackingCode: string | null;
  },
  query: string
): boolean {
  const q = query.trim();
  if (!q) return true;
  const haystack = [
    row.recipientName ?? "",
    row.email ?? "",
    row.trackingCode ?? "",
    row.exchangeNumber != null ? String(row.exchangeNumber) : "",
    "troca",
  ]
    .join(" ")
    .toLowerCase();
  if (haystack.includes(q.toLowerCase())) return true;
  const number = searchDigits(q);
  return number != null && row.exchangeNumber === number;
}

export function sliceMergedShipmentPage<
  T extends { id: string; sortAt: number },
  U extends { id: string; sortAt: number },
>(
  pageOrders: T[],
  exchanges: U[],
  offset: number,
  limit: number
): Array<T | U> {
  return [...pageOrders, ...exchanges]
    .sort((a, b) => {
      if (b.sortAt !== a.sortAt) return b.sortAt - a.sortAt;
      return a.id.localeCompare(b.id);
    })
    .slice(offset, offset + limit);
}
