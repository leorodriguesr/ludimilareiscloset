import {
  ORDER_STATUS,
  PAYMENT_GATEWAY,
  PAYMENT_METHOD,
  type PaymentMethod,
} from "@/lib/orders/constants";
import { expirePendingOrdersForCustomer } from "@/lib/orders/expire-orders";
import { getActivePaymentAttempt } from "@/lib/orders/get-active-payment-attempt";
import {
  activatePaymentAttempt,
  beginPaymentAttempt,
  failPaymentAttempt,
  gatewayForMethod,
} from "@/lib/orders/payment-attempt-lifecycle";
import { confirmPaymentFromMercadoPago } from "@/lib/orders/confirm-payment";
import { prisma } from "@/lib/prisma";
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
import { orderToInfinitePayItems } from "@/lib/payments/order-to-infinitepay-items";

export type ContinueOrderPaymentSuccess =
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

export type ContinueOrderPaymentResult =
  | ContinueOrderPaymentSuccess
  | { ok: false; error: string; code?: "expired" | "not_pending" | "forbidden" | "not_found" };

function normalizePhone(phone: string): string | undefined {
  const d = phone.replace(/\D/g, "");
  if (d.length < 10) return undefined;
  if (d.startsWith("55")) return `+${d}`;
  return `+55${d}`;
}

function guestDisplayName(email: string): string {
  const local = email.split("@")[0]?.trim();
  if (local && local.length > 0) return local.slice(0, 80);
  return "Cliente";
}

function isOrderOwner(
  order: { userId: string | null; email: string },
  userId: string,
  userEmail: string
): boolean {
  return (
    order.userId === userId ||
    (order.userId == null &&
      order.email.trim().toLowerCase() === userEmail.trim().toLowerCase())
  );
}

function resolvePaymentMethod(raw: string | null | undefined): PaymentMethod {
  return raw === PAYMENT_METHOD.CARD ? PAYMENT_METHOD.CARD : PAYMENT_METHOD.PIX;
}

