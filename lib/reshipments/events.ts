import type { OrderReshipmentEventType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type EventTx = Pick<typeof prisma, "orderReshipmentEvent">;

export async function appendReshipmentEvent(
  tx: EventTx,
  input: {
    reshipmentId: string;
    type: OrderReshipmentEventType;
    actorUserId?: string | null;
    payload?: Record<string, unknown> | null;
  }
): Promise<void> {
  await tx.orderReshipmentEvent.create({
    data: {
      reshipmentId: input.reshipmentId,
      type: input.type,
      actorUserId: input.actorUserId ?? null,
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
    },
  });
}
