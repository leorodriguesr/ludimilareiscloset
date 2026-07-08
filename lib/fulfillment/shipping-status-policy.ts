/** Regras de edição de status de envio (sem dependência do Prisma — seguro para client). */

export function isCarrierShippingStatusLocked(input: {
  fulfillmentType?: string | null;
  shippingStatus: string;
}): boolean {
  if (input.fulfillmentType === "ARRANGED") return false;
  return input.shippingStatus === "shipped" || input.shippingStatus === "delivered";
}

export function canManuallyChangeShippingStatus(input: {
  fulfillmentType?: string | null;
  shippingStatus: string;
}): boolean {
  return !isCarrierShippingStatusLocked(input);
}
