import type { CartPieceSelection } from "@/lib/cart/types";
import {
  buildReturnCards,
  type ExchangeReturnSourceItem,
  type ExistingReturnLine,
  pieceIdentity,
  pieceReturnKey,
  type ReturnCard,
  unavailableReturnUnitKeys,
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
  return unavailableReturnUnitKeys(cards, existingLines);
}

export function remainingQtyForLine(input: {
  orderItemId: string;
  piece: CartPieceSelection | null;
  purchased: Map<string, number>;
  reserved: Map<string, number>;
}): number {
  const key = pieceReturnKey(input.orderItemId, input.piece);
  return Math.max(0, (input.purchased.get(key) ?? 0) - (input.reserved.get(key) ?? 0));
}

export function consumeReshipLinesIntoMap(
  lines: ExistingReturnLine[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    if (!line.orderItemId) continue;
    const pieces = parsePieceSelections(line.pieceSelectionsJson);
    const rows: Array<CartPieceSelection | null> =
      pieces.length > 0 ? pieces : [null];
    for (let q = 0; q < line.quantity; q++) {
      for (const piece of rows) {
        const key = `${line.orderItemId}\0${pieceIdentity(piece)}`;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
  }
  return map;
}

export function groupSelectedReshipUnits(
  cards: ReturnCard[],
  selectedKeys: Iterable<string>
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
      const mapKey = `${unit.orderItemId}\0${pieceIdentity(unit.pieceSelection)}`;
      const existing = groups.get(mapKey);
      if (existing) {
        existing.quantity += 1;
      } else {
        groups.set(mapKey, {
          orderItemId: unit.orderItemId,
          quantity: 1,
          pieceSelections: unit.pieceSelection ? [unit.pieceSelection] : undefined,
        });
      }
    }
  }
  return [...groups.values()];
}
