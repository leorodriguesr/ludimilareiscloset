import { prisma } from "@/lib/prisma";
import {
  buildReshipCards,
  unavailableReshipUnitKeys,
} from "@/lib/reshipments/availability";
import { ACTIVE_RESHIPMENT_STATUSES } from "@/lib/reshipments/constants";

export async function loadReshipmentAvailability(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paidAt: true,
      fulfillmentType: true,
      shippingServiceName: true,
      deliveryNotes: true,
      destinationCep: true,
      recipientName: true,
      addressStreet: true,
      addressCity: true,
      addressState: true,
      items: {
        select: {
          id: true,
          productId: true,
          productName: true,
          productImageUrl: true,
          quantity: true,
          price: true,
          pieceSelectionsJson: true,
        },
      },
      reshipments: {
        where: { status: { in: [...ACTIVE_RESHIPMENT_STATUSES] } },
        select: {
          id: true,
          status: true,
          createdAt: true,
          method: true,
          items: {
            select: {
              orderItemId: true,
              quantity: true,
              pieceSelectionsJson: true,
              productName: true,
            },
          },
        },
      },
    },
  });

  if (!order) return null;

  const cards = buildReshipCards(order.items);
  const unavailableKeys = unavailableReshipUnitKeys(
    cards,
    order.reshipments.flatMap((row) =>
      row.items.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
        pieceSelectionsJson: item.pieceSelectionsJson,
      }))
    )
  );

  return { order, cards, unavailableKeys: [...unavailableKeys] };
}
