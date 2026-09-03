import type { ExchangeShippingMethod } from "@/app/generated/prisma/client";
import { parseArrangedDeliveryMode } from "@/lib/admin-sale/arranged-delivery";

export const EXCHANGE_SHIPPING_METHOD_LABELS: Record<
  ExchangeShippingMethod,
  string
> = {
  CARRIER: "Transportadora",
  STORE_PICKUP: "Na loja / retirada",
  LOCAL_COURIER: "Moto boy da loja",
};

/** Como a peça volta (troca e devolução). */
export const EXCHANGE_RETURN_METHOD_LABELS: Record<
  ExchangeShippingMethod,
  string
> = {
  CARRIER: "Transportadora",
  LOCAL_COURIER: "Moto boy da loja",
  STORE_PICKUP: "Será devolvida pela cliente",
};

/** Frete do moto boy quando a cliente paga o reenvio. */
export const LOCAL_COURIER_CUSTOMER_FEE = 18;

export function isLocalExchangeShippingMethod(
  method: ExchangeShippingMethod | string | null | undefined
): boolean {
  return method === "STORE_PICKUP" || method === "LOCAL_COURIER";
}

export function defaultExchangeShippingMethodForOrder(order: {
  fulfillmentType?: string | null;
  shippingServiceName?: string | null;
  deliveryNotes?: string | null;
  shippingAmount?: number | null;
}): ExchangeShippingMethod {
  if (order.fulfillmentType === "CARRIER") return "CARRIER";

  if (order.fulfillmentType === "ARRANGED") {
    const mode = parseArrangedDeliveryMode({
      shippingServiceName: order.shippingServiceName,
      deliveryNotes: order.deliveryNotes,
    });
    if (mode === "pickup") return "STORE_PICKUP";
    return "LOCAL_COURIER";
  }

  return "CARRIER";
}

export function exchangeShippingMethodServiceName(
  method: ExchangeShippingMethod
): string {
  return EXCHANGE_SHIPPING_METHOD_LABELS[method];
}
