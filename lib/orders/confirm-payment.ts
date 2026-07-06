import {
  ORDER_STATUS,
  PAYMENT_ATTEMPT_STATUS,
  PAYMENT_GATEWAY,
  type PaymentGateway,
} from "@/lib/orders/constants";
import {
  logPaymentWebhookEvent,
  WEBHOOK_AUDIT_OUTCOME,
} from "@/lib/orders/payment-webhook-audit";
import { commitStockReservations } from "@/lib/orders/stock/reservation";
import { prisma } from "@/lib/prisma";
import { tryAutoGenerateLabelForOrder } from "@/lib/shipping/auto-label";
import { isInfinitePayLencToken } from "@/lib/payments/infinitepay";

const AMOUNT_TOLERANCE_BRL = 0.01;

export type ConfirmPaymentSource = "webhook" | "polling" | "return_url";

export type ConfirmPaymentResult = {
  updated: boolean;
  outcome: string;
  orderId?: string;
};

type AttemptWithOrder = {
  id: string;
  orderId: string;
  status: string;
  amount: number;
  gateway: string;
  gatewayReference: string | null;
  paymentMethod: string;
  order: {
    id: string;
    status: string;
    total: number;
    expiresAt: Date | null;
  };
};

async function findAttemptByGatewayReference(
  gateway: PaymentGateway,
  gatewayReference: string
): Promise<AttemptWithOrder | null> {
  return prisma.paymentAttempt.findFirst({
    where: {
      gateway,
      gatewayReference,
    },
    include: {
      order: {
        select: {
          id: true,
          status: true,
          total: true,
          expiresAt: true,
        },
      },
    },
  });
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE_BRL;
}

async function rejectConfirmation(input: {
  gateway: PaymentGateway;
  source: ConfirmPaymentSource;
  outcome: (typeof WEBHOOK_AUDIT_OUTCOME)[keyof typeof WEBHOOK_AUDIT_OUTCOME];
  reason: string;
  attempt?: AttemptWithOrder | null;
  gatewayReference?: string | null;
  orderId?: string | null;
  payload?: unknown;
}): Promise<ConfirmPaymentResult> {
  await logPaymentWebhookEvent({
    gateway: input.gateway,
    source: input.source,
    outcome: input.outcome,
    orderId: input.attempt?.orderId ?? input.orderId ?? null,
    paymentAttemptId: input.attempt?.id ?? null,
    gatewayReference:
      input.gatewayReference ?? input.attempt?.gatewayReference ?? null,
    reason: input.reason,
    payload: input.payload,
  });
  return { updated: false, outcome: input.outcome };
}

async function validateAttemptForConfirmation(input: {
  attempt: AttemptWithOrder;
  gateway: PaymentGateway;
  source: ConfirmPaymentSource;
  gatewayReference?: string | null;
  payload?: unknown;
}): Promise<ConfirmPaymentResult | null> {
  const { attempt } = input;
  const now = new Date();

  const allowSupersededPixRecovery =
    attempt.status === PAYMENT_ATTEMPT_STATUS.SUPERSEDED &&
    attempt.gateway === PAYMENT_GATEWAY.MERCADOPAGO &&
    attempt.order.status === ORDER_STATUS.PENDING_PAYMENT;

  if (attempt.status === PAYMENT_ATTEMPT_STATUS.SUPERSEDED) {
    if (!allowSupersededPixRecovery) {
      return rejectConfirmation({
        gateway: input.gateway,
        source: input.source,
        outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_SUPERSEDED,
        reason: "Pagamento referente a tentativa superseded.",
        attempt,
        gatewayReference: input.gatewayReference,
        payload: input.payload,
      });
    }
  }

  if (attempt.status === PAYMENT_ATTEMPT_STATUS.EXPIRED) {
    return rejectConfirmation({
      gateway: input.gateway,
      source: input.source,
      outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_EXPIRED,
      reason: "Tentativa de pagamento expirada.",
      attempt,
      gatewayReference: input.gatewayReference,
      payload: input.payload,
    });
  }

  if (
    attempt.status === PAYMENT_ATTEMPT_STATUS.PAID &&
    attempt.order.status === ORDER_STATUS.PAID
  ) {
    return rejectConfirmation({
      gateway: input.gateway,
      source: input.source,
      outcome: WEBHOOK_AUDIT_OUTCOME.IGNORED_ALREADY_PAID,
      reason: "Tentativa e pedido já estão pagos.",
      attempt,
      gatewayReference: input.gatewayReference,
      payload: input.payload,
    });
  }

  if (
    attempt.status !== PAYMENT_ATTEMPT_STATUS.ACTIVE &&
    !allowSupersededPixRecovery
  ) {
    return rejectConfirmation({
      gateway: input.gateway,
      source: input.source,
      outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_ATTEMPT_STATUS,
      reason: `Tentativa com status "${attempt.status}" não pode confirmar pagamento.`,
      attempt,
      gatewayReference: input.gatewayReference,
      payload: input.payload,
    });
  }

  if (attempt.order.status === ORDER_STATUS.PAID) {
    return rejectConfirmation({
      gateway: input.gateway,
      source: input.source,
      outcome: WEBHOOK_AUDIT_OUTCOME.IGNORED_ALREADY_PAID,
      reason: "Pedido já está pago.",
      attempt,
      gatewayReference: input.gatewayReference,
      payload: input.payload,
    });
  }

  if (attempt.order.status !== ORDER_STATUS.PENDING_PAYMENT) {
    return rejectConfirmation({
      gateway: input.gateway,
      source: input.source,
      outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_ORDER_STATE,
      reason: `Pedido com status "${attempt.order.status}".`,
      attempt,
      gatewayReference: input.gatewayReference,
      payload: input.payload,
    });
  }

  if (attempt.order.expiresAt && attempt.order.expiresAt <= now) {
    return rejectConfirmation({
      gateway: input.gateway,
      source: input.source,
      outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_EXPIRED,
      reason: "Pedido pendente expirado.",
      attempt,
      gatewayReference: input.gatewayReference,
      payload: input.payload,
    });
  }

  if (!amountsMatch(attempt.amount, attempt.order.total)) {
    return rejectConfirmation({
      gateway: input.gateway,
      source: input.source,
      outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_AMOUNT,
      reason: `Valor da tentativa (${attempt.amount}) diverge do pedido (${attempt.order.total}).`,
      attempt,
      gatewayReference: input.gatewayReference,
      payload: input.payload,
    });
  }

  return null;
}

