import {
  ORDER_PENDING_TTL_MS,
  ORDER_STATUS,
} from "@/lib/orders/constants";
import {
  expireOrdersBatch,
  expireOrdersByIds,
} from "@/lib/orders/expire-orders";
import { prisma } from "@/lib/prisma";

export type MigrateLegacyPendingOrdersResult = {
  backfilledExpiresAt: number;
  expiredByTtl: number;
  expiredDuplicates: number;
  keptPendingOrderIds: string[];
};

function customerKey(order: {
  userId: string | null;
  email: string;
}): string | null {
  if (order.userId) return `user:${order.userId}`;
  const email = order.email.trim().toLowerCase();
  if (!email) return null;
  return `guest:${email}`;
}

/**
 * Fase 7: saneia pedidos legados antes da nova arquitetura.
 * 1. Preenche expiresAt ausente (createdAt + 24h)
 * 2. Expira pendentes vencidos
 * 3. Expira duplicatas pending_payment (mantém a mais recente por cliente)
 */
export async function migrateLegacyPendingOrders(input?: {
  dryRun?: boolean;
  now?: Date;
}): Promise<MigrateLegacyPendingOrdersResult> {
  const dryRun = input?.dryRun ?? false;
  const now = input?.now ?? new Date();

  const withoutExpires = await prisma.order.findMany({
    where: {
      status: ORDER_STATUS.PENDING_PAYMENT,
      expiresAt: null,
    },
    select: { id: true, createdAt: true },
  });

  if (!dryRun) {
    for (const row of withoutExpires) {
      await prisma.order.update({
        where: { id: row.id },
        data: {
          expiresAt: new Date(row.createdAt.getTime() + ORDER_PENDING_TTL_MS),
        },
      });
    }
  }

  let expiredByTtl = 0;
  if (!dryRun) {
    const batch = await expireOrdersBatch(now);
    expiredByTtl = batch.expiredOrderIds.length;
  } else {
    expiredByTtl = await prisma.order.count({
      where: {
        status: ORDER_STATUS.PENDING_PAYMENT,
        expiresAt: { lte: now },
      },
    });
  }

  const pending = await prisma.order.findMany({
    where: { status: ORDER_STATUS.PENDING_PAYMENT },
    select: {
      id: true,
      userId: true,
      email: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const groups = new Map<string, typeof pending>();
  for (const order of pending) {
    const key = customerKey(order);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(order);
    groups.set(key, list);
  }

  const duplicateIds: string[] = [];
  const keptPendingOrderIds: string[] = [];

  for (const [, orders] of groups) {
    if (orders.length === 0) continue;
    keptPendingOrderIds.push(orders[0]!.id);
    for (const duplicate of orders.slice(1)) {
      duplicateIds.push(duplicate.id);
    }
  }

  if (!dryRun && duplicateIds.length > 0) {
    await expireOrdersByIds(duplicateIds, now);
  }

  return {
    backfilledExpiresAt: withoutExpires.length,
    expiredByTtl,
    expiredDuplicates: duplicateIds.length,
    keptPendingOrderIds,
  };
}
