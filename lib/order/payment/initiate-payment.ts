import {
  PAYMENT_METHOD,
  type PaymentMethod,
} from "@/lib/orders/constants";
import {
  activatePaymentAttempt,
  beginPaymentAttempt,
  failPaymentAttempt,
  gatewayForMethod,
} from "@/lib/orders/payment-attempt-lifecycle";
import { prisma } from "@/lib/prisma";
import { createPixPayment } from "@/lib/payments/create-pix-payment";
import {
  buildInfinitePayOrderNsu,
  createInfinitePayCheckoutLink,
  infinitePayOrderRedirectUrl,
  infinitePayWebhookUrl,
} from "@/lib/payments/infinitepay";
import { orderToInfinitePayItems } from "@/lib/payments/order-to-infinitepay-items";
import { buildInfinitePayCustomer } from "@/lib/order/payment/infinitepay-customer";

export type InitiatePaymentSuccess =
  | {
      ok: true;
      type: "pix";
      orderId: string;
      pixCode: string;
      pixQrBase64: string | null;
      expiresAt: string;
      amount: number;
    }
  | {
      ok: true;
      type: "card";
      orderId: string;
      checkoutUrl: string;
    };

export type InitiatePaymentResult =
  | InitiatePaymentSuccess
  | {
      ok: false;
      error: string;
      /** Seguro remover o pedido recém-criado: nenhuma cobrança utilizável existe. */
      canRollbackOrder: boolean;
    };

function guestDisplayName(email: string | null | undefined): string {
  const local = email?.split("@")[0]?.trim();
  if (local && local.length > 0) return local.slice(0, 80);
  return "Cliente";
}

/** E-mail enviado ao gateway quando o pedido ainda não tem e-mail do cliente. */
function paymentGatewayEmail(email: string | null | undefined): string {
  const trimmed = email?.trim();
  if (trimmed && trimmed.includes("@") && !trimmed.endsWith("@venda-avulsa.local")) {
    return trimmed;
  }
  return process.env.STORE_EMAIL?.trim() || "pedidos@ludimilareiscloset.com.br";
}

async function loadOrderForPayment(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { name: true } } } },
    },
  });
}

async function recordFailedPaymentAttempt(
  attemptId: string,
  failureReason: string
): Promise<void> {
  try {
    await failPaymentAttempt({ attemptId, failureReason });
  } catch (error) {
    console.error(
      "[initiateOrderPayment] falha ao registrar tentativa",
      attemptId,
      error
    );
  }
}

export async function initiateOrderPayment(input: {
  orderId: string;
  paymentMethod: PaymentMethod;
}): Promise<InitiatePaymentResult> {
  let order: Awaited<ReturnType<typeof loadOrderForPayment>>;
  try {
    order = await loadOrderForPayment(input.orderId);
  } catch (error) {
    console.error("[initiateOrderPayment] carregar pedido", error);
    return {
      ok: false,
      error: "Não foi possível iniciar o pagamento. Tente novamente.",
      canRollbackOrder: true,
    };
  }
  if (!order) {
    return {
      ok: false,
      error: "Pedido não encontrado.",
      canRollbackOrder: true,
    };
  }

  let attemptId: string;
  let attemptNumber: number;
  try {
    const begun = await beginPaymentAttempt({
      orderId: order.id,
      paymentMethod: input.paymentMethod,
      gateway: gatewayForMethod(input.paymentMethod),
      amount: order.total,
    });
    attemptId = begun.attemptId;
    attemptNumber = begun.attemptNumber;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ORDER_EXPIRED") {
      return {
        ok: false,
        error: "Este pedido expirou.",
        canRollbackOrder: true,
      };
    }
    if (msg === "ORDER_NOT_PENDING") {
      return {
        ok: false,
        error: "Este pedido não pode mais ser pago.",
        canRollbackOrder: true,
      };
    }
    console.error("[initiateOrderPayment] criar tentativa", e);
    return {
      ok: false,
      error: "Não foi possível iniciar o pagamento. Tente novamente.",
      canRollbackOrder: true,
    };
  }

  if (input.paymentMethod === PAYMENT_METHOD.PIX) {
    return processPix(order, attemptId);
  }
  return processCard(order, attemptId, attemptNumber);
}

