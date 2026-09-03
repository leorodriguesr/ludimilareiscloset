/** Preenche `deliveredAt` só na primeira transição para entregue. */
export function deliveredAtOnStatusChange(input: {
  currentDeliveredAt?: Date | null;
  nextShippingStatus?: string | null;
  at?: Date;
}): { deliveredAt: Date } | Record<string, never> {
  if (input.nextShippingStatus !== "delivered") return {};
  if (input.currentDeliveredAt) return {};
  return { deliveredAt: input.at ?? new Date() };
}
