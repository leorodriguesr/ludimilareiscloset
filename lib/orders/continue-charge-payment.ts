import { prisma } from "@/lib/prisma";
import {
  ORDER_CHARGE_PURPOSE,
  ORDER_CHARGE_STATUS,
  ORDER_STATUS,
  PAYMENT_GATEWAY,
  PAYMENT_METHOD,
  type PaymentMethod,
} from "@/lib/orders/constants";
import { getActivePaymentAttempt } from "@/lib/orders/get-active-payment-attempt";
import {
  activatePaymentAttempt,
  beginPaymentAttempt,
  failPaymentAttempt,
  gatewayForMethod,
} from "@/lib/orders/payment-attempt-lifecycle";
import { confirmPaymentFromMercadoPago } from "@/lib/orders/confirm-payment";
import {
  createPixPayment,
  getMpOrderPixDetails,
} from "@/lib/payments/create-pix-payment";
import {
  buildInfinitePayOrderNsu,
  createInfinitePayCheckoutLink,
  infinitePayCheckoutUrlFromSlug,
  infinitePayOrderRedirectUrl,
  infinitePayWebhookUrl,
  isReusableInfinitePayCheckoutReference,
} from "@/lib/payments/infinitepay";
import { orderToInfinitePayItems } from "@/lib/payments/order-to-infinitepay-items";
import { buildInfinitePayCustomer } from "@/lib/order/payment/infinitepay-customer";
import type { ContinueOrderPaymentResult } from "@/lib/orders/continue-order-payment";

function guestDisplayName(email: string | null | undefined): string {
  const local = email?.split("@")[0]?.trim();
  if (local && local.length > 0) return local.slice(0, 80);
  return "Cliente";
}

function paymentGatewayEmail(email: string | null | undefined): string {
  const trimmed = email?.trim();
  if (trimmed && trimmed.includes("@") && !trimmed.endsWith("@venda-avulsa.local")) {
    return trimmed;
  }
  return process.env.STORE_EMAIL?.trim() || "pedidos@ludimilareiscloset.com.br";
}

function resolvePaymentMethod(raw: string | null | undefined): PaymentMethod {
  return raw === PAYMENT_METHOD.CARD ? PAYMENT_METHOD.CARD : PAYMENT_METHOD.PIX;
}

