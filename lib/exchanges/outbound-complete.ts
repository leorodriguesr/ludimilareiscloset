import type { ExchangeShippingMethod } from "@/app/generated/prisma/client";

const CARRIER_SHIPPED = new Set(["posted", "shipped", "delivered"]);
const LOCAL_COMPLETED = new Set(["delivered"]);

export function isOutboundShippingCompleteEnough(input: {
  method?: ExchangeShippingMethod | string | null;
  shippingStatus: string;
}): boolean {
  const status = input.shippingStatus.trim().toLowerCase();
  if (
    input.method === "STORE_PICKUP" ||
    input.method === "LOCAL_COURIER"
  ) {
    return LOCAL_COMPLETED.has(status);
  }
  return CARRIER_SHIPPED.has(status);
}

export function canCompleteExchangeWithOutbound(input: {
  hasOutboundItems: boolean;
  outboundShippings: Array<{
    method?: ExchangeShippingMethod | string | null;
    shippingStatus: string;
  }>;
}): boolean {
  if (!input.hasOutboundItems) return true;
  if (input.outboundShippings.length === 0) return false;
  return input.outboundShippings.every(isOutboundShippingCompleteEnough);
}
