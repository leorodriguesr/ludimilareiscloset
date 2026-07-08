import {
  PAYMENT_GATEWAY,
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
  createInfinitePayCheckoutLink,
  infinitePayOrderRedirectUrl,
  infinitePayWebhookUrl,
} from "@/lib/payments/infinitepay";
import { orderToInfinitePayItems } from "@/lib/payments/order-to-infinitepay-items";

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
  | { ok: false; error: string };

function guestDisplayName(email: string): string {
  const local = email.split("@")[0]?.trim();
  if (local && local.length > 0) return local.slice(0, 80);
  return "Cliente";
}

function normalizePhone(phone: string): string | undefined {
  const d = phone.replace(/\D/g, "");
  if (d.length < 10) return undefined;
  if (d.startsWith("55")) return `+${d}`;
  return `+55${d}`;
}

async function loadOrderForPayment(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { name: true } } } },
    },
  });
}

export async function initiateOrderPayment(input: {
  orderId: string;
  paymentMethod: PaymentMethod;
}): Promise<InitiatePaymentResult> {
  const order = await loadOrderForPayment(input.orderId);
  if (!order) {
    return { ok: false, error: "Pedido não encontrado." };
  }

  let attemptId: string;
  try {
    const begun = await beginPaymentAttempt({
      orderId: order.id,
      paymentMethod: input.paymentMethod,
      gateway: gatewayForMethod(input.paymentMethod),
      amount: order.total,
    });
    attemptId = begun.attemptId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ORDER_EXPIRED") {
      return { ok: false, error: "Este pedido expirou." };
    }
    if (msg === "ORDER_NOT_PENDING") {
      return { ok: false, error: "Este pedido não pode mais ser pago." };
    }
    throw e;
  }

  if (input.paymentMethod === PAYMENT_METHOD.PIX) {
    return processPix(order, attemptId);
  }
  return processCard(order, attemptId);
}

async function processPix(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForPayment>>>,
  attemptId: string
): Promise<InitiatePaymentResult> {
  try {
    const pix = await createPixPayment({
      orderId: order.id,
      paymentAttemptId: attemptId,
      amount: order.total,
      description: "Pedido Ludimila Reis Closet",
      payerEmail: order.email,
      payerName: order.recipientName ?? guestDisplayName(order.email),
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
        error: "Não foi possível iniciar o pagamento. Tente novamente.",
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
    await failPaymentAttempt({ attemptId, failureReason: msg });
    return { ok: false, error: msg };
  }
}

async function processCard(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForPayment>>>,
  attemptId: string
): Promise<InitiatePaymentResult> {
  let items;
  try {
    items = orderToInfinitePayItems(order);
  } catch (e) {
    console.error("[initiateOrderPayment] itens InfinitePay", e);
    await failPaymentAttempt({
      attemptId,
      failureReason: "Erro ao montar itens do pagamento.",
    });
    return {
      ok: false,
      error: "Erro ao montar o pagamento. Entre em contato com o suporte.",
    };
  }

  const phone = order.phone ? normalizePhone(order.phone) : undefined;
  const customer = {
    name: (order.recipientName ?? guestDisplayName(order.email)).slice(0, 120),
    email: order.email,
    ...(phone ? { phone_number: phone } : {}),
  };

  const destDigits = (order.destinationCep ?? "").replace(/\D/g, "");

  try {
    const { checkoutUrl, slug: invoiceSlug } =
      await createInfinitePayCheckoutLink({
        items,
        orderNsu: order.id,
        redirectUrl: infinitePayOrderRedirectUrl(order.id),
        webhookUrl: infinitePayWebhookUrl(),
        customer,
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
        error: "Não foi possível iniciar o pagamento. Tente novamente.",
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
    await failPaymentAttempt({ attemptId, failureReason: msg });
    return { ok: false, error: msg };
  }
}
