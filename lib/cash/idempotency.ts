export function cashLedgerIdempotencyKey(
  kind:
    | "sale"
    | "exchange-balance"
    | "exchange-refund"
    | "order-cancel"
    | "manual",
  sourceId: string
): string {
  const id = sourceId.trim();
  return `${kind}:${id}`;
}

export function orderCancellationLedgerKey(
  orderId: string,
  paidAt: Date | null
): string {
  return cashLedgerIdempotencyKey(
    "order-cancel",
    `${orderId}:${paidAt?.toISOString() ?? "paid"}`
  );
}

export function orderReactivationLedgerKey(
  orderId: string,
  cancelledAt: Date | null
): string {
  return cashLedgerIdempotencyKey(
    "manual",
    `${orderId}:reactivation:${cancelledAt?.toISOString() ?? "cancelled"}`
  );
}
