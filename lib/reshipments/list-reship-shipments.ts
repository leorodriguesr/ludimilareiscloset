import { prisma } from "@/lib/prisma";
import { isLocalExchangeShippingMethod } from "@/lib/exchanges/shipping-method";
import {
  exchangeOutboundMatchesFilter,
  exchangeOutboundMatchesSearch,
  mapExchangeOutboundListStatus,
} from "@/lib/exchanges/outbound-shipment-list";
import { SHIPPING_PROVIDERS } from "@/lib/shipping/providers";
import { ACTIVE_RESHIPMENT_STATUSES } from "@/lib/reshipments/constants";

export {
  exchangeOutboundMatchesFilter as reshipmentMatchesFilter,
  mapExchangeOutboundListStatus,
};

export type ReshipmentShipmentListRow = {
  id: string;
  shipmentKind: "reship";
  exchangeId?: undefined;
  exchangeNumber?: null;
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
  reshipmentStatus: string;
};

export function reshipmentMatchesSearch(
  row: {
    orderNumber: number | null;
    recipientName: string | null;
    email: string | null;
    trackingCode: string | null;
  },
  query: string
): boolean {
  return exchangeOutboundMatchesSearch(
    {
      exchangeNumber: row.orderNumber,
      recipientName: row.recipientName,
      email: row.email,
      trackingCode: row.trackingCode,
    },
    query
  ) || query.trim().toLowerCase().includes("reenvio")
    || "reenvio".includes(query.trim().toLowerCase());
}

export async function listReshipmentShipmentOrders(): Promise<
  ReshipmentShipmentListRow[]
> {
  const rows = await prisma.orderReshipment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          email: true,
          deliveryNotes: true,
          internalNotes: true,
        },
      },
    },
  });

  return rows.map((row) => {
    const local = isLocalExchangeShippingMethod(row.method);
    const listStatus = mapExchangeOutboundListStatus(row.shippingStatus);
    const sortAt = row.createdAt.getTime();
    return {
      id: row.id,
      shipmentKind: "reship" as const,
      exchangeNumber: null,
      orderNumber: row.order.orderNumber,
      status: "paid",
      email: row.email ?? row.order.email ?? "",
      orderSource: "RESHIPMENT",
      customerDataStatus: null,
      fulfillmentType: local ? "ARRANGED" : "CARRIER",
      shippingServiceName: row.shippingServiceName,
      deliveryNotes: row.order.deliveryNotes,
      internalNotes: row.notes ?? row.order.internalNotes,
      shippingServiceId: row.shippingServiceId,
      shippingProvider: local ? null : SHIPPING_PROVIDERS.MELHOR_ENVIO,
      shippingStatus: listStatus,
      superfreteStatus: row.superfreteStatus,
      trackingCode: row.trackingCode,
      recipientName: row.recipientName,
      phone: row.phone,
      destinationCep: row.destinationCep,
      addressStreet: row.addressStreet,
      addressNumber: row.addressNumber,
      addressComplement: row.addressComplement,
      addressNeighborhood: row.addressNeighborhood,
      addressCity: row.addressCity,
      addressState: row.addressState,
      superfreteShipmentId: row.superfreteShipmentId,
      labelUrl: row.labelUrl,
      labelGeneratedAt: row.labelGeneratedAt?.toISOString() ?? null,
      labelAutoGenerateError: null,
      paidAt: row.createdAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      shippingQuotedPrice: row.quotedPrice,
      shippingDeliveryDaysMin: null,
      shippingDeliveryDaysMax: null,
      superfreteShippingPrice: row.cost,
      items: row.items.map((item) => ({
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
      sortAt,
      reshipmentStatus: row.status,
    };
  });
}

export function reshipmentIsActiveInAllTotal(status: string): boolean {
  return (ACTIVE_RESHIPMENT_STATUSES as readonly string[]).includes(status);
}
