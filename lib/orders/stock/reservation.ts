import { StockType } from "@/app/generated/prisma/client";
import type { CartPieceSelection } from "@/lib/cart/types";
import { OrderCreateError } from "@/lib/orders/create-order";
import { getAvailableStock } from "@/lib/orders/stock/availability";
import {
  buildDetailedStockDemands,
  buildStockDemands,
} from "@/lib/orders/stock/build-demands";
import { orderStockReservationWhere } from "@/lib/orders/stock/reservation-scope";
import { prisma } from "@/lib/prisma";

type ReservationTx = Pick<
  typeof prisma,
  | "stockReservation"
  | "product"
  | "pieceVariant"
  | "$executeRawUnsafe"
>;

export type StockReservationLine = {
  productId: string;
  quantity: number;
  price: number;
  pieceSelections?: CartPieceSelection[];
};

export type StockAllocationDetail = {
  productId: string;
  pieceVariantId: string | null;
  pieceName: string | null;
  colorName: string | null;
  sizeName: string | null;
  requestedQuantity: number;
  stockQuantity: number;
  backorderQuantity: number;
};

export type StockLineAllocation = {
  lineIndex: number;
  stockAllocatedQuantity: number;
  backorderQuantity: number;
  restockLeadDays: number | null;
  details: StockAllocationDetail[];
};

export type ReserveStockOptions = {
  /** Permite a falta apenas nos produtos que têm allowBackorder=true. */
  acceptBackorder?: boolean;
};

export async function releaseStockReservations(
  tx: Pick<typeof prisma, "stockReservation">,
  orderId: string
): Promise<void> {
  await tx.stockReservation.deleteMany({
    where: orderStockReservationWhere(orderId),
  });
}

export async function reserveStockForOrderLines(
  tx: ReservationTx,
  orderId: string,
  lines: StockReservationLine[],
  now: Date = new Date(),
  options: ReserveStockOptions = {}
): Promise<StockLineAllocation[]> {
  const demands = await buildDetailedStockDemands(lines, tx);
  const plannedByKey = new Map<string, number>();
  const reservationByKey = new Map<
    string,
    { productId: string; pieceVariantId: string | null; quantity: number }
  >();
  const detailsByLine = new Map<number, StockAllocationDetail[]>();
  const leadDaysByLine = new Map<number, number>();

  for (const demand of demands) {
    if (demand.unlimited) {
      const rows = detailsByLine.get(demand.lineIndex) ?? [];
      rows.push({
        productId: demand.productId,
        pieceVariantId: demand.pieceVariantId,
        pieceName: demand.pieceName,
        colorName: demand.colorName,
        sizeName: demand.sizeName,
        requestedQuantity: demand.quantity,
        stockQuantity: demand.quantity,
        backorderQuantity: 0,
      });
      detailsByLine.set(demand.lineIndex, rows);
      continue;
    }

    const key = `${demand.productId}:${demand.pieceVariantId ?? ""}`;
    const available = await getAvailableStock(tx, {
      productId: demand.productId,
      pieceVariantId: demand.pieceVariantId,
      excludeOrderId: orderId,
      now,
    });
    const remaining = Math.max(0, available - (plannedByKey.get(key) ?? 0));
    const stockQuantity = Math.min(demand.quantity, remaining);
    const backorderQuantity = demand.quantity - stockQuantity;

    if (backorderQuantity > 0 && !demand.allowBackorder) {
      throw new OrderCreateError(
        "INSUFFICIENT_STOCK",
        "Estoque insuficiente para a quantidade solicitada."
      );
    }
    if (backorderQuantity > 0 && !options.acceptBackorder) {
      throw new OrderCreateError(
        "BACKORDER_CONFIRMATION_REQUIRED",
        `${demand.productName} está em reposição. O prazo é de até ${
          demand.restockLeadDays ?? 0
        } dias úteis.`
      );
    }

    plannedByKey.set(key, (plannedByKey.get(key) ?? 0) + stockQuantity);
    if (stockQuantity > 0) {
      const reservation = reservationByKey.get(key);
      if (reservation) {
        reservation.quantity += stockQuantity;
      } else {
        reservationByKey.set(key, {
          productId: demand.productId,
          pieceVariantId: demand.pieceVariantId,
          quantity: stockQuantity,
        });
      }
    }

    const rows = detailsByLine.get(demand.lineIndex) ?? [];
    rows.push({
      productId: demand.productId,
      pieceVariantId: demand.pieceVariantId,
      pieceName: demand.pieceName,
      colorName: demand.colorName,
      sizeName: demand.sizeName,
      requestedQuantity: demand.quantity,
      stockQuantity,
      backorderQuantity,
    });
    detailsByLine.set(demand.lineIndex, rows);
    if (backorderQuantity > 0) {
      leadDaysByLine.set(
        demand.lineIndex,
        Math.max(
          leadDaysByLine.get(demand.lineIndex) ?? 0,
          demand.restockLeadDays ?? 0
        )
      );
    }
  }

  const reservations = [...reservationByKey.values()];
  if (reservations.length > 0) {
    await tx.stockReservation.createMany({
      data: reservations.map((d) => ({
        orderId,
        productId: d.productId,
        pieceVariantId: d.pieceVariantId,
        quantity: d.quantity,
      })),
    });
  }

  return lines.map((line, lineIndex) => {
    const details = detailsByLine.get(lineIndex) ?? [];
    const stockAllocatedQuantity =
      details.length > 0
        ? Math.min(...details.map((row) => row.stockQuantity))
        : line.quantity;
    return {
      lineIndex,
      stockAllocatedQuantity,
      backorderQuantity: Math.max(0, line.quantity - stockAllocatedQuantity),
      restockLeadDays: leadDaysByLine.get(lineIndex) || null,
      details,
    };
  });
}

