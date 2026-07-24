import { getAppSession } from "@/lib/auth-session";
import {
  OrderCreateError,
  type CheckoutLineInput,
  type OrderAddressInput,
  type OrderContactInput,
} from "@/lib/orders/create-order";
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
import { upsertPendingOrderFromCheckout } from "@/lib/orders/upsert-pending-order";
import { prisma } from "@/lib/prisma";
import {
  createInfinitePayCheckoutLink,
  infinitePayOrderRedirectUrl,
  infinitePayWebhookUrl,
} from "@/lib/payments/infinitepay";
import { normalizeInfinitePayPhone } from "@/lib/order/payment/infinitepay-customer";
import { orderToInfinitePayItems } from "@/lib/payments/order-to-infinitepay-items";
import { createPixPayment } from "@/lib/payments/create-pix-payment";
import { isLocalPaymentCallbackBaseUrl } from "@/lib/site-url";

export type StartCheckoutPaymentInput = {
  email: string;
  userId: string | null;
  lines: CheckoutLineInput[];
  shipping: { destinationCep: string; optionId: string };
  contact?: OrderContactInput;
  address?: OrderAddressInput;
  cpf?: string;
  paymentMethod: PaymentMethod;
};

export type StartCheckoutPaymentSuccess =
  | {
      ok: true;
      type: "card";
      orderId: string;
      checkoutUrl: string;
      priceUpdated: boolean;
    }
  | {
      ok: true;
      type: "pix";
      orderId: string;
      pixCode: string;
      pixQrBase64: string | null;
      expiresAt: string;
      amount: number;
      priceUpdated: boolean;
    };

export type StartCheckoutPaymentResult =
  | StartCheckoutPaymentSuccess
  | { ok: false; error: string };

function guestDisplayName(email: string): string {
  const local = email.split("@")[0]?.trim();
  if (local && local.length > 0) return local.slice(0, 80);
  return "Cliente";
}

export async function startCheckoutPayment(
  input: StartCheckoutPaymentInput
): Promise<StartCheckoutPaymentResult> {
  const { cpfValidationError } = await import("@/lib/validation/cpf");
  const cpfError = cpfValidationError(input.cpf ?? input.contact?.cpf ?? "");
  if (cpfError) {
    return { ok: false, error: cpfError };
  }

  const upsert = await upsertPendingOrderFromCheckout({
    email: input.email,
    userId: input.userId,
    lines: input.lines,
    shipping: input.shipping,
    contact: input.contact,
    cpf: input.cpf,
    address: input.address,
    paymentMethod: input.paymentMethod,
  });

  let attemptId: string;
  try {
    const begun = await beginPaymentAttempt({
      orderId: upsert.orderId,
      paymentMethod: input.paymentMethod,
      gateway: gatewayForMethod(input.paymentMethod),
      amount: upsert.total,
    });
    attemptId = begun.attemptId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ORDER_EXPIRED") {
      return {
        ok: false,
        error: "Seu pedido expirou. Atualize a página e tente novamente.",
      };
    }
    if (msg === "ORDER_NOT_PENDING") {
      return {
        ok: false,
        error: "Este pedido não pode mais ser pago.",
      };
    }
    throw e;
  }

  if (input.paymentMethod === PAYMENT_METHOD.PIX) {
    return processPixPayment(input, upsert, attemptId);
  }

  return processCardPayment(input, upsert, attemptId);
}

