import type { ExchangeEventType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type EventTx = Pick<typeof prisma, "exchangeEvent">;

export async function appendExchangeEvent(
  tx: EventTx,
  input: {
    exchangeId: string;
    type: ExchangeEventType;
    actorUserId?: string | null;
    payload?: Record<string, unknown> | null;
  }
): Promise<void> {
  await tx.exchangeEvent.create({
    data: {
      exchangeId: input.exchangeId,
      type: input.type,
      actorUserId: input.actorUserId ?? null,
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
    },
  });
}
