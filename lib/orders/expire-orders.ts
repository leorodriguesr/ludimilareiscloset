import { prisma } from "@/lib/prisma";
import {
  ORDER_PENDING_TTL_MS,
  ORDER_STATUS,
  PAYMENT_ATTEMPT_STATUS,
} from "@/lib/orders/constants";
import { releaseStockReservations } from "@/lib/orders/stock/reservation";
import type { Prisma } from "@/app/generated/prisma/client";

export const AUTO_CANCEL_PAYMENT_TIMEOUT_REASON =
  "Pagamento não confirmado em 24 horas.";

export type ExpireOrdersResult = {
  expiredOrderIds: string[];
};

/** Pedidos pendentes vencidos: `expiresAt` passou, ou sem TTL e `createdAt` + 24h. */
function pendingDueWhere(now: Date): Prisma.OrderWhereInput {
  const createdBefore = new Date(now.getTime() - ORDER_PENDING_TTL_MS);
  return {
    status: ORDER_STATUS.PENDING_PAYMENT,
    OR: [
      { expiresAt: { lte: now } },
      { expiresAt: null, createdAt: { lte: createdBefore } },
    ],
  };
}

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
        status: ORDER_STATUS.CANCELLED,
        shippingStatus: "cancelled",
        expiredAt: now,
        cancelledAt: now,
        cancellationReason: AUTO_CANCEL_PAYMENT_TIMEOUT_REASON,
      },
    });
  });
}

/**
 * Cancela Orders pendentes cujo prazo de 24h já passou (cron + fluxos de checkout).
 */
export async function expireOrdersBatch(
  now: Date = new Date()
): Promise<ExpireOrdersResult> {
  const due = await prisma.order.findMany({
    where: pendingDueWhere(now),
    select: { id: true },
  });

  if (due.length === 0) {
    return { expiredOrderIds: [] };
  }

  const ids = due.map((o) => o.id);
  await expireOrderIds(ids, now);
  return { expiredOrderIds: ids };
}

/** Cancela pendentes vencidas de um cliente antes de buscar/reutilizar Order. */
export async function expirePendingOrdersForCustomer(input: {
  userId: string | null;
  email: string | null;
}): Promise<void> {
  const normalizedEmail = (input.email ?? "").trim().toLowerCase();
  if (!input.userId && !normalizedEmail) return;

  const now = new Date();

  const due = await prisma.order.findMany({
    where: {
      ...pendingDueWhere(now),
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
