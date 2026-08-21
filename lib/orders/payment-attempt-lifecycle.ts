import { prisma } from "@/lib/prisma";
import {
  ORDER_STATUS,
  PAYMENT_ATTEMPT_STATUS,
  PAYMENT_GATEWAY,
  type PaymentGateway,
  type PaymentMethod,
} from "@/lib/orders/constants";

export type BeginPaymentAttemptResult = {
  attemptId: string;
  attemptNumber: number;
  orderId: string;
  amount: number;
};

/**
 * Supersede tentativas CREATED/ACTIVE e cria nova tentativa (transação atômica).
 * Garante no máximo uma tentativa ACTIVE por Order após ativação.
 */
export async function beginPaymentAttempt(input: {
  orderId: string;
  paymentMethod: PaymentMethod;
  gateway: PaymentGateway;
  amount: number;
  purpose?: string;
  chargeId?: string | null;
  allowPaidOrder?: boolean;
}): Promise<BeginPaymentAttemptResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true, expiresAt: true, total: true, orderSource: true },
    });

    const pendingOk = order?.status === ORDER_STATUS.PENDING_PAYMENT;
    const paidAddonOk =
      Boolean(input.allowPaidOrder) && order?.status === ORDER_STATUS.PAID;
    if (!order || (!pendingOk && !paidAddonOk)) {
      throw new Error("ORDER_NOT_PENDING");
    }

    const now = new Date();
    if (!paidAddonOk && order.expiresAt && order.expiresAt <= now) {
      throw new Error("ORDER_EXPIRED");
    }

    await tx.paymentAttempt.updateMany({
      where: {
        orderId: input.orderId,
        status: {
          in: [
            PAYMENT_ATTEMPT_STATUS.ACTIVE,
            PAYMENT_ATTEMPT_STATUS.CREATED,
          ],
        },
      },
      data: { status: PAYMENT_ATTEMPT_STATUS.SUPERSEDED },
    });

    const maxRow = await tx.paymentAttempt.aggregate({
      where: { orderId: input.orderId },
      _max: { attemptNumber: true },
    });
    const attemptNumber = (maxRow._max.attemptNumber ?? 0) + 1;

    const attempt = await tx.paymentAttempt.create({
      data: {
        orderId: input.orderId,
        attemptNumber,
        paymentMethod: input.paymentMethod,
        gateway: input.gateway,
        status: PAYMENT_ATTEMPT_STATUS.CREATED,
        amount: input.amount,
        purpose: input.purpose ?? "order",
        chargeId: input.chargeId ?? null,
      },
      select: { id: true, attemptNumber: true },
    });

    return {
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      orderId: input.orderId,
      amount: input.amount,
    };
  });
}

export async function activatePaymentAttempt(input: {
  attemptId: string;
  gatewayReference: string;
  expiresAt?: Date | null;
}): Promise<boolean> {
  const reference = input.gatewayReference.trim();
  if (!reference) return false;

  return prisma.$transaction(async (tx) => {
    const current = await tx.paymentAttempt.findUnique({
      where: { id: input.attemptId },
      select: { id: true, status: true, gateway: true },
    });
    if (!current || current.status !== PAYMENT_ATTEMPT_STATUS.CREATED) {
      return false;
    }

    // Unique (gateway, gatewayReference): libera a mesma ref em tentativas
    // não pagas (ex.: SUPERSEDED) para permitir regenerar o link.
    await tx.paymentAttempt.updateMany({
      where: {
        gateway: current.gateway,
        gatewayReference: reference,
        status: { not: PAYMENT_ATTEMPT_STATUS.PAID },
        id: { not: input.attemptId },
      },
      data: { gatewayReference: null },
    });

    const result = await tx.paymentAttempt.updateMany({
      where: {
        id: input.attemptId,
        status: PAYMENT_ATTEMPT_STATUS.CREATED,
      },
      data: {
        status: PAYMENT_ATTEMPT_STATUS.ACTIVE,
        gatewayReference: reference,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
    });
    return result.count > 0;
  });
}

export async function failPaymentAttempt(input: {
  attemptId: string;
  failureReason: string;
}): Promise<void> {
  await prisma.paymentAttempt.updateMany({
    where: {
      id: input.attemptId,
      status: PAYMENT_ATTEMPT_STATUS.CREATED,
    },
    data: {
      status: PAYMENT_ATTEMPT_STATUS.FAILED,
      failureReason: input.failureReason.slice(0, 500),
    },
  });
}

export function gatewayForMethod(method: PaymentMethod): PaymentGateway {
  return method === "pix"
    ? PAYMENT_GATEWAY.MERCADOPAGO
    : PAYMENT_GATEWAY.INFINITEPAY;
}
