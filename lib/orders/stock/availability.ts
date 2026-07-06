import { ORDER_STATUS } from "@/lib/orders/constants";
import { prisma } from "@/lib/prisma";

type ReservationReader = Pick<
  typeof prisma,
  "stockReservation" | "product" | "pieceVariant"
>;

export async function sumReservedQuantityByOthers(
  tx: ReservationReader,
  input: {
    productId: string;
    pieceVariantId: string | null;
    excludeOrderId: string;
    now?: Date;
  }
): Promise<number> {
  const now = input.now ?? new Date();

  const agg = await tx.stockReservation.aggregate({
    where: {
      productId: input.productId,
      pieceVariantId: input.pieceVariantId,
      orderId: { not: input.excludeOrderId },
      order: {
        status: ORDER_STATUS.PENDING_PAYMENT,
        expiresAt: { gt: now },
      },
    },
    _sum: { quantity: true },
  });

  return agg._sum.quantity ?? 0;
}

export async function getPhysicalStock(
  tx: ReservationReader,
  input: { productId: string; pieceVariantId: string | null }
): Promise<number> {
  if (input.pieceVariantId) {
    const variant = await tx.pieceVariant.findUnique({
      where: { id: input.pieceVariantId },
      select: { quantity: true, piece: { select: { productId: true } } },
    });
    if (!variant || variant.piece.productId !== input.productId) {
      return 0;
    }
    return variant.quantity;
  }

  const product = await tx.product.findUnique({
    where: { id: input.productId },
    select: { stockQuantity: true },
  });
  return product?.stockQuantity ?? 0;
}

export async function getAvailableStock(
  tx: ReservationReader,
  input: {
    productId: string;
    pieceVariantId: string | null;
    excludeOrderId: string;
    now?: Date;
  }
): Promise<number> {
  const [physical, reserved] = await Promise.all([
    getPhysicalStock(tx, input),
    sumReservedQuantityByOthers(tx, input),
  ]);
  return Math.max(0, physical - reserved);
}
