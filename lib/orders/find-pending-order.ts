import { prisma } from "@/lib/prisma";
import { ORDER_STATUS } from "@/lib/orders/constants";
import { expirePendingOrdersForCustomer } from "@/lib/orders/expire-orders";

export type FindPendingOrderInput = {
  userId: string | null;
  email: string;
};

/**
 * Localiza a Order pendente reutilizável do cliente (no máximo uma por identidade).
 * Expira Orders vencidas antes da busca (lazy expiration).
 */
export async function findPendingOrder(input: FindPendingOrderInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail && !input.userId) {
    return null;
  }

  await expirePendingOrdersForCustomer({
    userId: input.userId,
    email: normalizedEmail,
  });

  const now = new Date();

  return prisma.order.findFirst({
    where: {
      status: ORDER_STATUS.PENDING_PAYMENT,
      expiresAt: { gt: now },
      ...(input.userId
        ? { userId: input.userId }
        : { userId: null, email: normalizedEmail }),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      items: { orderBy: { id: "asc" } },
    },
  });
}
