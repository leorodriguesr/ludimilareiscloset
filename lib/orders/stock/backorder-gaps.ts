import type { CartPieceSelection } from "@/lib/cart/types";
import { prisma } from "@/lib/prisma";
import { getAvailableStock } from "@/lib/orders/stock/availability";
import { buildDetailedStockDemands } from "@/lib/orders/stock/build-demands";

export type BackorderGap = {
  productId: string;
  productName: string;
  pieceName: string | null;
  colorName: string | null;
  sizeName: string | null;
  quantity: number;
  restockLeadDays: number | null;
  allowed: boolean;
};

type GapLine = {
  productId: string;
  quantity: number;
  pieceSelections?: CartPieceSelection[];
};

/** Peças do carrinho que passam da quantidade física disponível. */
export async function listBackorderGaps(lines: GapLine[]): Promise<BackorderGap[]> {
  const demands = await buildDetailedStockDemands(
    lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      price: 0,
      pieceSelections: line.pieceSelections,
    })),
    prisma
  );
  const plannedByKey = new Map<string, number>();
  const gaps: BackorderGap[] = [];

  for (const demand of demands) {
    if (demand.unlimited) continue;
    const key = `${demand.productId}:${demand.pieceVariantId ?? ""}`;
    const available = await getAvailableStock(prisma, {
      productId: demand.productId,
      pieceVariantId: demand.pieceVariantId,
    });
    const remaining = Math.max(0, available - (plannedByKey.get(key) ?? 0));
    const physical = Math.min(remaining, demand.quantity);
    plannedByKey.set(key, (plannedByKey.get(key) ?? 0) + physical);
    const missing = demand.quantity - physical;
    if (missing <= 0) continue;
    gaps.push({
      productId: demand.productId,
      productName: demand.productName,
      pieceName: demand.pieceName,
      colorName: demand.colorName,
      sizeName: demand.sizeName,
      quantity: missing,
      restockLeadDays: demand.restockLeadDays,
      allowed: demand.allowBackorder,
    });
  }

  return gaps;
}

/** Maior prazo entre as peças que podem ser repostas. */
export function maxAllowedRestockLeadDays(gaps: BackorderGap[]): number {
  return gaps.reduce((max, gap) => {
    if (!gap.allowed) return max;
    return Math.max(max, gap.restockLeadDays ?? 0);
  }, 0);
}
