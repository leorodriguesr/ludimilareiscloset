import {
  CustomerDataStatus,
  OrderSource,
  PaymentChannel,
} from "@/app/generated/prisma/client";
import { appendCashLedgerEntry } from "@/lib/cash/ledger";
import { onOrderPaymentConfirmed } from "@/lib/fulfillment/fulfillment-service";
import {
  ORDER_STATUS,
  PAYMENT_ATTEMPT_STATUS,
  PAYMENT_METHOD,
  type PaymentMethod,
} from "@/lib/orders/constants";
import { commitStockReservations } from "@/lib/orders/stock/reservation";
import { prisma } from "@/lib/prisma";

function resolvePaymentMethod(
  preferred: PaymentMethod | undefined,
  current: string | null
): PaymentMethod {
  if (preferred === PAYMENT_METHOD.PIX || preferred === PAYMENT_METHOD.CARD) {
    return preferred;
  }
  if (current === PAYMENT_METHOD.CARD) return PAYMENT_METHOD.CARD;
  return PAYMENT_METHOD.PIX;
}

export async function markOrderPaidManually(input: {
  orderId: string;
  paymentMethod?: PaymentMethod;
  markedByUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      orderSource: true,
      status: true,
      paidAt: true,
      paymentMethod: true,
      fulfillmentType: true,
      customerDataStatus: true,
      recipientName: true,
      addressStreet: true,
      addressCity: true,
      addressState: true,
      destinationCep: true,
    },
  });

  if (!order) {
    return { ok: false, error: "Pedido não encontrado." };
  }
  if (order.orderSource !== OrderSource.ADMIN_SALE) {
    return { ok: false, error: "Pagamento manual só se aplica a vendas avulsas." };
  }
  if (order.status === ORDER_STATUS.PAID && order.paidAt) {
    await onOrderPaymentConfirmed(order);
    return { ok: true };
  }
  if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
    return { ok: false, error: "Este pedido não pode ser marcado como pago." };
  }

  const paymentMethod = resolvePaymentMethod(
    input.paymentMethod,
    order.paymentMethod
  );
  const paidAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: ORDER_STATUS.PAID,
        paidAt,
        shippingStatus: "to_pack",
        paymentMethod,
        paymentChannel: PaymentChannel.MANUAL,
        manualPaidByUserId: input.markedByUserId,
      },
    });
    await tx.paymentAttempt.updateMany({
      where: {
        orderId: order.id,
        status: {
          in: [PAYMENT_ATTEMPT_STATUS.ACTIVE, PAYMENT_ATTEMPT_STATUS.CREATED],
        },
      },
      data: { status: PAYMENT_ATTEMPT_STATUS.SUPERSEDED },
    });
    await commitStockReservations(tx, order.id);
    await appendCashLedgerEntry(tx, {
      direction: "IN",
      kind: "SALE",
      amount: order.total,
      description: `Venda avulsa · pedido #${order.orderNumber ?? order.id.slice(0, 8)}`,
      orderId: order.id,
      actorUserId: input.markedByUserId,
    });
  });

  await onOrderPaymentConfirmed({
    ...order,
    customerDataStatus:
      order.customerDataStatus ?? CustomerDataStatus.PENDING,
  });

  return { ok: true };
}
