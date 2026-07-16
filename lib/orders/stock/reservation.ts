import { StockType } from "@/app/generated/prisma/client";
import type { CartPieceSelection } from "@/lib/cart/types";
import { OrderCreateError } from "@/lib/orders/create-order";
import { getAvailableStock } from "@/lib/orders/stock/availability";
import { buildStockDemands } from "@/lib/orders/stock/build-demands";
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

export async function releaseStockReservations(
  tx: Pick<typeof prisma, "stockReservation">,
  orderId: string
): Promise<void> {
  await tx.stockReservation.deleteMany({ where: { orderId } });
}

export async function reserveStockForOrderLines(
  tx: ReservationTx,
  orderId: string,
  lines: StockReservationLine[],
  now: Date = new Date()
): Promise<void> {
  const demands = await buildStockDemands(lines, tx);

  for (const demand of demands) {
    const available = await getAvailableStock(tx, {
      productId: demand.productId,
      pieceVariantId: demand.pieceVariantId,
      excludeOrderId: orderId,
      now,
    });

    if (available < demand.quantity) {
      throw new OrderCreateError(
        "INSUFFICIENT_STOCK",
        "Estoque insuficiente para a quantidade solicitada."
      );
    }
  }

  if (demands.length === 0) return;

  await tx.stockReservation.createMany({
    data: demands.map((d) => ({
      orderId,
      productId: d.productId,
      pieceVariantId: d.pieceVariantId,
      quantity: d.quantity,
    })),
  });
}

export async function commitStockReservations(
  tx: ReservationTx,
  orderId: string
): Promise<void> {
  const reservations = await tx.stockReservation.findMany({
    where: { orderId },
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

  await tx.stockReservation.deleteMany({ where: { orderId } });
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
          variants: { select: { quantity: true } },
        },
      },
    },
  });

  if (!product || product.stockType !== StockType.LIMITED) return;

  const hasVariants = product.pieces.some((p) => p.variants.length > 0);
  if (!hasVariants) return;

  const sum = product.pieces.reduce(
    (acc, p) => acc + p.variants.reduce((a, v) => a + v.quantity, 0),
    0
  );

  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: sum },
  });
}
