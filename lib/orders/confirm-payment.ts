import {
  ORDER_CHARGE_PURPOSE,
  ORDER_CHARGE_STATUS,
  ORDER_ITEM_PAYMENT_STATUS,
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
import { onOrderPaymentConfirmed } from "@/lib/fulfillment/fulfillment-service";
import {
  OrderSource,
  FulfillmentType,
  CustomerDataStatus,
  ExchangeBalanceStatus,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import {
  expandInfinitePayPaymentReferences,
  isInfinitePayLencToken,
  parseInfinitePayOrderNsu,
} from "@/lib/payments/infinitepay";
import { appendCashLedgerEntry } from "@/lib/cash/ledger";
import { EXCHANGE_BALANCE_PURPOSE } from "@/lib/exchanges/initiate-balance-payment";
import { appendExchangeEvent } from "@/lib/exchanges/events";
import { maybeReleaseOutboundShipping } from "@/lib/exchanges/release-outbound";

const AMOUNT_TOLERANCE_BRL = 0.01;

const ORDER_SELECT_FOR_CONFIRMATION = {
  id: true,
  status: true,
  total: true,
  paidTotal: true,
  expiresAt: true,
  orderSource: true,
  fulfillmentType: true,
  customerDataStatus: true,
  recipientName: true,
  addressStreet: true,
  addressCity: true,
  addressState: true,
  destinationCep: true,
} as const;

export type ConfirmPaymentSource = "webhook" | "polling" | "return_url";

export type ConfirmPaymentResult = {
  updated: boolean;
  outcome: string;
  orderId?: string;
};

type AttemptWithOrder = {
  id: string;
  orderId: string;
  exchangeId: string | null;
  chargeId: string | null;
  purpose: string;
  status: string;
  amount: number;
  gateway: string;
  gatewayReference: string | null;
  paymentMethod: string;
  order: {
    id: string;
    status: string;
    total: number;
    paidTotal: number;
    expiresAt: Date | null;
    orderSource: OrderSource;
    fulfillmentType: FulfillmentType;
    customerDataStatus: CustomerDataStatus | null;
    recipientName: string | null;
    addressStreet: string | null;
    addressCity: string | null;
    addressState: string | null;
    destinationCep: string | null;
  };
};

function isOrderChargeAttempt(attempt: AttemptWithOrder): boolean {
  return attempt.purpose === ORDER_CHARGE_PURPOSE && !!attempt.chargeId;
}

function isExchangeBalanceAttempt(attempt: AttemptWithOrder): boolean {
  return (
    attempt.purpose === EXCHANGE_BALANCE_PURPOSE && !!attempt.exchangeId
  );
}

async function findAttemptByGatewayReference(
  gateway: PaymentGateway,
  gatewayReference: string
): Promise<AttemptWithOrder | null> {
  const refs = expandInfinitePayPaymentReferences([gatewayReference]);
  const include = {
    order: {
      select: ORDER_SELECT_FOR_CONFIRMATION,
    },
  } as const;

  const exact = await prisma.paymentAttempt.findFirst({
    where: {
      gateway,
      gatewayReference: { in: refs },
    },
    include,
  });
  if (exact) return exact;

  // Tentativa pode guardar a URL completa; webhook/retorno costuma mandar só lenc/slug.
  if (gateway === PAYMENT_GATEWAY.INFINITEPAY) {
    for (const ref of refs) {
      if (ref.length < 12 || /^https?:\/\//i.test(ref)) continue;
      const fuzzy = await prisma.paymentAttempt.findFirst({
        where: {
          gateway,
          gatewayReference: { contains: ref },
          status: {
            in: [
              PAYMENT_ATTEMPT_STATUS.ACTIVE,
              PAYMENT_ATTEMPT_STATUS.CREATED,
              PAYMENT_ATTEMPT_STATUS.SUPERSEDED,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        include,
      });
      if (fuzzy) return fuzzy;
    }
  }

  return null;
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
    (attempt.order.status === ORDER_STATUS.PENDING_PAYMENT ||
      (isOrderChargeAttempt(attempt) &&
        attempt.order.status === ORDER_STATUS.PAID));

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
    attempt.order.status === ORDER_STATUS.PAID &&
    !isOrderChargeAttempt(attempt)
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

  if (isOrderChargeAttempt(attempt)) {
    const charge = await prisma.orderCharge.findUnique({
      where: { id: attempt.chargeId! },
      select: { id: true, status: true, amount: true },
    });
    if (!charge || charge.status === ORDER_CHARGE_STATUS.CANCELLED) {
      return rejectConfirmation({
        gateway: input.gateway,
        source: input.source,
        outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_ORDER_STATE,
        reason: "Cobrança de acréscimo inválida.",
        attempt,
        gatewayReference: input.gatewayReference,
        payload: input.payload,
      });
    }
    if (charge.status === ORDER_CHARGE_STATUS.PAID) {
      return rejectConfirmation({
        gateway: input.gateway,
        source: input.source,
        outcome: WEBHOOK_AUDIT_OUTCOME.IGNORED_ALREADY_PAID,
        reason: "Acréscimo já está pago.",
        attempt,
        gatewayReference: input.gatewayReference,
        payload: input.payload,
      });
    }
    if (!amountsMatch(attempt.amount, charge.amount)) {
      return rejectConfirmation({
        gateway: input.gateway,
        source: input.source,
        outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_AMOUNT,
        reason: `Valor da tentativa (${attempt.amount}) diverge da cobrança (${charge.amount}).`,
        attempt,
        gatewayReference: input.gatewayReference,
        payload: input.payload,
      });
    }
    return null;
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

  if (
    attempt.order.orderSource === OrderSource.CHECKOUT &&
    attempt.order.expiresAt &&
    attempt.order.expiresAt <= now
  ) {
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
            select: ORDER_SELECT_FOR_CONFIRMATION,
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
          paidTotal: lockedAttempt.amount,
          shippingStatus: "to_pack",
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

      await tx.orderItem.updateMany({
        where: { orderId: lockedAttempt.orderId },
        data: {
          paymentStatus: ORDER_ITEM_PAYMENT_STATUS.PAID,
          paidAt,
        },
      });

      await tx.orderCharge.updateMany({
        where: {
          orderId: lockedAttempt.orderId,
          status: ORDER_CHARGE_STATUS.PENDING,
        },
        data: { status: ORDER_CHARGE_STATUS.PAID, paidAt },
      });

      await commitStockReservations(tx, lockedAttempt.orderId);

      await appendCashLedgerEntry(tx, {
        direction: "IN",
        kind: "SALE",
        amount: lockedAttempt.amount,
        description: `Venda · pedido ${lockedAttempt.orderId.slice(0, 8)}`,
        orderId: lockedAttempt.orderId,
        paymentAttemptId: lockedAttempt.id,
      });
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

  void onOrderPaymentConfirmed(input.attempt.order);

  return {
    updated: true,
    outcome: WEBHOOK_AUDIT_OUTCOME.CONFIRMED,
    orderId: input.attempt.orderId,
  };
}

async function confirmChargeInTransaction(input: {
  attempt: AttemptWithOrder;
  gateway: PaymentGateway;
  source: ConfirmPaymentSource;
  gatewayTransactionId?: string | null;
  payload?: unknown;
}): Promise<ConfirmPaymentResult> {
  const paidAt = new Date();
  const chargeId = input.attempt.chargeId!;

  try {
    await prisma.$transaction(async (tx) => {
      const lockedAttempt = await tx.paymentAttempt.findUnique({
        where: { id: input.attempt.id },
        include: {
          order: { select: ORDER_SELECT_FOR_CONFIRMATION },
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

      await tx.orderCharge.update({
        where: { id: chargeId },
        data: { status: ORDER_CHARGE_STATUS.PAID, paidAt },
      });

      await tx.orderItem.updateMany({
        where: { chargeId },
        data: {
          paymentStatus: ORDER_ITEM_PAYMENT_STATUS.PAID,
          paidAt,
        },
      });

      await tx.order.update({
        where: { id: lockedAttempt.orderId },
        data: {
          paidTotal: {
            increment: lockedAttempt.amount,
          },
        },
      });

      await commitStockReservations(tx, lockedAttempt.orderId);

      await appendCashLedgerEntry(tx, {
        direction: "IN",
        kind: "SALE",
        amount: lockedAttempt.amount,
        description: `Acréscimo · pedido ${lockedAttempt.orderId.slice(0, 8)}`,
        orderId: lockedAttempt.orderId,
        paymentAttemptId: lockedAttempt.id,
      });
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
    reason: "Acréscimo confirmado.",
    payload: input.payload,
  });

  return {
    updated: true,
    outcome: WEBHOOK_AUDIT_OUTCOME.CONFIRMED,
    orderId: input.attempt.orderId,
  };
}

async function confirmExchangeBalanceInTransaction(input: {
  attempt: AttemptWithOrder;
  gateway: PaymentGateway;
  source: ConfirmPaymentSource;
  gatewayTransactionId?: string | null;
  payload?: unknown;
}): Promise<ConfirmPaymentResult> {
  const exchangeId = input.attempt.exchangeId!;
  const paidAt = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const lockedAttempt = await tx.paymentAttempt.findUnique({
        where: { id: input.attempt.id },
      });

      if (!lockedAttempt || !lockedAttempt.exchangeId) {
        throw new ConfirmPaymentRejectedError({
          updated: false,
          outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_NOT_FOUND,
        });
      }

      if (lockedAttempt.status === PAYMENT_ATTEMPT_STATUS.PAID) {
        throw new ConfirmPaymentRejectedError({
          updated: false,
          outcome: WEBHOOK_AUDIT_OUTCOME.IGNORED_ALREADY_PAID,
        });
      }

      if (
        lockedAttempt.status !== PAYMENT_ATTEMPT_STATUS.ACTIVE &&
        lockedAttempt.status !== PAYMENT_ATTEMPT_STATUS.SUPERSEDED
      ) {
        throw new ConfirmPaymentRejectedError({
          updated: false,
          outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_ATTEMPT_STATUS,
        });
      }

      const exchange = await tx.exchange.findUnique({
        where: { id: lockedAttempt.exchangeId },
      });

      if (!exchange || exchange.status === ExchangeStatus.CANCELLED) {
        throw new ConfirmPaymentRejectedError({
          updated: false,
          outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_ORDER_STATE,
        });
      }

      if (
        exchange.balanceStatus === ExchangeBalanceStatus.PAID ||
        exchange.balanceStatus === ExchangeBalanceStatus.WAIVED
      ) {
        throw new ConfirmPaymentRejectedError({
          updated: false,
          outcome: WEBHOOK_AUDIT_OUTCOME.IGNORED_ALREADY_PAID,
        });
      }

      if (
        exchange.balanceStatus !== ExchangeBalanceStatus.PENDING ||
        !amountsMatch(lockedAttempt.amount, exchange.balanceAmount)
      ) {
        throw new ConfirmPaymentRejectedError({
          updated: false,
          outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_AMOUNT,
        });
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
          exchangeId: lockedAttempt.exchangeId,
          purpose: EXCHANGE_BALANCE_PURPOSE,
          status: PAYMENT_ATTEMPT_STATUS.ACTIVE,
          id: { not: lockedAttempt.id },
        },
        data: { status: PAYMENT_ATTEMPT_STATUS.SUPERSEDED },
      });

      await tx.exchange.update({
        where: { id: exchange.id },
        data: {
          balanceStatus: ExchangeBalanceStatus.PAID,
          balancePaidAt: paidAt,
        },
      });

      await appendExchangeEvent(tx, {
        exchangeId: exchange.id,
        type: "BALANCE_PAID",
        payload: {
          via: "payment_webhook",
          paymentAttemptId: lockedAttempt.id,
          amount: exchange.balanceAmount,
        },
      });

      await appendCashLedgerEntry(tx, {
        direction: "IN",
        kind: "EXCHANGE_BALANCE",
        amount: exchange.balanceAmount,
        description: `Diferença recebida · troca #${exchange.exchangeNumber ?? exchange.id.slice(0, 6)}`,
        orderId: exchange.orderId,
        exchangeId: exchange.id,
        paymentAttemptId: lockedAttempt.id,
      });

      await maybeReleaseOutboundShipping(tx, exchange.id);
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
    reason: "Diferença de troca confirmada.",
    payload: input.payload,
  });

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

  if (isOrderChargeAttempt(attempt)) {
    return confirmChargeInTransaction({
      attempt,
      gateway: PAYMENT_GATEWAY.MERCADOPAGO,
      source: input.source,
      payload: input.payload,
    });
  }

  if (isExchangeBalanceAttempt(attempt)) {
    return confirmExchangeBalanceInTransaction({
      attempt,
      gateway: PAYMENT_GATEWAY.MERCADOPAGO,
      source: input.source,
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
    const { orderId, attemptNumber } = parseInfinitePayOrderNsu(orderNsu);

    if (attemptNumber != null) {
      attempt = await prisma.paymentAttempt.findFirst({
        where: {
          orderId,
          attemptNumber,
          gateway: PAYMENT_GATEWAY.INFINITEPAY,
        },
        include: {
          order: {
            select: ORDER_SELECT_FOR_CONFIRMATION,
          },
        },
      });
    }

    if (!attempt) {
      attempt = await prisma.paymentAttempt.findFirst({
        where: {
          orderId,
          gateway: PAYMENT_GATEWAY.INFINITEPAY,
          status: PAYMENT_ATTEMPT_STATUS.ACTIVE,
        },
        include: {
          order: {
            select: ORDER_SELECT_FOR_CONFIRMATION,
          },
        },
      });
    }

    if (!attempt && orderNsu.includes("-ex-")) {
      attempt = await prisma.paymentAttempt.findFirst({
        where: {
          orderId,
          gateway: PAYMENT_GATEWAY.INFINITEPAY,
          purpose: EXCHANGE_BALANCE_PURPOSE,
          status: {
            in: [
              PAYMENT_ATTEMPT_STATUS.ACTIVE,
              PAYMENT_ATTEMPT_STATUS.SUPERSEDED,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        include: {
          order: {
            select: ORDER_SELECT_FOR_CONFIRMATION,
          },
        },
      });
    }
  }

  if (!attempt) {
    const { orderId } = orderNsu
      ? parseInfinitePayOrderNsu(orderNsu)
      : { orderId: null };
    return rejectConfirmation({
      gateway: PAYMENT_GATEWAY.INFINITEPAY,
      source: input.source,
      outcome: WEBHOOK_AUDIT_OUTCOME.REJECTED_NOT_FOUND,
      reason: "Nenhuma PaymentAttempt encontrada para o webhook InfinitePay.",
      orderId: orderId || orderNsu || null,
      gatewayReference: slug || null,
      payload: input.payload,
    });
  }

  if (isOrderChargeAttempt(attempt)) {
    return confirmChargeInTransaction({
      attempt,
      gateway: PAYMENT_GATEWAY.INFINITEPAY,
      source: input.source,
      gatewayTransactionId: input.transactionNsu?.trim() || null,
      payload: input.payload,
    });
  }

  if (isExchangeBalanceAttempt(attempt)) {
    return confirmExchangeBalanceInTransaction({
      attempt,
      gateway: PAYMENT_GATEWAY.INFINITEPAY,
      source: input.source,
      gatewayTransactionId: input.transactionNsu?.trim() || null,
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