class ConfirmPaymentRejectedError extends Error {
  readonly result: ConfirmPaymentResult;

  constructor(result: ConfirmPaymentResult) {
    super(result.outcome);
    this.result = result;
  }
}

async function confirmAttemptInTransaction(input: {
  attempt: AttemptWithOrder;
  gateway: PaymentGateway;
  source: ConfirmPaymentSource;
  gatewayTransactionId?: string | null;
  captureMethod?: string | null;
  invoiceSlug?: string | null;
  mpOrderId?: string | null;
  payload?: unknown;
}): Promise<ConfirmPaymentResult> {
  const paidAt = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const lockedAttempt = await tx.paymentAttempt.findUnique({
        where: { id: input.attempt.id },
        include: {
          order: {
            select: {
              id: true,
              status: true,
              total: true,
              expiresAt: true,
            },
          },
        },
      });

      if (!lockedAttempt) {
        throw new ConfirmPaymentRejectedError({
          updated: false,
          outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_NOT_FOUND,
        });
      }

      const rejection = await validateAttemptForConfirmation({
        attempt: lockedAttempt,
        gateway: input.gateway,
        source: input.source,
        gatewayReference: input.attempt.gatewayReference,
        payload: input.payload,
      });
      if (rejection) {
        throw new ConfirmPaymentRejectedError(rejection);
      }

      await tx.paymentAttempt.update({
        where: { id: lockedAttempt.id },
        data: {
          status: PAYMENT_ATTEMPT_STATUS.PAID,
          paidAt,
          ...(input.gatewayTransactionId
            ? { gatewayTransactionId: input.gatewayTransactionId }
            : {}),
        },
      });

      await tx.paymentAttempt.updateMany({
        where: {
          orderId: lockedAttempt.orderId,
          status: PAYMENT_ATTEMPT_STATUS.ACTIVE,
          id: { not: lockedAttempt.id },
        },
        data: { status: PAYMENT_ATTEMPT_STATUS.SUPERSEDED },
      });

      await tx.order.update({
        where: { id: lockedAttempt.orderId },
        data: {
          status: ORDER_STATUS.PAID,
          paidAt,
          ...(input.invoiceSlug
            ? { infinitePayInvoiceSlug: input.invoiceSlug }
            : {}),
          ...(input.gatewayTransactionId
            ? { infinitePayTransactionNsu: input.gatewayTransactionId }
            : {}),
          ...(input.captureMethod
            ? { paymentCaptureMethod: input.captureMethod }
            : {}),
          ...(input.mpOrderId ? { mercadoPagoPaymentId: input.mpOrderId } : {}),
        },
      });

      await commitStockReservations(tx, lockedAttempt.orderId);
    });
  } catch (e) {
    if (e instanceof ConfirmPaymentRejectedError) {
      return e.result;
    }
    throw e;
  }

  await logPaymentWebhookEvent({
    gateway: input.gateway,
    source: input.source,
    outcome: WEBHOOK_AUDIT_OUTCOME.CONFIRMED,
    orderId: input.attempt.orderId,
    paymentAttemptId: input.attempt.id,
    gatewayReference: input.attempt.gatewayReference,
    reason: "Pagamento confirmado.",
    payload: input.payload,
  });

  void tryAutoGenerateLabelForOrder(input.attempt.orderId);

  return {
    updated: true,
    outcome: WEBHOOK_AUDIT_OUTCOME.CONFIRMED,
    orderId: input.attempt.orderId,
  };
}

