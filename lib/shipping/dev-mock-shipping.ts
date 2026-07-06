import type { ShippingQuoteResult } from "@/lib/shipping/types";
import { superfreteOptionId } from "@/lib/shipping/service-id";

/** Ativo só fora de produção, com SHIPPING_MOCK=1 ou SUPERFRETE_MOCK=1. */
export function isShippingMockEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const flag =
    process.env.SHIPPING_MOCK?.trim() || process.env.SUPERFRETE_MOCK?.trim();
  return flag === "1" || flag?.toLowerCase() === "true";
}

const MOCK_OPTIONS = [
  {
    serviceId: 2,
    carrierName: "Correios",
    serviceName: "SEDEX (mock dev)",
    price: 24.9,
    deliveryDaysMin: 3,
    deliveryDaysMax: 5,
  },
  {
    serviceId: 3,
    carrierName: "Jadlog",
    serviceName: "Package (mock dev)",
    price: 17.5,
    deliveryDaysMin: 4,
    deliveryDaysMax: 7,
  },
  {
    serviceId: 31,
    carrierName: "Loggi",
    serviceName: "Econômico (mock dev)",
    price: 14.0,
    deliveryDaysMin: 5,
    deliveryDaysMax: 8,
  },
] as const;

let mockLogged = false;

export function mockShippingQuote(): ShippingQuoteResult {
  if (!mockLogged) {
    mockLogged = true;
    console.warn(
      "[shipping] SHIPPING_MOCK ativo — cotações fictícias (SuperFrete ignorada)."
    );
  }

  return {
    options: MOCK_OPTIONS.map((o) => ({
      id: superfreteOptionId(o.serviceId),
      serviceId: o.serviceId,
      carrierName: o.carrierName,
      serviceName: o.serviceName,
      price: o.price,
      deliveryDaysMin: o.deliveryDaysMin,
      deliveryDaysMax: o.deliveryDaysMax,
    })),
    idealPackage: {
      weightKg: 0.3,
      heightCm: 2,
      widthCm: 11,
      lengthCm: 16,
    },
  };
}
