import type { ExchangeShippingMethod } from "@/app/generated/prisma/client";
import {
  ARRANGED_DELIVERY_LABELS,
  resolveArrangedDeliveryDisplay,
} from "@/lib/admin-sale/arranged-delivery";

export const EXCHANGE_SHIPPING_METHOD_LABELS: Record<
  ExchangeShippingMethod,
  string
> = {
  CARRIER: "Transportadora",
  STORE_PICKUP: "Na loja / retirada",
  LOCAL_COURIER: "Coleta local (Uber / motoboy)",
};

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
  if (order.fulfillmentType !== "ARRANGED") return "CARRIER";

  const { typeLabel } = resolveArrangedDeliveryDisplay({
    shippingServiceName: order.shippingServiceName,
    deliveryNotes: order.deliveryNotes,
    shippingAmount: order.shippingAmount ?? 0,
  });

  if (typeLabel === ARRANGED_DELIVERY_LABELS.pickup) {
    return "STORE_PICKUP";
  }
  return "LOCAL_COURIER";
}

export function exchangeShippingMethodServiceName(
  method: ExchangeShippingMethod
): string {
  return EXCHANGE_SHIPPING_METHOD_LABELS[method];
}