export async function continueChargePayment(input: {
  orderId: string;
  forceNewLink?: boolean;
}): Promise<ContinueOrderPaymentResult> {
  const charge = await prisma.orderCharge.findFirst({
    where: {
      orderId: input.orderId,
      status: ORDER_CHARGE_STATUS.PENDING,
    },
    orderBy: { sequence: "desc" },
    include: {
      order: {
        include: {
          items: {
            include: { product: { select: { name: true } } },
            orderBy: { id: "asc" },
          },
        },
      },
      items: {
        include: { product: { select: { name: true } } },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!charge) {
    return { ok: false, error: "Não há cobrança pendente.", code: "not_pending" };
  }

  const order = charge.order;
  if (
    order.status === ORDER_STATUS.CANCELLED ||
    order.status === ORDER_STATUS.EXPIRED
  ) {
    return { ok: false, error: "Esta venda não pode mais ser paga.", code: "not_pending" };
  }

  const chargeItems = charge.items.length > 0 ? charge.items : order.items;
  const amount = charge.amount;
  const paymentMethod = resolvePaymentMethod(order.paymentMethod);
  const activeAttempt = await getActivePaymentAttempt(order.id);

  if (paymentMethod === PAYMENT_METHOD.PIX) {
    const canReuse =
      !input.forceNewLink &&
      activeAttempt?.gateway === PAYMENT_GATEWAY.MERCADOPAGO &&
      activeAttempt.gatewayReference &&
      activeAttempt.chargeId === charge.id &&
      Math.abs(activeAttempt.amount - amount) <= 0.01;

    if (canReuse && activeAttempt.gatewayReference) {
      try {
        const mp = await getMpOrderPixDetails(activeAttempt.gatewayReference);
        if (mp.paid) {
          await confirmPaymentFromMercadoPago({
            mpOrderId: activeAttempt.gatewayReference,
            source: "polling",
            payload: { orderId: order.id, continueCharge: true },
          });
          return { ok: true, type: "paid", orderId: order.id };
        }
        if (mp.pixCode) {
          return {
            ok: true,
            type: "pix",
            orderId: order.id,
            pixCode: mp.pixCode,
            pixQrBase64: mp.pixQrBase64,
            expiresAt:
              mp.expiresAt ??
              activeAttempt.expiresAt?.toISOString() ??
              new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            amount,
          };
        }
      } catch (e) {
        console.error("[continueChargePayment] consulta MP", e);
      }
    }

    let attemptId: string;
    try {
      const begun = await beginPaymentAttempt({
        orderId: order.id,
        paymentMethod: PAYMENT_METHOD.PIX,
        gateway: gatewayForMethod(PAYMENT_METHOD.PIX),
        amount,
        purpose:
          charge.reason === "addon" ? ORDER_CHARGE_PURPOSE : "order",
        chargeId: charge.id,
        allowPaidOrder: order.status === ORDER_STATUS.PAID,
      });
      attemptId = begun.attemptId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "ORDER_EXPIRED") {
        return { ok: false, error: "Este pedido expirou.", code: "expired" };
      }
      return {
        ok: false,
        error: "Não foi possível iniciar o pagamento.",
        code: "not_pending",
      };
    }

    try {
      const pix = await createPixPayment({
        orderId: order.id,
        paymentAttemptId: attemptId,
        amount,
        description:
          charge.reason === "addon"
            ? "Acréscimo Ludimila Reis Closet"
            : "Pedido Ludimila Reis Closet",
        payerEmail: paymentGatewayEmail(order.email),
        payerName: order.recipientName ?? guestDisplayName(order.email),
        payerCpf: order.cpf ?? undefined,
      });
      const activated = await activatePaymentAttempt({
        attemptId,
        gatewayReference: pix.mpOrderId,
        expiresAt: new Date(pix.expiresAt),
      });
      if (!activated) {
        return { ok: false, error: "Não foi possível iniciar o pagamento." };
      }
      return {
        ok: true,
        type: "pix",
        orderId: order.id,
        pixCode: pix.pixCode,
        pixQrBase64: pix.pixQrBase64,
        expiresAt: pix.expiresAt,
        amount,
      };
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Não foi possível gerar o PIX.";
      await failPaymentAttempt({ attemptId, failureReason: msg });
      return { ok: false, error: msg };
    }
  }

  if (
    !input.forceNewLink &&
    activeAttempt?.gateway === PAYMENT_GATEWAY.INFINITEPAY &&
    activeAttempt.gatewayReference &&
    activeAttempt.chargeId === charge.id &&
    Math.abs(activeAttempt.amount - amount) <= 0.01 &&
    isReusableInfinitePayCheckoutReference(activeAttempt.gatewayReference)
  ) {
    return {
      ok: true,
      type: "card",
      orderId: order.id,
      checkoutUrl: infinitePayCheckoutUrlFromSlug(
        activeAttempt.gatewayReference
      ),
    };
  }

  let attemptId: string;
  let attemptNumber: number;
  try {
    const begun = await beginPaymentAttempt({
      orderId: order.id,
      paymentMethod: PAYMENT_METHOD.CARD,
      gateway: gatewayForMethod(PAYMENT_METHOD.CARD),
      amount,
      purpose: charge.reason === "addon" ? ORDER_CHARGE_PURPOSE : "order",
      chargeId: charge.id,
      allowPaidOrder: order.status === ORDER_STATUS.PAID,
    });
    attemptId = begun.attemptId;
    attemptNumber = begun.attemptNumber;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ORDER_EXPIRED") {
      return { ok: false, error: "Este pedido expirou.", code: "expired" };
    }
    return {
      ok: false,
      error: "Não foi possível iniciar o pagamento.",
      code: "not_pending",
    };
  }

  try {
    const items = orderToInfinitePayItems({
      total: amount,
      shippingAmount: 0,
      shippingServiceName: null,
      items: chargeItems,
    });
    const customer = buildInfinitePayCustomer(order);
    const destDigits = (order.destinationCep ?? "").replace(/\D/g, "");
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
                ...(order.addressStreet ? { street: order.addressStreet } : {}),
                ...(order.addressNumber ? { number: order.addressNumber } : {}),
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
      return { ok: false, error: "Não foi possível iniciar o pagamento." };
    }

    return {
      ok: true,
      type: "card",
      orderId: order.id,
      checkoutUrl,
    };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Não foi possível gerar o link.";
    await failPaymentAttempt({ attemptId, failureReason: msg });
    return { ok: false, error: msg };
  }
}
