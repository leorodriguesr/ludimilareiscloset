import {
  ExchangeShippingType,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalExchangeShippingMethod } from "@/lib/exchanges/shipping-method";
import {
  EXCHANGE_OUTBOUND_LIST_STATUSES,
  exchangeOutboundMatchesFilter,
  exchangeOutboundMatchesSearch,
  mapExchangeOutboundListStatus,
  resolveExchangeOutboundListPaidAt,
  sliceMergedShipmentPage,
} from "@/lib/exchanges/outbound-shipment-list";
import { SHIPPING_PROVIDERS } from "@/lib/shipping/providers";

export {
  exchangeOutboundMatchesFilter,
  exchangeOutboundMatchesSearch,
  mapExchangeOutboundListStatus,
  sliceMergedShipmentPage,
};

export type ExchangeShipmentListRow = {
  id: string;
  shipmentKind: "exchange";
  exchangeId: string;
  exchangeStatus: string;
  exchangeNumber: number | null;
  orderNumber: number | null;
  status: string;
  email: string;
  orderSource: string;
  customerDataStatus: string | null;
  fulfillmentType: string;
  shippingServiceName: string | null;
  deliveryNotes: string | null;
  internalNotes: string | null;
  shippingServiceId: number | null;
  shippingProvider: string | null;
  shippingStatus: string;
  superfreteStatus: string | null;
  trackingCode: string | null;
  recipientName: string | null;
  phone: string | null;
  destinationCep: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  superfreteShipmentId: string | null;
  labelUrl: string | null;
  labelGeneratedAt: string | null;
  labelAutoGenerateError: string | null;
  paidAt: string | null;
  createdAt: string;
  shippingQuotedPrice: number | null;
  shippingDeliveryDaysMin: number | null;
  shippingDeliveryDaysMax: number | null;
  superfreteShippingPrice: number | null;
  items: Array<{
    id: string;
    quantity: number;
    price: number;
    pieceSelectionsJson: string | null;
    productId: string | null;
    productName: string | null;
    productDescription: string | null;
    productImageUrl: string | null;
    paymentStatus: string;
    product: null;
  }>;
  sortAt: number;
};

export async function listExchangeOutboundShipments() {
  const rows = await listExchangeOutboundShipmentOrders();
  return rows.map((row) => ({
    id: row.id,
    exchangeId: row.exchangeId,
    exchangeNumber: row.exchangeNumber,
    orderNumber: row.orderNumber,
    recipientName: row.recipientName,
    email: row.email,
    destinationCep: row.destinationCep,
    items: row.items.map((item) => ({
      id: item.id,
      productName: item.productName ?? "",
      quantity: item.quantity,
    })),
    shippingServiceName: row.shippingServiceName,
    shippingServiceId: row.shippingServiceId,
    trackingCode: row.trackingCode,
    labelUrl: row.labelUrl,
    quotedPrice: row.shippingQuotedPrice,
    shippingStatus: row.shippingStatus,
    superfreteShipmentId: row.superfreteShipmentId,
    queueStatus: mapExchangeOutboundListStatus(row.shippingStatus),
  }));
}

export async function listExchangeOutboundShipmentOrders(): Promise<
  ExchangeShipmentListRow[]
> {
  const rows = await prisma.exchangeShipping.findMany({
    where: {
      type: ExchangeShippingType.OUTBOUND,
      exchange: {
        status: {
          in: EXCHANGE_OUTBOUND_LIST_STATUSES,
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
          balancePaidAt: true,
          outboundDefinedAt: true,
          inspectedAt: true,
          createdAt: true,
          notes: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              recipientName: true,
              email: true,
              phone: true,
              destinationCep: true,
              addressStreet: true,
              addressNumber: true,
              addressComplement: true,
              addressNeighborhood: true,
              addressCity: true,
              addressState: true,
              deliveryNotes: true,
              internalNotes: true,
            },
          },
          items: {
            where: { direction: "OUTBOUND" },
            select: {
              id: true,
              productId: true,
              productName: true,
              quantity: true,
              unitPrice: true,
              productImageUrl: true,
              pieceSelectionsJson: true,
            },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const local = isLocalExchangeShippingMethod(row.method);
    const listStatus = mapExchangeOutboundListStatus(row.shippingStatus);
    const paidAt = resolveExchangeOutboundListPaidAt({
      balancePaidAt: row.exchange.balancePaidAt,
      outboundDefinedAt: row.exchange.outboundDefinedAt,
      inspectedAt: row.exchange.inspectedAt,
      createdAt: row.createdAt,
    });
    return {
      id: row.id,
      shipmentKind: "exchange" as const,
      exchangeId: row.exchangeId,
      exchangeStatus: row.exchange.status,
      exchangeNumber: row.exchange.exchangeNumber,
      orderNumber: row.exchange.exchangeNumber,
      status: "paid",
      email: row.exchange.order.email ?? "",
      orderSource: "EXCHANGE",
      customerDataStatus: null,
      fulfillmentType: local ? "ARRANGED" : "CARRIER",
      shippingServiceName: row.shippingServiceName,
      deliveryNotes: row.exchange.order.deliveryNotes,
      internalNotes: row.exchange.notes ?? row.exchange.order.internalNotes,
      shippingServiceId: row.shippingServiceId,
      shippingProvider: local ? null : SHIPPING_PROVIDERS.MELHOR_ENVIO,
      shippingStatus: listStatus,
      superfreteStatus: row.superfreteStatus,
      trackingCode: row.trackingCode,
      recipientName: row.exchange.order.recipientName,
      phone: row.exchange.order.phone,
      destinationCep: row.exchange.order.destinationCep,
      addressStreet: row.exchange.order.addressStreet,
      addressNumber: row.exchange.order.addressNumber,
      addressComplement: row.exchange.order.addressComplement,
      addressNeighborhood: row.exchange.order.addressNeighborhood,
      addressCity: row.exchange.order.addressCity,
      addressState: row.exchange.order.addressState,
      superfreteShipmentId: row.superfreteShipmentId,
      labelUrl: row.labelUrl,
      labelGeneratedAt: row.labelGeneratedAt?.toISOString() ?? null,
      labelAutoGenerateError: null,
      paidAt: paidAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      shippingQuotedPrice: row.quotedPrice,
      shippingDeliveryDaysMin: null,
      shippingDeliveryDaysMax: null,
      superfreteShippingPrice: row.cost,
      items: row.exchange.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: item.unitPrice,
        pieceSelectionsJson: item.pieceSelectionsJson,
        productId: item.productId,
        productName: item.productName,
        productDescription: null,
        productImageUrl: item.productImageUrl,
        paymentStatus: "paid",
        product: null,
      })),
      sortAt: paidAt.getTime(),
    };
  });
}

export async function updateExchangeOutboundPacking(input: {
  shippingId: string;
  shippingStatus: "to_pack" | "packed" | "shipped" | "delivered";
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
