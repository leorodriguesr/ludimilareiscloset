import { randomBytes } from "crypto";
import { OrderSource } from "@/app/generated/prisma/client";
import { isCheckoutPaymentLinkWithinDeadline } from "@/lib/admin-sale/payment-link-expiry";
import { ORDER_STATUS, PAYMENT_METHOD } from "@/lib/orders/constants";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/site-url";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function generatePaymentToken(): {
  token: string;
  expiresAt: Date;
} {
  return {
    token: randomBytes(32).toString("hex"),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  };
}

export function buildPaymentPageUrl(token: string): string {
  return `${getAppBaseUrl()}/venda-avulsa/pagar/${token}`;
}

/** Caminho relativo — o admin monta a URL absoluta com `window.location.origin`. */
export function buildPaymentPagePath(token: string): string {
  return `/venda-avulsa/pagar/${token}`;
}

function acceptsPaymentPageToken(source: string | null | undefined): boolean {
  return source === OrderSource.ADMIN_SALE || source === OrderSource.CHECKOUT;
}

/** Garante token de pagamento para PIX pendente (venda avulsa ou checkout). */
export async function ensureOrderPaymentToken(
  orderId: string
): Promise<{ token: string; paymentUrl: string; paymentPath: string } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderSource: true,
      status: true,
      paymentMethod: true,
      paidAt: true,
      expiresAt: true,
      paymentToken: true,
      paymentTokenExpiresAt: true,
    },
  });

  if (!order) return null;
  if (!acceptsPaymentPageToken(order.orderSource)) return null;
  if (
    !isCheckoutPaymentLinkWithinDeadline({
      orderSource: order.orderSource,
      expiresAt: order.expiresAt,
    })
  ) {
    return null;
  }
  if (order.paymentMethod !== PAYMENT_METHOD.PIX) return null;
  if (
    order.status === ORDER_STATUS.CANCELLED ||
    order.status === ORDER_STATUS.EXPIRED
  ) {
    return null;
  }

  const pendingCharge = await prisma.orderCharge.findFirst({
    where: { orderId: order.id, status: "pending" },
    select: { id: true },
  });
  const fullyPaid =
    (Boolean(order.paidAt) || order.status === ORDER_STATUS.PAID) &&
    !pendingCharge;
  if (fullyPaid) return null;

  const now = new Date();
  if (
    order.paymentToken &&
    (!order.paymentTokenExpiresAt || order.paymentTokenExpiresAt > now)
  ) {
    return {
      token: order.paymentToken,
      paymentUrl: buildPaymentPageUrl(order.paymentToken),
      paymentPath: buildPaymentPagePath(order.paymentToken),
    };
  }

  const generated = generatePaymentToken();
  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentToken: generated.token,
      paymentTokenExpiresAt: generated.expiresAt,
    },
  });

  return {
    token: generated.token,
    paymentUrl: buildPaymentPageUrl(generated.token),
    paymentPath: buildPaymentPagePath(generated.token),
  };
}

export async function validatePaymentToken(token: string): Promise<
  | {
      ok: true;
      orderId: string;
      paid: boolean;
    }
  | { ok: false; error: string }
> {
  const order = await prisma.order.findFirst({
    where: {
      paymentToken: token,
      orderSource: { in: [OrderSource.ADMIN_SALE, OrderSource.CHECKOUT] },
    },
    select: {
      id: true,
      orderSource: true,
      status: true,
      paidAt: true,
      expiresAt: true,
      paymentMethod: true,
      paymentTokenExpiresAt: true,
    },
  });

  if (!order) {
    return { ok: false, error: "Link inválido ou expirado." };
  }

  if (
    order.paymentTokenExpiresAt &&
    order.paymentTokenExpiresAt < new Date()
  ) {
    return { ok: false, error: "Este link expirou. Solicite um novo ao vendedor." };
  }

  if (
    !isCheckoutPaymentLinkWithinDeadline({
      orderSource: order.orderSource,
      expiresAt: order.expiresAt,
    })
  ) {
    return { ok: false, error: "Este pedido expirou." };
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    return { ok: false, error: "Esta venda foi cancelada." };
  }

  if (order.paymentMethod !== PAYMENT_METHOD.PIX) {
    return { ok: false, error: "Este link não é de pagamento Pix." };
  }

  const pendingCharge = await prisma.orderCharge.findFirst({
    where: { orderId: order.id, status: "pending" },
    select: { id: true },
  });
  const paid =
    (order.status === ORDER_STATUS.PAID || Boolean(order.paidAt)) &&
    !pendingCharge;

  return { ok: true, orderId: order.id, paid };
}
