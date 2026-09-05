export function computeDashboardCashNet(input: {
  cashInTotal: number;
  cashOutTotal: number;
}): number {
  return Math.round((input.cashInTotal - input.cashOutTotal) * 100) / 100;
}

export function computeDashboardOperatingNet(input: {
  cashNet: number;
  storeShippingCost: number;
}): number {
  return Math.round((input.cashNet - input.storeShippingCost) * 100) / 100;
}

/** Frete pago pela loja: etiqueta gerada conta mesmo se a troca for cancelada depois. */
const DASHBOARD_CASH_KEYS = [
  "exchangeBalanceReceived",
  "exchangeRefundTotal",
  "storeShippingCost",
  "cashInTotal",
  "cashOutTotal",
  "cashNet",
  "operatingNet",
] as const;

export function omitDashboardCashFields<T extends Record<string, unknown>>(
  metrics: T
): Omit<T, (typeof DASHBOARD_CASH_KEYS)[number]> {
  const next = { ...metrics };
  for (const key of DASHBOARD_CASH_KEYS) {
    delete next[key];
  }
  return next;
}

export function shouldCountStoreShippingCost(input: {
  paidBy: string;
  cost: number;
  labelGeneratedAt: Date | null;
  createdAt: Date;
  exchangeCancelled: boolean;
  periodStart: Date;
  periodEnd: Date;
}): boolean {
  if (input.paidBy !== "STORE" || input.cost <= 0) return false;
  if (input.labelGeneratedAt) {
    return (
      input.labelGeneratedAt >= input.periodStart &&
      input.labelGeneratedAt <= input.periodEnd
    );
  }
  if (input.exchangeCancelled) return false;
  return (
    input.createdAt >= input.periodStart && input.createdAt <= input.periodEnd
  );
}
