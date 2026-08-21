import { continueChargePayment } from "@/lib/orders/continue-charge-payment";
import { continueOrderPayment } from "@/lib/orders/continue-order-payment";
import {
  ORDER_CHARGE_STATUS,
  ORDER_STATUS,
  type PaymentMethod,
} from "@/lib/orders/constants";
import { reactivateUnpaidCancelledOrder } from "@/lib/orders/reactivate-cancelled-order";
import { prisma } from "@/lib/prisma";
import type { ContinueOrderPaymentResult } from "@/lib/orders/continue-order-payment";

export async function continueAdminSalePayment(input: {
  orderId: string;
  userId: string;
  forceNewLink?: boolean;
  /** Reabre venda cancelada/expirada não paga e renova as 24h. */
  reactivateCancelled?: boolean;
  paymentMethod?: PaymentMethod;
}): Promise<ContinueOrderPaymentResult> {
  if (input.reactivateCancelled) {
    const reopened = await reactivateUnpaidCancelledOrder({
      orderId: input.orderId,
      paymentMethod: input.paymentMethod,
    });
    if (!reopened.ok) {
      return reopened;
    }
  } else if (input.paymentMethod) {
    await prisma.order.update({
      where: { id: input.orderId },
      data: { paymentMethod: input.paymentMethod },
    });
  }

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      status: true,
      orderSource: true,
      paidAt: true,
    },
  });

  if (!order) {
    return { ok: false, error: "Pedido não encontrado.", code: "not_found" };
  }

  const pendingCharge = await prisma.orderCharge.findFirst({
    where: { orderId: order.id, status: ORDER_CHARGE_STATUS.PENDING },
    select: { id: true, reason: true },
    orderBy: { sequence: "desc" },
  });

  if (order.status === ORDER_STATUS.PAID && pendingCharge) {
    return continueChargePayment({
      orderId: order.id,
      forceNewLink: input.forceNewLink,
    });
  }

  if (
    order.status === ORDER_STATUS.PENDING_PAYMENT &&
    pendingCharge
  ) {
    return continueChargePayment({
      orderId: order.id,
      forceNewLink: input.forceNewLink,
    });
  }

  return continueOrderPayment({
    orderId: order.id,
    userId: input.userId,
    userEmail: "",
    staffBypass: true,
    forceNewLink: input.forceNewLink,
  });
}
