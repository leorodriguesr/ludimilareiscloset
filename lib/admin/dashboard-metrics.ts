import {
  isInsideDelivery,
  isStoreMotoboyDelivery,
} from "@/lib/admin-sale/arranged-delivery";
import {
  computeDashboardCashNet,
  computeDashboardOperatingNet,
  omitDashboardCashFields,
} from "@/lib/admin/dashboard-cash";
import {
  CashLedgerKind,
  ExchangeShippingPaidBy,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import { ORDER_STATUS } from "@/lib/orders/constants";
import { expireOrdersBatch } from "@/lib/orders/expire-orders";
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
  totalSalesCount: number;
  cancelledCount: number;
  waitingCount: number;
  productsSoldCount: number;
  revenueTotal: number;
  outboundSalesCount: number;
  inboundSalesCount: number;
  motoboyDeliveriesCount: number;
  salesByState: DashboardStateRow[];
  exchangeAdditionalSaleCount: number;
  exchangeAdditionalItemsCount: number;
  exchangeAdditionalRevenue: number;
  /** Soma dos pedidos pagos no período, sem trocas. */
  orderRevenueTotal: number;
  /** Diferenças de troca recebidas no período. */
  exchangeBalanceReceived: number;
  /** Reembolsos de troca confirmados no período. */
  exchangeRefundTotal: number;
  /** Custo de frete pago pela loja (trocas) no período. */
  storeShippingCost: number;
  /** Todas as entradas registradas no ledger. */
  cashInTotal: number;
  /** Todas as saídas registradas no ledger. */
  cashOutTotal: number;
  /** Entradas − saídas registradas no ledger. */
  cashNet: number;
  /** Caixa líquido − custos de frete de troca pagos pela loja. */
  operatingNet: number;
};

/** Gestor vê operação; números de caixa ficam só com o admin. */
export function dashboardMetricsForRole(
  metrics: DashboardMetrics,
  role: string
) {
  if (role === "ADMIN") return metrics;
  return omitDashboardCashFields(metrics);
}

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

function dateInRange(
  value: Date | null | undefined,
  bounds: { gte: Date; lte: Date }
): boolean {
  return Boolean(value && value >= bounds.gte && value <= bounds.lte);
}

export async function getDashboardMetrics(
  range: DashboardDateRange
): Promise<DashboardMetrics> {
  const bounds = rangeToUtcBounds(range);

  try {
    await expireOrdersBatch();
  } catch (error) {
    console.error("[dashboard-metrics] expire batch", error);
  }

  const inPeriod = { gte: bounds.gte, lte: bounds.lte };
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { paidAt: inPeriod },
        { createdAt: inPeriod },
        { cancelledAt: inPeriod },
        { expiredAt: inPeriod },
      ],
    },
    select: {
      status: true,
      paidAt: true,
      createdAt: true,
      cancelledAt: true,
      expiredAt: true,
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
    const isCancelled =
      order.status === ORDER_STATUS.CANCELLED ||
      order.status === ORDER_STATUS.EXPIRED;
    const paidInPeriod = dateInRange(order.paidAt, bounds);
    const createdInPeriod = dateInRange(order.createdAt, bounds);
    const cancelledInPeriod =
      dateInRange(order.cancelledAt, bounds) ||
      dateInRange(order.expiredAt, bounds) ||
      (!order.cancelledAt && !order.expiredAt && createdInPeriod);

    if (isCancelled && cancelledInPeriod) cancelledCount += 1;
    else if (paidInPeriod && !isCancelled) paidCount += 1;
    else if (
      order.status === ORDER_STATUS.PENDING_PAYMENT &&
      createdInPeriod
    ) {
      waitingCount += 1;
    }

    if (!paidInPeriod || isCancelled) continue;

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

    const state = normalizeState(order.addressState) ?? "Não informado";
    stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
  }

  const [extraSales, ledgerRows, storeShippings] = await Promise.all([
    prisma.exchange.findMany({
      where: {
        additionalSaleRecognizedAt: inPeriod,
        additionalSaleItemCount: { gt: 0 },
        status: { not: ExchangeStatus.CANCELLED },
      },
      select: {
        additionalSaleItemCount: true,
        additionalSaleItemsTotal: true,
      },
    }),
    prisma.cashLedgerEntry.findMany({
      where: {
        createdAt: inPeriod,
      },
      select: { kind: true, direction: true, amount: true },
    }),
    prisma.exchangeShipping.findMany({
      where: {
        paidBy: ExchangeShippingPaidBy.STORE,
        cost: { gt: 0 },
        OR: [
          { labelGeneratedAt: inPeriod },
          {
            AND: [
              { labelGeneratedAt: null },
              { createdAt: inPeriod },
              { exchange: { status: { not: ExchangeStatus.CANCELLED } } },
            ],
          },
        ],
      },
      select: { cost: true },
    }),
  ]);
  const exchangeAdditionalSaleCount = extraSales.length;
  const exchangeAdditionalItemsCount = extraSales.reduce(
    (sum, row) => sum + row.additionalSaleItemCount,
    0
  );
  const exchangeAdditionalRevenue = Math.round(
    extraSales.reduce((sum, row) => sum + row.additionalSaleItemsTotal, 0) * 100
  ) / 100;
  productsSoldCount += exchangeAdditionalItemsCount;
  const orderRevenueTotal = Math.round(revenueTotal * 100) / 100;
  revenueTotal += exchangeAdditionalRevenue;
  const exchangeBalanceReceived = Math.round(
    ledgerRows
      .filter((row) => row.kind === CashLedgerKind.EXCHANGE_BALANCE)
      .reduce((sum, row) => sum + row.amount, 0) * 100
  ) / 100;
  const exchangeRefundTotal = Math.round(
    ledgerRows
      .filter((row) => row.kind === CashLedgerKind.EXCHANGE_REFUND)
      .reduce((sum, row) => sum + row.amount, 0) * 100
  ) / 100;
  const storeShippingCost = Math.round(
    storeShippings.reduce((sum, row) => sum + (row.cost ?? 0), 0) * 100
  ) / 100;
  const cashInTotal = Math.round(
    ledgerRows
      .filter((row) => row.direction === "IN")
      .reduce((sum, row) => sum + row.amount, 0) * 100
  ) / 100;
  const cashOutTotal = Math.round(
    ledgerRows
      .filter((row) => row.direction === "OUT")
      .reduce((sum, row) => sum + row.amount, 0) * 100
  ) / 100;
  const cashNet = computeDashboardCashNet({
    cashInTotal,
    cashOutTotal,
  });
  const operatingNet = computeDashboardOperatingNet({
    cashNet,
    storeShippingCost,
  });
  const totalSalesCount = paidCount + exchangeAdditionalSaleCount;

  const salesByState = [...stateCounts.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort(
      (a, b) => b.count - a.count || a.state.localeCompare(b.state, "pt-BR")
    );

  return {
    from: range.from,
    to: range.to,
    paidCount,
    totalSalesCount,
    cancelledCount,
    waitingCount,
    productsSoldCount,
    revenueTotal: Math.round(revenueTotal * 100) / 100,
    outboundSalesCount,
    inboundSalesCount,
    motoboyDeliveriesCount,
    salesByState,
    exchangeAdditionalSaleCount,
    exchangeAdditionalItemsCount,
    exchangeAdditionalRevenue,
    orderRevenueTotal,
    exchangeBalanceReceived,
    exchangeRefundTotal,
    storeShippingCost,
    cashInTotal,
    cashOutTotal,
    cashNet,
    operatingNet,
  };
}
