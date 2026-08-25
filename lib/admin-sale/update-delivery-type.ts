import {
  FulfillmentType,
  OrderSource,
} from "@/app/generated/prisma/client";
import {
  ARRANGED_DELIVERY_LABELS,
  arrangedDeliveryLabel,
  splitArrangedDeliveryNotes,
  type ArrangedDeliveryMode,
} from "@/lib/admin-sale/arranged-delivery";
import { continueAdminSalePayment } from "@/lib/admin-sale/continue-admin-sale-payment";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS } from "@/lib/orders/constants";
import { ShippingQuoteError } from "@/lib/shipping/types";

const ARRANGED_MODES = new Set<string>(Object.keys(ARRANGED_DELIVERY_LABELS));

export function parseArrangedModeInput(value: unknown): ArrangedDeliveryMode {
  if (typeof value !== "string" || !ARRANGED_MODES.has(value)) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Tipo de entrega inválido.",
      400
    );
  }
  return value as ArrangedDeliveryMode;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function updateAdminSaleArrangedDelivery(input: {
  orderId: string;
  arrangedMode: ArrangedDeliveryMode;
  actorUserId?: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      orderSource: true,
      status: true,
      fulfillmentType: true,
      labelUrl: true,
      superfreteShipmentId: true,
      shippingStatus: true,
      shippingAmount: true,
      total: true,
      deliveryNotes: true,
    },
  });

  if (!order) {
    throw new ShippingQuoteError("VALIDATION", "Pedido não encontrado.", 404);
  }

  if (order.orderSource !== OrderSource.ADMIN_SALE) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Só é possível alterar o tipo de entrega em venda avulsa.",
      400
    );
  }

  if (order.status === "cancelled" || order.status === "expired") {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Não é possível alterar o tipo de entrega desta venda.",
      400
    );
  }

  if (order.labelUrl || order.superfreteShipmentId) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Não é possível alterar o tipo de entrega após gerar a etiqueta. Cancele a etiqueta primeiro.",
      400
    );
  }

  if (
    order.shippingStatus === "shipped" ||
    order.shippingStatus === "delivered"
  ) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Não é possível alterar o tipo de entrega de um pedido já enviado.",
      400
    );
  }

  const nextShippingAmount = 0;
  const nextTotal = round2(order.total - order.shippingAmount + nextShippingAmount);
  const userNotes = splitArrangedDeliveryNotes(order.deliveryNotes).userNotes;
  const shippingServiceName = arrangedDeliveryLabel(input.arrangedMode);

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      fulfillmentType: FulfillmentType.ARRANGED,
      shippingServiceName,
      shippingServiceId: null,
      shippingProvider: null,
      shippingQuotedPrice: null,
      shippingDeliveryDaysMin: null,
      shippingDeliveryDaysMax: null,
      shippingQuotePackagesJson: null,
      shippingAmount: nextShippingAmount,
      total: nextTotal,
      deliveryNotes: userNotes,
    },
    select: {
      fulfillmentType: true,
      shippingServiceName: true,
      shippingAmount: true,
      total: true,
      deliveryNotes: true,
    },
  });

  if (order.status === ORDER_STATUS.PENDING_PAYMENT && input.actorUserId) {
    await continueAdminSalePayment({
      orderId: order.id,
      userId: input.actorUserId,
      forceNewLink: true,
    });
  }

  return updated;
}