async function processPix(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForPayment>>>,
  attemptId: string
): Promise<InitiatePaymentResult> {
  let externalPaymentCreated = false;
  try {
    const pix = await createPixPayment({
      orderId: order.id,
      paymentAttemptId: attemptId,
      amount: order.total,
      description: "Pedido Ludimila Reis Closet",
      payerEmail: paymentGatewayEmail(order.email),
      payerName: order.recipientName ?? guestDisplayName(order.email),
      payerCpf: order.cpf ?? undefined,
    });
    externalPaymentCreated = true;

    const activated = await activatePaymentAttempt({
      attemptId,
      gatewayReference: pix.mpOrderId,
      expiresAt: new Date(pix.expiresAt),
    });

    if (!activated) {
      return {
        ok: false,
        error: "Não foi possível iniciar o pagamento. Tente novamente.",
        canRollbackOrder: false,
      };
    }

    return {
      ok: true,
      type: "pix",
      orderId: order.id,
      pixCode: pix.pixCode,
      pixQrBase64: pix.pixQrBase64,
      expiresAt: pix.expiresAt,
      amount: order.total,
    };
  } catch (e) {
    console.error("[initiateOrderPayment] Mercado Pago PIX", e);
    const msg =
      e instanceof Error ? e.message : "Não foi possível gerar o PIX.";
    await recordFailedPaymentAttempt(attemptId, msg);
    return {
      ok: false,
      error: msg,
      canRollbackOrder: !externalPaymentCreated,
    };
  }
}

async function processCard(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForPayment>>>,
  attemptId: string,
  attemptNumber: number
): Promise<InitiatePaymentResult> {
  let items;
  try {
    items = orderToInfinitePayItems(order);
  } catch (e) {
    console.error("[initiateOrderPayment] itens InfinitePay", e);
    await recordFailedPaymentAttempt(
      attemptId,
      "Erro ao montar itens do pagamento."
    );
    return {
      ok: false,
      error: "Erro ao montar o pagamento. Entre em contato com o suporte.",
      canRollbackOrder: true,
    };
  }

  const customer = buildInfinitePayCustomer(order);

  const destDigits = (order.destinationCep ?? "").replace(/\D/g, "");

  let externalPaymentCreated = false;
  try {
    const { checkoutUrl, slug: invoiceSlug } =
      await createInfinitePayCheckoutLink({
        items,
        orderNsu: buildInfinitePayOrderNsu(order.id, attemptNumber),
        redirectUrl: infinitePayOrderRedirectUrl(order.id),
        webhookUrl: infinitePayWebhookUrl(),
        ...(customer ? { customer } : {}),
        ...(destDigits.length === 8
          ? {
              address: {
                cep: destDigits,
                ...(order.addressStreet
                  ? { street: order.addressStreet }
                  : {}),
                ...(order.addressNumber
                  ? { number: order.addressNumber }
                  : {}),
                ...(order.addressComplement
                  ? { complement: order.addressComplement }
                  : {}),
                ...(order.addressNeighborhood
                  ? { neighborhood: order.addressNeighborhood }
                  : {}),
              },
            }
          : {}),
      });
    externalPaymentCreated = true;

    if (!invoiceSlug) {
      await recordFailedPaymentAttempt(
        attemptId,
        "InfinitePay não retornou slug da fatura."
      );
      return {
        ok: false,
        error: "Resposta inválida da InfinitePay.",
        canRollbackOrder: false,
      };
    }

    const activated = await activatePaymentAttempt({
      attemptId,
      gatewayReference: invoiceSlug,
    });

    if (!activated) {
      return {
        ok: false,
        error: "Não foi possível iniciar o pagamento. Tente novamente.",
        canRollbackOrder: false,
      };
    }

    return {
      ok: true,
      type: "card",
      orderId: order.id,
      checkoutUrl,
    };
  } catch (e) {
    console.error("[initiateOrderPayment] InfinitePay", e);
    const msg =
      e instanceof Error ? e.message : "Não foi possível iniciar o pagamento.";
    await recordFailedPaymentAttempt(attemptId, msg);
    return {
      ok: false,
      error: msg,
      canRollbackOrder: !externalPaymentCreated,
    };
  }
}
