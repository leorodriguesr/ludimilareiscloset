import type { OrderReshipmentStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ReshipmentError } from "@/lib/reshipments/constants";
import { appendReshipmentEvent } from "@/lib/reshipments/events";

const PACKING_STATUSES = ["to_pack", "packed", "shipped", "delivered"] as const;

type PackingStatus = (typeof PACKING_STATUSES)[number];

function enumFromPacking(status: PackingStatus): OrderReshipmentStatus {
  if (status === "packed") return "PACKED";
  if (status === "shipped") return "SHIPPED";
  if (status === "delivered") return "DELIVERED";
  return "TO_PACK";
}

function eventFromPacking(status: PackingStatus) {
  if (status === "packed") return "PACKED" as const;
  if (status === "shipped") return "SHIPPED" as const;
  if (status === "delivered") return "DELIVERED" as const;
  return null;
}

export async function updateReshipmentPacking(input: {
  reshipmentId: string;
  shippingStatus: PackingStatus;
  actorUserId?: string | null;
}) {
  const row = await prisma.orderReshipment.findUnique({
    where: { id: input.reshipmentId },
  });
  if (!row) return null;
  if (row.status === "CANCELLED") {
    throw new ReshipmentError("CANCELLED", "Reenvio cancelado.");
  }

  const now = new Date();
  const nextStatus = enumFromPacking(input.shippingStatus);
  const eventType = eventFromPacking(input.shippingStatus);

  await prisma.$transaction(async (tx) => {
    await tx.orderReshipment.update({
      where: { id: row.id },
      data: {
        shippingStatus: input.shippingStatus,
        status: nextStatus,
        packedAt:
          input.shippingStatus === "packed" ? now : row.packedAt,
        shippedAt:
          input.shippingStatus === "shipped" || input.shippingStatus === "delivered"
            ? row.shippedAt ?? now
            : row.shippedAt,
        deliveredAt:
          input.shippingStatus === "delivered" ? now : row.deliveredAt,
      },
    });
    if (eventType) {
      await appendReshipmentEvent(tx, {
        reshipmentId: row.id,
        type: eventType,
        actorUserId: input.actorUserId ?? null,
      });
    }
  });

  return row.id;
}
