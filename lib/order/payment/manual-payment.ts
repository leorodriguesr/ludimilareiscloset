import {
  CustomerDataStatus,
  OrderSource,
  PaymentChannel,
} from "@/app/generated/prisma/client";
import { onOrderPaymentConfirmed } from "@/lib/fulfillment/fulfillment-service";
import { ORDER_STATUS } from "@/lib/orders/constants";
import { commitStockReservations } from "@/lib/orders/stock/reservation";
import { prisma } from "@/lib/prisma";
import type { PaymentMethod } from "@/lib/orders/constants";

export async function markOrderPaidManually(input: {
  orderId: string;
  paymentMethod: PaymentMethod;
  markedByUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      orderSource: true,
      status: true,
      paidAt: true,
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

  const paidAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: ORDER_STATUS.PAID,
        paidAt,
        shippingStatus: "to_pack",
        paymentMethod: input.paymentMethod,
        paymentChannel: PaymentChannel.MANUAL,
        manualPaidByUserId: input.markedByUserId,
      },
    });
    await commitStockReservations(tx, order.id);
  });

  await onOrderPaymentConfirmed({
    ...order,
    customerDataStatus:
      order.customerDataStatus ?? CustomerDataStatus.PENDING,
  });

  return { ok: true };
}
