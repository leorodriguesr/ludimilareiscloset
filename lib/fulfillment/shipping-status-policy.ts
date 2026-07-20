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

/**
 * Override manual para transportadora (ex.: Jadlog sem update da SuperFrete):
 * só com código de rastreio e enquanto ainda não estiver enviado/entregue/cancelado.
 */
export function canManuallyMarkCarrierAsShipped(input: {
  fulfillmentType?: string | null;
  shippingStatus: string;
  trackingCode?: string | null;
}): boolean {
  if (input.fulfillmentType === "ARRANGED") return false;
  if (!input.trackingCode?.trim()) return false;
  return (
    input.shippingStatus !== "shipped" &&
    input.shippingStatus !== "delivered" &&
    input.shippingStatus !== "cancelled"
  );
}
