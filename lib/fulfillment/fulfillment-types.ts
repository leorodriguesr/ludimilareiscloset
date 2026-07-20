import { FulfillmentType } from "@/app/generated/prisma/client";

export type FulfillmentStrategy = {
  type: FulfillmentType;
  label: string;
  requiresShippingQuote: boolean;
  requiresCompleteAddressForLabel: boolean;
  canAutoGenerateLabel: boolean;
  canChangeShippingOption: boolean;
  defaultShippingServiceName: string;
};

export const FULFILLMENT_STRATEGIES: Record<FulfillmentType, FulfillmentStrategy> = {
  [FulfillmentType.CARRIER]: {
    type: FulfillmentType.CARRIER,
    label: "Transportadora",
    requiresShippingQuote: true,
    requiresCompleteAddressForLabel: true,
    canAutoGenerateLabel: true,
    canChangeShippingOption: true,
    defaultShippingServiceName: "",
  },
  [FulfillmentType.ARRANGED]: {
    type: FulfillmentType.ARRANGED,
    label: "Entrega a combinar",
    requiresShippingQuote: false,
    requiresCompleteAddressForLabel: false,
    canAutoGenerateLabel: false,
    canChangeShippingOption: false,
    defaultShippingServiceName: "Entrega a combinar",
  },
};

export function getFulfillmentStrategy(
  type: FulfillmentType
): FulfillmentStrategy {
  return FULFILLMENT_STRATEGIES[type];
}

export function canGenerateLabelForFulfillment(type: FulfillmentType): boolean {
  return getFulfillmentStrategy(type).canAutoGenerateLabel;
}

export {
  canManuallyChangeShippingStatus,
  canManuallyMarkCarrierAsShipped,
  isCarrierShippingStatusLocked,
} from "@/lib/fulfillment/shipping-status-policy";
