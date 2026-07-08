import { prisma } from "@/lib/prisma";
import {
  ORDER_STATUS,
  PAYMENT_ATTEMPT_STATUS,
} from "@/lib/orders/constants";
import { releaseStockReservations } from "@/lib/orders/stock/reservation";
import { OrderSource } from "@/app/generated/prisma/client";

export type ExpireOrdersResult = {
  expiredOrderIds: string[];
};

export async function expireOrdersByIds(
  ids: string[],
  now: Date = new Date()
): Promise<void> {
  await expireOrderIds(ids, now);
}

async function expireOrderIds(ids: string[], now: Date): Promise<void> {
  if (ids.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const orderId of ids) {
      await releaseStockReservations(tx, orderId);
    }

    await tx.paymentAttempt.updateMany({
      where: {
        orderId: { in: ids },
        status: {
          in: [
            PAYMENT_ATTEMPT_STATUS.ACTIVE,
            PAYMENT_ATTEMPT_STATUS.CREATED,
          ],
        },
      },
      data: { status: PAYMENT_ATTEMPT_STATUS.EXPIRED },
    });

    await tx.order.updateMany({
      where: { id: { in: ids } },
      data: {
        status: ORDER_STATUS.EXPIRED,
        expiredAt: now,
      },
    });
  });
}

/**
 * Expira Orders pendentes cujo `expiresAt` já passou.
 */
export async function expireOrdersBatch(
  now: Date = new Date()
): Promise<ExpireOrdersResult> {
  const due = await prisma.order.findMany({
    where: {
      status: ORDER_STATUS.PENDING_PAYMENT,
      orderSource: OrderSource.CHECKOUT,
      expiresAt: { lte: now },
    },
    select: { id: true },
  });

  if (due.length === 0) {
    return { expiredOrderIds: [] };
  }

  const ids = due.map((o) => o.id);
  await expireOrderIds(ids, now);
  return { expiredOrderIds: ids };
}

/** Expira pendentes vencidas de um cliente antes de buscar/reutilizar Order. */
export async function expirePendingOrdersForCustomer(input: {
  userId: string | null;
  email: string;
}): Promise<void> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const now = new Date();

  const due = await prisma.order.findMany({
    where: {
      status: ORDER_STATUS.PENDING_PAYMENT,
      orderSource: OrderSource.CHECKOUT,
      expiresAt: { lte: now },
      ...(input.userId
        ? { userId: input.userId }
        : { userId: null, email: normalizedEmail }),
    },
    select: { id: true },
  });

  if (due.length === 0) return;

  await expireOrderIds(
    due.map((o) => o.id),
    now
  );
}
