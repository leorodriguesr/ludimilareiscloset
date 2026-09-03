import {
  ExchangeBalanceStatus,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import {
  PAYMENT_ATTEMPT_STATUS,
  PAYMENT_GATEWAY,
  PAYMENT_METHOD,
  type PaymentMethod,
} from "@/lib/orders/constants";
import {
  activatePaymentAttempt,
  failPaymentAttempt,
  gatewayForMethod,
} from "@/lib/orders/payment-attempt-lifecycle";
import {
  createPixPayment,
  getMpOrderPixDetails,
} from "@/lib/payments/create-pix-payment";
import {
  createInfinitePayCheckoutLink,
  infinitePayCheckoutUrlFromSlug,
  infinitePayOrderRedirectUrl,
  infinitePayWebhookUrl,
} from "@/lib/payments/infinitepay";
import { prisma } from "@/lib/prisma";
import { ExchangeError } from "@/lib/exchanges/constants";
import { appendExchangeEvent } from "@/lib/exchanges/events";

export const EXCHANGE_BALANCE_PURPOSE = "exchange_balance";

export type InitiateExchangeBalancePaymentResult =
  | {
      ok: true;
      type: "pix";
      exchangeId: string;
      pixCode: string;
      pixQrBase64: string | null;
      expiresAt: string;
      amount: number;
    }
  | {
      ok: true;
      type: "card";
      exchangeId: string;
      checkoutUrl: string;
      amount: number;
    }
  | { ok: false; error: string };

export async function getCurrentExchangeBalancePayment(
  exchangeId: string
): Promise<InitiateExchangeBalancePaymentResult | null> {
  const attempt = await prisma.paymentAttempt.findFirst({
    where: {
      exchangeId,
      purpose: EXCHANGE_BALANCE_PURPOSE,
      status: {
        in: [
          PAYMENT_ATTEMPT_STATUS.ACTIVE,
          PAYMENT_ATTEMPT_STATUS.CREATED,
        ],
      },
    },
    orderBy: { attemptNumber: "desc" },
    select: {
      paymentMethod: true,
      gatewayReference: true,
      expiresAt: true,
      amount: true,
    },
  });

  if (!attempt?.gatewayReference) return null;

  if (attempt.paymentMethod === PAYMENT_METHOD.CARD) {
    return {
      ok: true,
      type: "card",
      exchangeId,
      checkoutUrl: infinitePayCheckoutUrlFromSlug(attempt.gatewayReference),
      amount: attempt.amount,
    };
  }

  if (attempt.paymentMethod === PAYMENT_METHOD.PIX) {
    const pix = await getMpOrderPixDetails(attempt.gatewayReference);
    if (!pix.pixCode) return null;
    return {
      ok: true,
      type: "pix",
      exchangeId,
      pixCode: pix.pixCode,
      pixQrBase64: pix.pixQrBase64,
      expiresAt:
        pix.expiresAt ??
        attempt.expiresAt?.toISOString() ??
        new Date().toISOString(),
      amount: attempt.amount,
    };
  }

  return null;
}

function paymentGatewayEmail(email: string | null | undefined): string {
  const trimmed = email?.trim();
  if (
    trimmed &&
    trimmed.includes("@") &&
    !trimmed.endsWith("@venda-avulsa.local")
  ) {
    return trimmed;
  }
  return (
    process.env.STORE_EMAIL?.trim() || "pedidos@ludimilareiscloset.com.br"
  );
}

async function beginExchangeBalancePaymentAttempt(input: {
  exchangeId: string;
  paymentMethod: PaymentMethod;
  actorUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const exchange = await tx.exchange.findUnique({
      where: { id: input.exchangeId },
      include: {
        order: {
          select: {
            id: true,
            email: true,
            recipientName: true,
            cpf: true,
            destinationCep: true,
            addressStreet: true,
            addressNumber: true,
            addressComplement: true,
            addressNeighborhood: true,
            orderNumber: true,
          },
        },
      },
    });

    if (!exchange) {
      throw new ExchangeError("NOT_FOUND", "Troca não encontrada.");
    }
    if (exchange.status === ExchangeStatus.CANCELLED) {
      throw new ExchangeError("CANCELLED", "Troca cancelada.");
    }
    if (exchange.balanceStatus !== ExchangeBalanceStatus.PENDING) {
      throw new ExchangeError(
        "NO_AMOUNT_DUE",
        "Não há diferença pendente para cobrar."
      );
    }
    if (exchange.balanceAmount <= 0) {
      throw new ExchangeError(
        "NO_AMOUNT_DUE",
        "Não há valor a cobrar nesta troca."
      );
    }

    await tx.paymentAttempt.updateMany({
      where: {
        exchangeId: exchange.id,
        purpose: EXCHANGE_BALANCE_PURPOSE,
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
      where: { orderId: exchange.orderId },
      _max: { attemptNumber: true },
    });
    const attemptNumber = (maxRow._max.attemptNumber ?? 0) + 1;
    const amount = Math.round(exchange.balanceAmount * 100) / 100;

    const attempt = await tx.paymentAttempt.create({
      data: {
        orderId: exchange.orderId,
        exchangeId: exchange.id,
        purpose: EXCHANGE_BALANCE_PURPOSE,
        attemptNumber,
        paymentMethod: input.paymentMethod,
        gateway: gatewayForMethod(input.paymentMethod),
        status: PAYMENT_ATTEMPT_STATUS.CREATED,
        amount,
      },
      select: { id: true, amount: true },
    });

    await appendExchangeEvent(tx, {
      exchangeId: exchange.id,
      type: "PAYMENT_LINK_CREATED",
      actorUserId: input.actorUserId,
      payload: {
        paymentMethod: input.paymentMethod,
        amount,
        attemptId: attempt.id,
      },
    });

    return { exchange, attemptId: attempt.id, amount };
  });
}

export async function initiateExchangeBalancePayment(input: {
  exchangeId: string;
  paymentMethod: PaymentMethod;
  actorUserId: string;
}): Promise<InitiateExchangeBalancePaymentResult> {
  if (
    input.paymentMethod !== PAYMENT_METHOD.PIX &&
    input.paymentMethod !== PAYMENT_METHOD.CARD
  ) {
    return { ok: false, error: "Método de pagamento inválido." };
  }

  let begun: Awaited<ReturnType<typeof beginExchangeBalancePaymentAttempt>>;
  try {
    begun = await beginExchangeBalancePaymentAttempt(input);
  } catch (e) {
    if (e instanceof ExchangeError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const { exchange, attemptId, amount } = begun;
  const order = exchange.order;
  const label = `Diferença troca #${exchange.exchangeNumber ?? exchange.id.slice(0, 6)}`;

  if (input.paymentMethod === PAYMENT_METHOD.PIX) {
    try {
      const pix = await createPixPayment({
        orderId: order.id,
        paymentAttemptId: attemptId,
        amount,
        description: label,
        payerEmail: paymentGatewayEmail(order.email),
        payerName: order.recipientName ?? undefined,
        payerCpf: order.cpf ?? undefined,
      });

      const activated = await activatePaymentAttempt({
        attemptId,
        gatewayReference: pix.mpOrderId,
        expiresAt: new Date(pix.expiresAt),
      });

      if (!activated) {
        return {
          ok: false,
          error: "Não foi possível iniciar o PIX. Tente novamente.",
        };
      }

      return {
        ok: true,
        type: "pix",
        exchangeId: exchange.id,
        pixCode: pix.pixCode,
        pixQrBase64: pix.pixQrBase64,
        expiresAt: pix.expiresAt,
        amount,
      };
    } catch (e) {
      console.error("[initiateExchangeBalancePayment] PIX", e);
      const msg =
        e instanceof Error ? e.message : "Não foi possível gerar o PIX.";
      await failPaymentAttempt({ attemptId, failureReason: msg });
      return { ok: false, error: msg };
    }
  }

  try {
    const { checkoutUrl, slug: invoiceSlug } =
      await createInfinitePayCheckoutLink({
        items: [
          {
            quantity: 1,
            price: Math.round(amount * 100),
            description: label.slice(0, 120),
          },
        ],
        orderNsu: `${order.id}-ex-${exchange.id.slice(0, 8)}`,
        redirectUrl: infinitePayOrderRedirectUrl(order.id),
        webhookUrl: infinitePayWebhookUrl(),
      });

    if (!invoiceSlug) {
      await failPaymentAttempt({
        attemptId,
        failureReason: "InfinitePay não retornou slug da fatura.",
      });
      return { ok: false, error: "Resposta inválida da InfinitePay." };
    }

    const activated = await activatePaymentAttempt({
      attemptId,
      gatewayReference: invoiceSlug,
    });

    if (!activated) {
      return {
        ok: false,
        error: "Não foi possível iniciar o cartão. Tente novamente.",
      };
    }

    return {
      ok: true,
      type: "card",
      exchangeId: exchange.id,
      checkoutUrl,
      amount,
    };
  } catch (e) {
    console.error("[initiateExchangeBalancePayment] cartão", e);
    const msg =
      e instanceof Error ? e.message : "Não foi possível iniciar o cartão.";
    await failPaymentAttempt({ attemptId, failureReason: msg });
    return { ok: false, error: msg };
  }
}