async function restartPixPayment(input: {
  orderId: string;
  email: string;
  total: number;
  recipientName: string | null;
  cpf: string | null;
}): Promise<ContinueOrderPaymentSuccess | { ok: false; error: string }> {
  let attemptId: string;
  try {
    const begun = await beginPaymentAttempt({
      orderId: input.orderId,
      paymentMethod: PAYMENT_METHOD.PIX,
      gateway: PAYMENT_GATEWAY.MERCADOPAGO,
      amount: input.total,
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

  try {
    const pix = await createPixPayment({
      orderId: input.orderId,
      paymentAttemptId: attemptId,
      amount: input.total,
      description: "Pedido Ludimila Reis Closet",
      payerEmail: input.email,
      payerName: input.recipientName ?? guestDisplayName(input.email),
      payerCpf: input.cpf ?? undefined,
    });

    const activated = await activatePaymentAttempt({
      attemptId,
      gatewayReference: pix.mpOrderId,
      expiresAt: new Date(pix.expiresAt),
    });

    if (!activated) {
      return {
        ok: false,
        error: "Não foi possível retomar o pagamento. Tente novamente.",
      };
    }

    return {
      ok: true,
      type: "pix",
      orderId: input.orderId,
      pixCode: pix.pixCode,
      pixQrBase64: pix.pixQrBase64,
      expiresAt: pix.expiresAt,
      amount: input.total,
    };
  } catch (e) {
    console.error("[continueOrderPayment] Mercado Pago PIX", e);
    const msg =
      e instanceof Error ? e.message : "Não foi possível gerar o PIX.";
    await failPaymentAttempt({ attemptId, failureReason: msg });
    return { ok: false, error: msg };
  }
}

async function restartCardPayment(
  order: {
    id: string;
    email: string;
    destinationCep: string | null;
    recipientName: string | null;
    phone: string | null;
    addressStreet: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    addressNeighborhood: string | null;
    total: number;
    shippingAmount: number;
    shippingServiceName: string | null;
    items: Array<{
      quantity: number;
      price: number;
      product: { name: string };
    }>;
  }
): Promise<ContinueOrderPaymentSuccess | { ok: false; error: string }> {
  let attemptId: string;
  try {
    const begun = await beginPaymentAttempt({
      orderId: order.id,
      paymentMethod: PAYMENT_METHOD.CARD,
      gateway: PAYMENT_GATEWAY.INFINITEPAY,
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

  let items;
  try {
    items = orderToInfinitePayItems(order);
  } catch (e) {
    console.error("[continueOrderPayment] itens InfinitePay", e);
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
        error: "Não foi possível retomar o pagamento. Tente novamente.",
      };
    }

    return {
      ok: true,
      type: "card",
      orderId: order.id,
      checkoutUrl,
    };
  } catch (e) {
    console.error("[continueOrderPayment] InfinitePay", e);
    const msg =
      e instanceof Error ? e.message : "Não foi possível iniciar o pagamento.";
    await failPaymentAttempt({ attemptId, failureReason: msg });
    return { ok: false, error: msg };
  }
}

export async function continueOrderPayment(input: {
  orderId: string;
  userId: string;
  userEmail: string;
}): Promise<ContinueOrderPaymentResult> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      items: {
        include: { product: { select: { name: true } } },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!order) {
    return { ok: false, error: "Pedido não encontrado.", code: "not_found" };
  }

  if (!isOrderOwner(order, input.userId, input.userEmail)) {
    return { ok: false, error: "Acesso negado.", code: "forbidden" };
  }

  await expirePendingOrdersForCustomer({
    userId: order.userId,
    email: order.email,
  });

  const fresh = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      total: true,
      email: true,
      paymentMethod: true,
      shippingAmount: true,
      shippingServiceName: true,
      recipientName: true,
      cpf: true,
      destinationCep: true,
      phone: true,
      addressStreet: true,
      addressNumber: true,
      addressComplement: true,
      addressNeighborhood: true,
      items: {
        include: { product: { select: { name: true } } },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!fresh) {
    return { ok: false, error: "Pedido não encontrado.", code: "not_found" };
  }

  if (fresh.status === ORDER_STATUS.EXPIRED) {
    return {
      ok: false,
      error: "Este pedido expirou. Faça uma nova compra.",
      code: "expired",
    };
  }

  if (fresh.status !== ORDER_STATUS.PENDING_PAYMENT) {
    return {
      ok: false,
      error: "Este pedido não está aguardando pagamento.",
      code: "not_pending",
    };
  }

  const now = new Date();
  if (!fresh.expiresAt || fresh.expiresAt <= now) {
    return {
      ok: false,
      error: "Este pedido expirou. Faça uma nova compra.",
      code: "expired",
    };
  }

  const paymentMethod = resolvePaymentMethod(fresh.paymentMethod);
  const activeAttempt = await getActivePaymentAttempt(fresh.id);

  if (paymentMethod === PAYMENT_METHOD.PIX) {
    if (
      activeAttempt?.gateway === PAYMENT_GATEWAY.MERCADOPAGO &&
      activeAttempt.gatewayReference
    ) {
      try {
        const mp = await getMpOrderPixDetails(activeAttempt.gatewayReference);

        if (mp.paid) {
          await confirmPaymentFromMercadoPago({
            mpOrderId: activeAttempt.gatewayReference,
            source: "polling",
            payload: { orderId: fresh.id, continuePayment: true },
          });
          return {
            ok: false,
            error: "Pagamento já confirmado. Atualize a página.",
            code: "not_pending",
          };
        }

        const attemptPixValid =
          activeAttempt.expiresAt &&
          activeAttempt.expiresAt > now &&
          mp.pixCode;

        if (attemptPixValid) {
          return {
            ok: true,
            type: "pix",
            orderId: fresh.id,
            pixCode: mp.pixCode!,
            pixQrBase64: mp.pixQrBase64,
            expiresAt:
              mp.expiresAt ??
              activeAttempt.expiresAt!.toISOString(),
            amount: fresh.total,
          };
        }
      } catch (e) {
        console.error("[continueOrderPayment] consulta MP", e);
      }
    }

    const restarted = await restartPixPayment({
      orderId: fresh.id,
      email: fresh.email,
      total: fresh.total,
      recipientName: fresh.recipientName,
      cpf: fresh.cpf,
    });
    if (!restarted.ok) {
      return {
        ok: false,
        error: restarted.error,
        code: restarted.error.includes("expirou") ? "expired" : undefined,
      };
    }
    return restarted;
  }

  if (
    activeAttempt?.gateway === PAYMENT_GATEWAY.INFINITEPAY &&
    activeAttempt.gatewayReference
  ) {
    return {
      ok: true,
      type: "card",
      orderId: fresh.id,
      checkoutUrl: infinitePayCheckoutUrlFromSlug(
        activeAttempt.gatewayReference
      ),
    };
  }

  const restarted = await restartCardPayment({
    id: fresh.id,
    email: fresh.email,
    destinationCep: fresh.destinationCep,
    recipientName: fresh.recipientName,
    phone: fresh.phone,
    addressStreet: fresh.addressStreet,
    addressNumber: fresh.addressNumber,
    addressComplement: fresh.addressComplement,
    addressNeighborhood: fresh.addressNeighborhood,
    total: fresh.total,
    shippingAmount: fresh.shippingAmount,
    shippingServiceName: fresh.shippingServiceName,
    items: fresh.items,
  });

  if (!restarted.ok) {
    return {
      ok: false,
      error: restarted.error,
      code: restarted.error.includes("expirou") ? "expired" : undefined,
    };
  }
  return restarted;
}
