import { prisma } from "@/lib/prisma";
import { cancelOrderLabel } from "@/lib/shipping/generate-order-label";
import { ShippingQuoteError } from "@/lib/shipping/types";

export type CancelOrderResult = {
  orderId: string;
  labelCancelled: boolean;
};

export async function cancelOrder(
  orderId: string,
  reason: string
): Promise<CancelOrderResult> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Informe o motivo do cancelamento.",
      400
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      superfreteShipmentId: true,
      labelUrl: true,
    },
  });

  if (!order) {
    throw new ShippingQuoteError("VALIDATION", "Pedido não encontrado.", 404);
  }

  if (order.status === "cancelled") {
    throw new ShippingQuoteError("VALIDATION", "Pedido já está cancelado.", 400);
  }

  let labelCancelled = false;

  if (order.superfreteShipmentId) {
    await cancelOrderLabel(orderId, trimmedReason);
    labelCancelled = true;
  } else if (order.labelUrl) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        labelUrl: null,
        labelGeneratedAt: null,
        trackingCode: null,
        superfreteStatus: null,
        shippingStatus: "cancelled",
      },
    });
    labelCancelled = true;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "cancelled",
      shippingStatus: "cancelled",
    },
  });

  await prisma.$executeRawUnsafe(
    `UPDATE "Order" SET
      "cancellationReason" = ?,
      "cancelledAt" = datetime('now'),
      "updatedAt" = datetime('now')
    WHERE id = ?`,
    trimmedReason,
    orderId
  );

  return { orderId, labelCancelled };
}
