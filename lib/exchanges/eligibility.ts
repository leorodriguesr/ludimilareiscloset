import {
  allReturnUnitsUnavailable,
  buildReturnCards,
  type ExistingReturnLine,
  type ExchangeReturnSourceItem,
  unavailableReturnUnitKeys,
} from "@/lib/exchanges/return-units";

export const EXCHANGE_WINDOW_DAYS = 7;

export type ExchangeOrderBlockReason =
  | "WINDOW_EXPIRED"
  | "ALL_ITEMS_RETURNED"
  | "HAS_EXCHANGE";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Sem data de entrega: prazo não se aplica. Com data: até 7 dias depois. */
export function isWithinExchangeWindow(
  deliveredAt: Date | null | undefined,
  now = new Date()
): boolean {
  if (!deliveredAt) return true;
  return now.getTime() - deliveredAt.getTime() <= EXCHANGE_WINDOW_DAYS * MS_PER_DAY;
}

export function canBypassExchangeWindow(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

export function summarizeOrderExchangeEligibility(input: {
  deliveredAt: Date | null | undefined;
  items: ExchangeReturnSourceItem[];
  existingReturnLines: ExistingReturnLine[];
  hasActiveExchange?: boolean;
  bypassWindow?: boolean;
  now?: Date;
}): {
  selectable: boolean;
  blockReason: ExchangeOrderBlockReason | null;
  unavailableReturnKeys: string[];
} {
  const cards = buildReturnCards(input.items);
  const unavailable = unavailableReturnUnitKeys(
    cards,
    input.existingReturnLines
  );
  const unavailableReturnKeys = [...unavailable];

  if (input.hasActiveExchange) {
    return {
      selectable: false,
      blockReason: "HAS_EXCHANGE",
      unavailableReturnKeys,
    };
  }

  if (allReturnUnitsUnavailable(cards, unavailable)) {
    return {
      selectable: false,
      blockReason: "ALL_ITEMS_RETURNED",
      unavailableReturnKeys,
    };
  }

  const windowOk = isWithinExchangeWindow(input.deliveredAt, input.now);
  if (!windowOk && !input.bypassWindow) {
    return {
      selectable: false,
      blockReason: "WINDOW_EXPIRED",
      unavailableReturnKeys,
    };
  }

  return {
    selectable: true,
    blockReason: windowOk ? null : "WINDOW_EXPIRED",
    unavailableReturnKeys,
  };
}