export async function commitStockReservations(
  tx: ReservationTx,
  orderId: string
): Promise<void> {
  const reservations = await tx.stockReservation.findMany({
    where: orderStockReservationWhere(orderId),
    select: {
      productId: true,
      pieceVariantId: true,
      quantity: true,
    },
  });

  if (reservations.length === 0) return;

  const productIds = [...new Set(reservations.map((r) => r.productId))];

  for (const reservation of reservations) {
    if (reservation.pieceVariantId) {
      await tx.$executeRawUnsafe(
        `UPDATE "PieceVariant"
         SET "quantity" = MAX(0, "quantity" - ?)
         WHERE "id" = ?`,
        reservation.quantity,
        reservation.pieceVariantId
      );
    } else {
      await tx.$executeRawUnsafe(
        `UPDATE "Product"
         SET "stockQuantity" = MAX(0, COALESCE("stockQuantity", 0) - ?),
             "updatedAt" = datetime('now')
         WHERE "id" = ? AND "stockType" = ?`,
        reservation.quantity,
        reservation.productId,
        StockType.LIMITED
      );
    }
  }

  for (const productId of productIds) {
    await syncProductStockQuantityFromVariants(tx, productId);
  }

  await tx.stockReservation.deleteMany({
    where: orderStockReservationWhere(orderId),
  });
}

/** Baixa estoque das linhas informadas sem mexer nas reservas do pedido. */
export async function decrementCommittedStockForLines(
  tx: ReservationTx,
  lines: StockReservationLine[]
): Promise<void> {
  const demands = await buildStockDemands(lines, tx);
  if (demands.length === 0) return;

  const productIds = [...new Set(demands.map((d) => d.productId))];

  for (const demand of demands) {
    if (demand.pieceVariantId) {
      await tx.$executeRawUnsafe(
        `UPDATE "PieceVariant"
         SET "quantity" = MAX(0, "quantity" - ?)
         WHERE "id" = ?`,
        demand.quantity,
        demand.pieceVariantId
      );
    } else {
      await tx.$executeRawUnsafe(
        `UPDATE "Product"
         SET "stockQuantity" = MAX(0, COALESCE("stockQuantity", 0) - ?),
             "updatedAt" = datetime('now')
         WHERE "id" = ? AND "stockType" = ?`,
        demand.quantity,
        demand.productId,
        StockType.LIMITED
      );
    }
  }

  for (const productId of productIds) {
    await syncProductStockQuantityFromVariants(tx, productId);
  }
}

async function syncProductStockQuantityFromVariants(
  tx: ReservationTx,
  productId: string
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: {
      stockType: true,
      pieces: {
        select: {
          variants: { select: { quantity: true, unlimited: true } },
        },
      },
    },
  });

  if (!product || product.stockType !== StockType.LIMITED) return;

  const hasVariants = product.pieces.some((p) => p.variants.length > 0);
  if (!hasVariants) return;

  const sum = product.pieces.reduce(
    (acc, p) =>
      acc +
      p.variants.reduce((a, v) => a + (v.unlimited ? 0 : v.quantity), 0),
    0
  );

  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: sum },
  });
}
