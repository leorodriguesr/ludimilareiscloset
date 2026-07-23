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
import { continueOrderPayment } from "@/lib/orders/continue-order-payment";
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

function attemptRank(status: string): number {
  if (status === PAYMENT_ATTEMPT_STATUS.ACTIVE) return 0;
  if (status === PAYMENT_ATTEMPT_STATUS.CREATED) return 1;
  if (status === PAYMENT_ATTEMPT_STATUS.SUPERSEDED) return 2;
  if (status === PAYMENT_ATTEMPT_STATUS.EXPIRED) return 3;
  return 9;
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
  const cardOrders = candidates.filter(
    (order) => order.paymentMethod === PAYMENT_METHOD.CARD
  );
  const cardOrderIds = cardOrders.map((order) => order.id);

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
        gateway: PAYMENT_GATEWAY.INFINITEPAY,
        gatewayReference: { not: null },
        status: {
          in: [
            PAYMENT_ATTEMPT_STATUS.ACTIVE,
            PAYMENT_ATTEMPT_STATUS.CREATED,
            PAYMENT_ATTEMPT_STATUS.SUPERSEDED,
            PAYMENT_ATTEMPT_STATUS.EXPIRED,
          ],
        },
      },
      select: {
        orderId: true,
        gatewayReference: true,
        attemptNumber: true,
        status: true,
      },
    });

    const bestByOrder = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) {
      if (!attempt.gatewayReference) continue;
      const current = bestByOrder.get(attempt.orderId);
      if (!current) {
        bestByOrder.set(attempt.orderId, attempt);
        continue;
      }
      const byStatus =
        attemptRank(attempt.status) - attemptRank(current.status);
      if (
        byStatus < 0 ||
        (byStatus === 0 && attempt.attemptNumber > current.attemptNumber)
      ) {
        bestByOrder.set(attempt.orderId, attempt);
      }
    }

    for (const [orderId, attempt] of bestByOrder) {
      if (!attempt.gatewayReference) continue;
      try {
        cardShareById.set(orderId, {
          type: "card",
          checkoutUrl: infinitePayCheckoutUrlFromSlug(attempt.gatewayReference),
        });
      } catch (e) {
        console.error("[attachOrderPaymentShare] card url", orderId, e);
      }
    }

    // Sem tentativa reutilizável: regenera link (mesmo fluxo do payment-info).
    const missingCardIds = cardOrderIds.filter((id) => !cardShareById.has(id));
    await Promise.all(
      missingCardIds.map(async (orderId) => {
        try {
          const result = await continueOrderPayment({
            orderId,
            userId: "system",
            userEmail: "",
            staffBypass: true,
          });
          if (result.ok && result.type === "card") {
            cardShareById.set(orderId, {
              type: "card",
              checkoutUrl: result.checkoutUrl,
            });
          }
        } catch (e) {
          console.error("[attachOrderPaymentShare] card restart", orderId, e);
        }
      })
    );
  }

  return orders.map((order) => {
    const share =
      pixShareById.get(order.id) ?? cardShareById.get(order.id) ?? undefined;
    return share ? { ...order, paymentShare: share } : { ...order };
  });
}
