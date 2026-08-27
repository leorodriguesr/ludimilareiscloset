import {
  ExchangeShippingType,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

function mapOutboundQueueStatus(input: {
  shippingStatus: string;
  superfreteShipmentId: string | null;
}): "needs_label" | "to_pack" | "packed" | "shipped" | "delivered" | "cancelled" {
  if (input.shippingStatus === "cancelled") return "cancelled";
  if (input.shippingStatus === "delivered") return "delivered";
  if (
    input.shippingStatus === "posted" ||
    input.shippingStatus === "shipped"
  ) {
    return "shipped";
  }
  if (input.shippingStatus === "packed") return "packed";
  if (input.superfreteShipmentId || input.shippingStatus === "labeled") {
    return "to_pack";
  }
  return "needs_label";
}

export async function listExchangeOutboundShipments() {
  const rows = await prisma.exchangeShipping.findMany({
    where: {
      type: ExchangeShippingType.OUTBOUND,
      exchange: {
        status: {
          in: [ExchangeStatus.READY_OUTBOUND, ExchangeStatus.OUTBOUND],
        },
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      exchange: {
        select: {
          id: true,
          exchangeNumber: true,
          status: true,
          kind: true,
          balanceStatus: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              recipientName: true,
              email: true,
              destinationCep: true,
            },
          },
          items: {
            where: { direction: "OUTBOUND" },
            select: {
              id: true,
              productName: true,
              quantity: true,
              productImageUrl: true,
            },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    exchangeId: row.exchangeId,
    exchangeNumber: row.exchange.exchangeNumber,
    orderNumber: row.exchange.order.orderNumber,
    recipientName: row.exchange.order.recipientName,
    email: row.exchange.order.email,
    destinationCep: row.exchange.order.destinationCep,
    items: row.exchange.items,
    shippingServiceName: row.shippingServiceName,
    shippingServiceId: row.shippingServiceId,
    trackingCode: row.trackingCode,
    labelUrl: row.labelUrl,
    quotedPrice: row.quotedPrice,
    shippingStatus: row.shippingStatus,
    superfreteShipmentId: row.superfreteShipmentId,
    queueStatus: mapOutboundQueueStatus({
      shippingStatus: row.shippingStatus,
      superfreteShipmentId: row.superfreteShipmentId,
    }),
  }));
}

export async function updateExchangeOutboundPacking(input: {
  shippingId: string;
  shippingStatus: "packed" | "delivered";
}) {
  const row = await prisma.exchangeShipping.findUnique({
    where: { id: input.shippingId },
    include: { exchange: { select: { id: true, status: true } } },
  });
  if (!row || row.type !== ExchangeShippingType.OUTBOUND) return null;

  await prisma.exchangeShipping.update({
    where: { id: row.id },
    data: { shippingStatus: input.shippingStatus },
  });

  return listExchangeOutboundShipments();
}
