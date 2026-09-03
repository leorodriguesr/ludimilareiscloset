import type { CartPieceSelection } from "@/lib/cart/types";
import { parsePieceSelections } from "@/lib/exchanges/serialize";

export type ExchangeReturnSourceItem = {
  id: string;
  productId: string | null;
  productName: string;
  productImageUrl: string | null;
  quantity: number;
  price: number;
  pieceSelectionsJson: string | null;
};

export type ExistingReturnLine = {
  orderItemId: string | null;
  quantity: number;
  pieceSelectionsJson: string | null;
};

export type ReturnUnit = {
  key: string;
  orderItemId: string;
  productId: string | null;
  identification: string;
  pieceLabel: string;
  pieceSelection: CartPieceSelection | null;
};

export type ReturnCard = {
  orderItemId: string;
  identification: string;
  productId: string | null;
  itemQuantity: number;
  productTotal: number;
  units: ReturnUnit[];
};

export function formatPieceLabel(piece: CartPieceSelection): string {
  return [piece.pieceName, piece.color, piece.size].filter(Boolean).join(" · ");
}

export function pieceIdentity(piece: CartPieceSelection | null): string {
  if (!piece) return "\0item";
  return `${piece.pieceName}\0${piece.size ?? ""}\0${piece.color ?? ""}`;
}

export function returnUnitCount(
  quantity: number,
  pieces: CartPieceSelection[]
): number {
  return quantity * Math.max(pieces.length, 1);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildReturnCards(items: ExchangeReturnSourceItem[]): ReturnCard[] {
  return items.map((item) => {
    const pieces = parsePieceSelections(item.pieceSelectionsJson);
    const pieceRows: Array<CartPieceSelection | null> =
      pieces.length > 0 ? pieces : [null];
    const units: ReturnUnit[] = [];
    for (let copy = 0; copy < item.quantity; copy++) {
      for (let index = 0; index < pieceRows.length; index++) {
        const piece = pieceRows[index];
        units.push({
          key: `${item.id}:${copy}:${index}`,
          orderItemId: item.id,
          productId: item.productId,
          identification: item.productName,
          pieceLabel: piece ? formatPieceLabel(piece) : item.productName,
          pieceSelection: piece,
        });
      }
    }
    return {
      orderItemId: item.id,
      identification: item.productName,
      productId: item.productId,
      itemQuantity: item.quantity,
      productTotal: roundMoney(item.price * item.quantity),
      units,
    };
  });
}

function consumeKey(orderItemId: string, identity: string): string {
  return `${orderItemId}\0${identity}`;
}

export function pieceReturnKey(
  orderItemId: string,
  piece: CartPieceSelection | null
): string {
  return consumeKey(orderItemId, pieceIdentity(piece));
}

export function maxPieceUnitsForOrderItem(item: {
  id: string;
  quantity: number;
  pieceSelectionsJson: string | null;
}): Map<string, number> {
  const pieces = parsePieceSelections(item.pieceSelectionsJson);
  const rows: Array<CartPieceSelection | null> =
    pieces.length > 0 ? pieces : [null];
  const map = new Map<string, number>();
  for (let copy = 0; copy < item.quantity; copy++) {
    for (const piece of rows) {
      const key = pieceReturnKey(item.id, piece);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}

/** Unidades já devolvidas em trocas ativas, na mesma ordem das cartas. */
export function unavailableReturnUnitKeys(
  cards: ReturnCard[],
  existingReturnLines: ExistingReturnLine[]
): Set<string> {
  const remaining = new Map<string, number>();
  for (const line of existingReturnLines) {
    if (!line.orderItemId) continue;
    const pieces = parsePieceSelections(line.pieceSelectionsJson);
    const rows: Array<CartPieceSelection | null> =
      pieces.length > 0 ? pieces : [null];
    for (let q = 0; q < line.quantity; q++) {
      for (const piece of rows) {
        const key = consumeKey(line.orderItemId, pieceIdentity(piece));
        remaining.set(key, (remaining.get(key) ?? 0) + 1);
      }
    }
  }

  const unavailable = new Set<string>();
  for (const card of cards) {
    for (const unit of card.units) {
      const key = consumeKey(unit.orderItemId, pieceIdentity(unit.pieceSelection));
      const left = remaining.get(key) ?? 0;
      if (left <= 0) continue;
      unavailable.add(unit.key);
      remaining.set(key, left - 1);
    }
  }
  return unavailable;
}

export function allReturnUnitsUnavailable(
  cards: ReturnCard[],
  unavailableKeys: Set<string>
): boolean {
  const total = cards.reduce((sum, card) => sum + card.units.length, 0);
  if (total === 0) return true;
  return cards.every((card) =>
    card.units.every((unit) => unavailableKeys.has(unit.key))
  );
}
