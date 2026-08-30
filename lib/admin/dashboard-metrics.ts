import {
  isInsideDelivery,
  isStoreMotoboyDelivery,
} from "@/lib/admin-sale/arranged-delivery";
import { ORDER_STATUS } from "@/lib/orders/constants";
import { prisma } from "@/lib/prisma";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type DashboardDateRange = { from: string; to: string };

export type DashboardStateRow = {
  state: string;
  count: number;
};

export type DashboardMetrics = {
  from: string;
  to: string;
  paidCount: number;
  cancelledCount: number;
  waitingCount: number;
  productsSoldCount: number;
  revenueTotal: number;
  outboundSalesCount: number;
  inboundSalesCount: number;
  motoboyDeliveriesCount: number;
  salesByState: DashboardStateRow[];
};

function todayKeyInSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function currentMonthRange(now = new Date()): DashboardDateRange {
  const today = todayKeyInSaoPaulo(now);
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

function normalizeRange(
  from: string | null,
  to: string | null
): DashboardDateRange {
  const fallback = currentMonthRange();
  const rawFrom = from && DATE_KEY.test(from) ? from : "";
  const rawTo = to && DATE_KEY.test(to) ? to : "";
  if (!rawFrom && !rawTo) return fallback;
  if (!rawFrom) return { from: rawTo, to: rawTo };
  if (!rawTo) return { from: rawFrom, to: rawFrom };
  return rawFrom <= rawTo
    ? { from: rawFrom, to: rawTo }
    : { from: rawTo, to: rawFrom };
}

function rangeToUtcBounds(range: DashboardDateRange): { gte: Date; lte: Date } {
  return {
    gte: new Date(`${range.from}T00:00:00.000-03:00`),
    lte: new Date(`${range.to}T23:59:59.999-03:00`),
  };
}

function normalizeState(value: string | null): string | null {
  const trimmed = value?.trim().toUpperCase() ?? "";
  if (!trimmed) return null;
  if (trimmed === "NÃO INFORMADO" || trimmed === "NAO INFORMADO") return null;
  return trimmed;
}

export function parseDashboardDateRange(
  from: string | null,
  to: string | null
): DashboardDateRange {
  return normalizeRange(from, to);
}

export async function getDashboardMetrics(
  range: DashboardDateRange
): Promise<DashboardMetrics> {
  const bounds = rangeToUtcBounds(range);

  const orders = await prisma.order.findMany({
    where: {
      paidAt: {
        gte: bounds.gte,
        lte: bounds.lte,
      },
    },
    select: {
      status: true,
      paidAt: true,
      fulfillmentType: true,
      shippingServiceName: true,
      deliveryNotes: true,
      addressState: true,
      total: true,
      items: { select: { quantity: true } },
    },
  });

  let paidCount = 0;
  let cancelledCount = 0;
  let waitingCount = 0;
  let productsSoldCount = 0;
  let revenueTotal = 0;
  let outboundSalesCount = 0;
  let inboundSalesCount = 0;
  let motoboyDeliveriesCount = 0;
  const stateCounts = new Map<string, number>();

  for (const order of orders) {
    const isPaid = order.status === ORDER_STATUS.PAID || Boolean(order.paidAt);
    const isCancelled =
      order.status === ORDER_STATUS.CANCELLED ||
      order.status === ORDER_STATUS.EXPIRED;

    if (isCancelled) cancelledCount += 1;
    else if (isPaid) paidCount += 1;
    else if (order.status === ORDER_STATUS.PENDING_PAYMENT) waitingCount += 1;

    if (!isPaid || isCancelled) continue;

    revenueTotal += order.total;
    productsSoldCount += order.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const deliveryInput = {
      fulfillmentType: order.fulfillmentType,
      shippingServiceName: order.shippingServiceName,
      deliveryNotes: order.deliveryNotes,
    };

    if (isInsideDelivery(deliveryInput)) {
      inboundSalesCount += 1;
      if (isStoreMotoboyDelivery(deliveryInput)) {
        motoboyDeliveriesCount += 1;
      }
    } else {
      outboundSalesCount += 1;
    }

    const state = normalizeState(order.addressState);
    if (!state) continue;
    stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
  }

  const salesByState = [...stateCounts.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort(
      (a, b) => b.count - a.count || a.state.localeCompare(b.state, "pt-BR")
    );

  return {
    from: range.from,
    to: range.to,
    paidCount,
    cancelledCount,
    waitingCount,
    productsSoldCount,
    revenueTotal: Math.round(revenueTotal * 100) / 100,
    outboundSalesCount,
    inboundSalesCount,
    motoboyDeliveriesCount,
    salesByState,
  };
}
