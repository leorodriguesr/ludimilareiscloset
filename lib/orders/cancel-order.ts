import { CashLedgerKind } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { cancelOrderLabel } from "@/lib/shipping/generate-order-label";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { parsePieceSelections } from "@/lib/exchanges/serialize";
import { ORDER_ITEM_PAYMENT_STATUS, ORDER_STATUS } from "@/lib/orders/constants";
import { releaseStockReservations } from "@/lib/orders/stock/reservation";
import { restoreCommittedStock } from "@/lib/orders/stock/restore";
import { buildStockDemands } from "@/lib/orders/stock/build-demands";
import { appendCashLedgerEntry } from "@/lib/cash/ledger";

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
      paidAt: true,
      paidTotal: true,
      total: true,
      orderNumber: true,
      superfreteShipmentId: true,
      labelUrl: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          price: true,
          paymentStatus: true,
          pieceSelectionsJson: true,
        },
      },
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

  const wasPaid =
    order.status === ORDER_STATUS.PAID || Boolean(order.paidAt);

  await prisma.$transaction(async (tx) => {
    await releaseStockReservations(tx, orderId);

    if (wasPaid) {
      const paidCatalogLines = order.items
        .filter(
          (item): item is typeof item & { productId: string } =>
            Boolean(item.productId) &&
            item.paymentStatus === ORDER_ITEM_PAYMENT_STATUS.PAID
        )
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          pieceSelections: parsePieceSelections(item.pieceSelectionsJson),
        }));

      if (paidCatalogLines.length > 0) {
        const demands = await buildStockDemands(paidCatalogLines, tx);
        await restoreCommittedStock(tx, demands);
      }

      const refundAmount = order.paidTotal > 0 ? order.paidTotal : order.total;
      await appendCashLedgerEntry(tx, {
        direction: "OUT",
        kind: CashLedgerKind.MANUAL,
        amount: refundAmount,
        description: `Cancelamento · pedido #${order.orderNumber ?? order.id.slice(0, 8)}`,
        orderId: order.id,
      });
    }

    await tx.orderCharge.updateMany({
      where: { orderId, status: "pending" },
      data: { status: "cancelled" },
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "cancelled",
        shippingStatus: "cancelled",
      },
    });
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