export async function confirmPaymentFromMercadoPago(input: {
  mpOrderId: string;
  source: ConfirmPaymentSource;
  payload?: unknown;
}): Promise<ConfirmPaymentResult> {
  const mpOrderId = input.mpOrderId.trim();
  if (!mpOrderId) {
    return rejectConfirmation({
      gateway: PAYMENT_GATEWAY.MERCADOPAGO,
      source: input.source,
      outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_NOT_FOUND,
      reason: "mpOrderId ausente.",
      payload: input.payload,
    });
  }

  const attempt = await findAttemptByGatewayReference(
    PAYMENT_GATEWAY.MERCADOPAGO,
    mpOrderId
  );

  if (!attempt) {
    return rejectConfirmation({
      gateway: PAYMENT_GATEWAY.MERCADOPAGO,
      source: input.source,
      outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_NOT_FOUND,
      reason: "Nenhuma PaymentAttempt encontrada para o mpOrderId.",
      gatewayReference: mpOrderId,
      payload: input.payload,
    });
  }

  const rejection = await validateAttemptForConfirmation({
    attempt,
    gateway: PAYMENT_GATEWAY.MERCADOPAGO,
    source: input.source,
    gatewayReference: mpOrderId,
    payload: input.payload,
  });
  if (rejection) return rejection;

  return confirmAttemptInTransaction({
    attempt,
    gateway: PAYMENT_GATEWAY.MERCADOPAGO,
    source: input.source,
    mpOrderId,
    captureMethod: "pix",
    payload: input.payload,
  });
}

export async function confirmPaymentFromInfinitePay(input: {
  orderNsu?: string | null;
  invoiceSlug?: string | null;
  transactionNsu?: string | null;
  captureMethod?: string | null;
  source: ConfirmPaymentSource;
  payload?: unknown;
}): Promise<ConfirmPaymentResult> {
  const slug = (input.invoiceSlug ?? "").trim();
  const orderNsu = (input.orderNsu ?? "").trim();

  let attempt: AttemptWithOrder | null = null;

  if (slug) {
    attempt = await findAttemptByGatewayReference(
      PAYMENT_GATEWAY.INFINITEPAY,
      slug
    );
  }

  if (!attempt && orderNsu) {
    attempt = await prisma.paymentAttempt.findFirst({
      where: {
        orderId: orderNsu,
        gateway: PAYMENT_GATEWAY.INFINITEPAY,
        status: PAYMENT_ATTEMPT_STATUS.ACTIVE,
      },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            total: true,
            expiresAt: true,
          },
        },
      },
    });
  }

  if (!attempt) {
    return rejectConfirmation({
      gateway: PAYMENT_GATEWAY.INFINITEPAY,
      source: input.source,
      outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_NOT_FOUND,
      reason: "Nenhuma PaymentAttempt encontrada para o webhook InfinitePay.",
      orderId: orderNsu || null,
      gatewayReference: slug || null,
      payload: input.payload,
    });
  }

  const rejection = await validateAttemptForConfirmation({
    attempt,
    gateway: PAYMENT_GATEWAY.INFINITEPAY,
    source: input.source,
    gatewayReference: slug || attempt.gatewayReference,
    payload: input.payload,
  });
  if (rejection) return rejection;

  /** InfinitePay pode enviar slug curto no retorno/webhook enquanto a tentativa guarda o token lenc. */
  const invoiceSlugForOrder =
    slug && !isInfinitePayLencToken(slug)
      ? slug
      : slug || attempt.gatewayReference;

  return confirmAttemptInTransaction({
    attempt,
    gateway: PAYMENT_GATEWAY.INFINITEPAY,
    source: input.source,
    gatewayTransactionId: input.transactionNsu?.trim() || null,
    captureMethod: input.captureMethod?.trim() || null,
    invoiceSlug: invoiceSlugForOrder,
    payload: input.payload,
  });
}
