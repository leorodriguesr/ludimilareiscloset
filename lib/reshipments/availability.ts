import type { CartPieceSelection } from "@/lib/cart/types";
import {
  buildReturnCards,
  type ExchangeReturnSourceItem,
  type ExistingReturnLine,
  pieceIdentity,
  type ReturnCard,
  returnUnitCount,
} from "@/lib/exchanges/return-units";
import { parsePieceSelections } from "@/lib/exchanges/serialize";

export type ReshipSourceItem = ExchangeReturnSourceItem;

export function buildReshipCards(items: ReshipSourceItem[]) {
  return buildReturnCards(items);
}

export function unavailableReshipUnitKeys(
  cards: ReturnType<typeof buildReturnCards>,
  existingLines: ExistingReturnLine[]
): Set<string> {
  const remainingByItem = new Map<string, number>();
  for (const line of existingLines) {
    if (!line.orderItemId) continue;
    const units = returnUnitCount(
      line.quantity,
      parsePieceSelections(line.pieceSelectionsJson)
    );
    remainingByItem.set(
      line.orderItemId,
      (remainingByItem.get(line.orderItemId) ?? 0) + units
    );
  }

  const unavailable = new Set<string>();
  for (const card of cards) {
    for (const unit of card.units) {
      const left = remainingByItem.get(unit.orderItemId) ?? 0;
      if (left <= 0) continue;
      unavailable.add(unit.key);
      remainingByItem.set(unit.orderItemId, left - 1);
    }
  }
  return unavailable;
}

export function consumeReshipLinesIntoMap(
  lines: ExistingReturnLine[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    if (!line.orderItemId) continue;
    const units = returnUnitCount(
      line.quantity,
      parsePieceSelections(line.pieceSelectionsJson)
    );
    map.set(line.orderItemId, (map.get(line.orderItemId) ?? 0) + units);
  }
  return map;
}

export function groupSelectedReshipUnits(
  cards: ReturnCard[],
  selectedKeys: Iterable<string>,
  shippedByUnitKey?: Readonly<Record<string, CartPieceSelection | null>>
): Array<{
  orderItemId: string;
  quantity: number;
  pieceSelections?: CartPieceSelection[];
}> {
  const selected = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys);
  const groups = new Map<
    string,
    {
      orderItemId: string;
      quantity: number;
      pieceSelections?: CartPieceSelection[];
    }
  >();
  for (const card of cards) {
    for (const unit of card.units) {
      if (!selected.has(unit.key)) continue;
      const shipped =
        shippedByUnitKey && Object.prototype.hasOwnProperty.call(shippedByUnitKey, unit.key)
          ? shippedByUnitKey[unit.key] ?? null
          : unit.pieceSelection;
      const mapKey = `${unit.orderItemId}\0${pieceIdentity(shipped)}`;
      const existing = groups.get(mapKey);
      if (existing) {
        existing.quantity += 1;
      } else {
        groups.set(mapKey, {
          orderItemId: unit.orderItemId,
          quantity: 1,
          pieceSelections: shipped ? [shipped] : undefined,
        });
      }
    }
  }
  return [...groups.values()];
}
