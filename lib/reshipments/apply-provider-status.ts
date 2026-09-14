import { prisma } from "@/lib/prisma";

export async function resolveReshipmentIdByShipmentId(shipmentId: string) {
  const row = await prisma.orderReshipment.findFirst({
    where: { superfreteShipmentId: shipmentId },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function applyReshipmentProviderUpdate(input: {
  reshipmentId: string;
  labelCancelled: boolean;
  superfreteStatus?: string;
  tracking?: string;
  shippingStatus: string;
  tagUrl?: string;
}) {
  await prisma.orderReshipment.update({
    where: { id: input.reshipmentId },
    data: input.labelCancelled
      ? {
          superfreteStatus: "cancelled",
          shippingStatus: "cancelled",
          superfreteShipmentId: null,
          labelUrl: null,
          trackingCode: null,
          labelGeneratedAt: null,
        }
      : {
          superfreteStatus: input.superfreteStatus || undefined,
          ...(input.tracking ? { trackingCode: input.tracking } : {}),
          shippingStatus: input.shippingStatus,
          status:
            input.shippingStatus === "delivered"
              ? "DELIVERED"
              : input.shippingStatus === "shipped"
                ? "SHIPPED"
                : undefined,
          ...(input.tagUrl
            ? { labelUrl: input.tagUrl, labelGeneratedAt: new Date() }
            : {}),
        },
  });
}
