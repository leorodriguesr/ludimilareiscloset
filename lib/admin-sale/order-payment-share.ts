import { OrderSource } from "@/app/generated/prisma/client";
import {
  buildPaymentPagePath,
  ensureOrderPaymentToken,
} from "@/lib/admin-sale/payment-page";
import {
  ORDER_STATUS,
  PAYMENT_ATTEMPT_STATUS,
  PAYMENT_GATEWAY,
  PAYMENT_METHOD,
} from "@/lib/orders/constants";
import { infinitePayCheckoutUrlFromSlug } from "@/lib/payments/infinitepay";
import { prisma } from "@/lib/prisma";

export type OrderPaymentShare =
  | { type: "pix"; paymentPath: string; paymentToken: string }
  | { type: "card"; checkoutUrl: string };

type OrderShareSource = {
  id: string;
  orderSource: string | null;
  status: string;
  paidAt: Date | string | null;
  paymentMethod: string | null;
  paymentChannel: string | null;
  paymentToken: string | null;
  paymentTokenExpiresAt?: Date | string | null;
};

function needsPaymentShare(order: OrderShareSource): boolean {
  if (order.orderSource !== OrderSource.ADMIN_SALE) return false;
  if (order.paidAt) return false;
  if (order.status === ORDER_STATUS.CANCELLED) return false;
  if (order.status === ORDER_STATUS.EXPIRED) return false;
  if (order.paymentChannel === "MANUAL") return false;
  return (
    order.paymentMethod === PAYMENT_METHOD.PIX ||
    order.paymentMethod === PAYMENT_METHOD.CARD
  );
}

/**
 * Anexa dados de compartilhamento de pagamento (path Pix / URL cartão)
 * para cópia imediata no admin, sem fetch no clique.
 */
export async function attachOrderPaymentShare<T extends OrderShareSource>(
  orders: T[]
): Promise<Array<T & { paymentShare?: OrderPaymentShare }>> {
  const candidates = orders.filter(needsPaymentShare);
  if (candidates.length === 0) {
    return orders.map((order) => ({ ...order }));
  }

  const pixOrders = candidates.filter(
    (order) => order.paymentMethod === PAYMENT_METHOD.PIX
  );
  const cardOrderIds = candidates
    .filter((order) => order.paymentMethod === PAYMENT_METHOD.CARD)
    .map((order) => order.id);

  const pixShareById = new Map<string, OrderPaymentShare>();
  await Promise.all(
    pixOrders.map(async (order) => {
      const now = Date.now();
      const expiresAt = order.paymentTokenExpiresAt
        ? new Date(order.paymentTokenExpiresAt).getTime()
        : null;
      const tokenStillValid =
        Boolean(order.paymentToken) &&
        (expiresAt == null || expiresAt > now);

      if (tokenStillValid && order.paymentToken) {
        pixShareById.set(order.id, {
          type: "pix",
          paymentToken: order.paymentToken,
          paymentPath: buildPaymentPagePath(order.paymentToken),
        });
        return;
      }

      try {
        const ensured = await ensureOrderPaymentToken(order.id);
        if (!ensured) return;
        pixShareById.set(order.id, {
          type: "pix",
          paymentToken: ensured.token,
          paymentPath: ensured.paymentPath,
        });
      } catch (e) {
        console.error("[attachOrderPaymentShare] pix token", order.id, e);
      }
    })
  );

  const cardShareById = new Map<string, OrderPaymentShare>();
  if (cardOrderIds.length > 0) {
    const attempts = await prisma.paymentAttempt.findMany({
      where: {
        orderId: { in: cardOrderIds },
        status: PAYMENT_ATTEMPT_STATUS.ACTIVE,
        gateway: PAYMENT_GATEWAY.INFINITEPAY,
        purpose: "order",
      },
      select: {
        orderId: true,
        gatewayReference: true,
        attemptNumber: true,
      },
      orderBy: { attemptNumber: "desc" },
    });

    for (const attempt of attempts) {
      if (cardShareById.has(attempt.orderId)) continue;
      if (!attempt.gatewayReference) continue;
      try {
        cardShareById.set(attempt.orderId, {
          type: "card",
          checkoutUrl: infinitePayCheckoutUrlFromSlug(attempt.gatewayReference),
        });
      } catch (e) {
        console.error("[attachOrderPaymentShare] card url", attempt.orderId, e);
      }
    }
  }

  return orders.map((order) => {
    const share =
      pixShareById.get(order.id) ?? cardShareById.get(order.id) ?? undefined;
    return share ? { ...order, paymentShare: share } : { ...order };
  });
}
