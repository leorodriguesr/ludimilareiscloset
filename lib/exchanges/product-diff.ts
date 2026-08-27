export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function productIdentityKey(
  productId: string | null | undefined,
  name: string
): string {
  if (productId) return `id:${productId}`;
  return `name:${name.trim().toLowerCase()}`;
}

function countKeys(entries: { key: string; quantity: number }[]) {
  const map = new Map<string, number>();
  for (const entry of entries) {
    map.set(entry.key, (map.get(entry.key) ?? 0) + entry.quantity);
  }
  return map;
}

function mapsEqual(a: Map<string, number>, b: Map<string, number>) {
  if (a.size === 0 || a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

/** Mesma peça (só tamanho/cor) quando os produtos e as quantidades coincidem e a devolução do item está completa. */
export function isSamePieceSwap(input: {
  returned: { key: string; quantity: number }[];
  outbound: { key: string; quantity: number }[];
  allReturnItemsFullySelected: boolean;
}): boolean {
  if (!input.allReturnItemsFullySelected) return false;
  return mapsEqual(countKeys(input.returned), countKeys(input.outbound));
}

export function computeExchangeProductTotals(input: {
  returnedItemsTotal: number;
  newItemsTotal: number;
  samePieceSwap: boolean;
}): { returnedItemsTotal: number; newItemsTotal: number; productsDelta: number } {
  const returnedItemsTotal = roundMoney(input.returnedItemsTotal);
  const newItemsTotal = roundMoney(input.newItemsTotal);
  const productsDelta = input.samePieceSwap
    ? 0
    : roundMoney(newItemsTotal - returnedItemsTotal);
  return { returnedItemsTotal, newItemsTotal, productsDelta };
}
