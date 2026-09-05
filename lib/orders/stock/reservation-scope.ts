export function orderStockReservationWhere(orderId: string) {
  return {
    orderId,
    exchangeId: null,
  } as const;
}
