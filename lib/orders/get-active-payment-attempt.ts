import { prisma } from "@/lib/prisma";
import { PAYMENT_ATTEMPT_STATUS } from "@/lib/orders/constants";

/** Tentativa ACTIVE da Order (no máximo uma; garantido por transação na criação). */
export async function getActivePaymentAttempt(orderId: string) {
  return prisma.paymentAttempt.findFirst({
    where: {
      orderId,
      status: PAYMENT_ATTEMPT_STATUS.ACTIVE,
    },
    orderBy: { attemptNumber: "desc" },
  });
}