async function processPixPayment(
  input: StartCheckoutPaymentInput,
  upsert: { orderId: string; total: number; priceUpdated: boolean },
  attemptId: string
): Promise<StartCheckoutPaymentResult> {
  const session = await getAppSession();
  const payerName =
    input.contact?.name?.trim() ||
    (session.user
      ? (
          await prisma.user.findUnique({
            where: { id: session.user.userId },
            select: { name: true },
          })
        )?.name
      : undefined) ||
    guestDisplayName(input.email);

  try {
    const pix = await createPixPayment({
      orderId: upsert.orderId,
      paymentAttemptId: attemptId,
      amount: upsert.total,
      description: "Pedido Ludimila Reis Closet",
      payerEmail: input.email,
      payerName,
      payerCpf: input.cpf,
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
      orderId: upsert.orderId,
      pixCode: pix.pixCode,
      pixQrBase64: pix.pixQrBase64,
      expiresAt: pix.expiresAt,
      amount: upsert.total,
      priceUpdated: upsert.priceUpdated,
    };
  } catch (e) {
    console.error("[startCheckoutPayment] Mercado Pago PIX", e);
    const msg =
      e instanceof Error ? e.message : "Não foi possível gerar o PIX.";
    await failPaymentAttempt({ attemptId, failureReason: msg });
    if (msg.includes("MERCADO_PAGO_ACCESS_TOKEN")) {
      return {
        ok: false,
        error: "Pagamento PIX não configurado no servidor.",
      };
    }
    return { ok: false, error: msg };
  }
}

async function processCardPayment(
  input: StartCheckoutPaymentInput,
  upsert: { orderId: string; total: number; priceUpdated: boolean },
  attemptId: string
): Promise<StartCheckoutPaymentResult> {
  const session = await getAppSession();

  const full = await prisma.order.findUnique({
    where: { id: upsert.orderId },
    include: {
      items: { include: { product: { select: { name: true } } } },
    },
  });

  if (!full) {
    await failPaymentAttempt({
      attemptId,
      failureReason: "Pedido não encontrado após recálculo.",
    });
    return { ok: false, error: "Pedido não encontrado." };
  }

  let items;
  try {
    items = orderToInfinitePayItems(full);
  } catch (e) {
    console.error("[startCheckoutPayment] itens InfinitePay", e);
    await failPaymentAttempt({
      attemptId,
      failureReason: "Erro ao montar itens do pagamento.",
    });
    return {
      ok: false,
      error: "Erro ao montar o pagamento. Entre em contato com o suporte.",
    };
  }

  const checkoutPhone = input.contact?.phone
    ? normalizeInfinitePayPhone(input.contact.phone)
    : undefined;

  let customer: { name: string; email: string; phone_number?: string };

  if (session.user) {
    const u = await prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { name: true, phone: true },
    });
    const phone =
      checkoutPhone ?? (u ? normalizeInfinitePayPhone(u.phone) : undefined);
    const name = (
      input.contact?.name?.trim() || u?.name || guestDisplayName(input.email)
    ).slice(0, 120);
    customer = { name, email: input.email, ...(phone ? { phone_number: phone } : {}) };
  } else {
    const name = (
      input.contact?.name?.trim() || guestDisplayName(input.email)
    ).slice(0, 120);
    customer = {
      name,
      email: input.email,
      ...(checkoutPhone ? { phone_number: checkoutPhone } : {}),
    };
  }

  const destDigits = (full.destinationCep ?? "").replace(/\D/g, "");

  if (isLocalPaymentCallbackBaseUrl()) {
    console.debug(
      "[startCheckoutPayment] callback local — webhook não chega em localhost; confirmação via retorno em /pedido/[id]"
    );
  }

  try {
    const { checkoutUrl, slug: gatewayReference } =
      await createInfinitePayCheckoutLink({
        items,
        orderNsu: full.id,
        redirectUrl: infinitePayOrderRedirectUrl(full.id),
        webhookUrl: infinitePayWebhookUrl(),
        customer,
        ...(destDigits.length === 8
          ? {
              address: {
                cep: destDigits,
                ...(input.address?.street
                  ? { street: input.address.street }
                  : {}),
                ...(input.address?.number
                  ? { number: input.address.number }
                  : {}),
                ...(input.address?.complement
                  ? { complement: input.address.complement }
                  : {}),
                ...(input.address?.neighborhood
                  ? { neighborhood: input.address.neighborhood }
                  : {}),
              },
            }
          : {}),
      });

    if (!gatewayReference) {
      await failPaymentAttempt({
        attemptId,
        failureReason: "InfinitePay não retornou identificador da fatura.",
      });
      return {
        ok: false,
        error: "Resposta inválida da InfinitePay.",
      };
    }

    const activated = await activatePaymentAttempt({
      attemptId,
      gatewayReference,
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
      orderId: upsert.orderId,
      checkoutUrl,
      priceUpdated: upsert.priceUpdated,
    };
  } catch (e) {
    console.error("[startCheckoutPayment] InfinitePay", e);
    const msg =
      e instanceof Error ? e.message : "Não foi possível iniciar o pagamento.";
    await failPaymentAttempt({ attemptId, failureReason: msg });
    if (msg.includes("INFINITEPAY_HANDLE")) {
      return {
        ok: false,
        error: "Pagamento não configurado no servidor (INFINITEPAY_HANDLE).",
      };
    }
    return { ok: false, error: msg };
  }
}

export { OrderCreateError };
