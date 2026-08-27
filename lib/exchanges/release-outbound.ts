import {
  ExchangeBalanceStatus,
  ExchangeStatus,
  type Prisma,
} from "@/app/generated/prisma/client";
import { appendExchangeEvent } from "@/lib/exchanges/events";

/** Libera reenvio depois da conferência, se a cliente não tiver valor pendente. */
export async function maybeReleaseOutboundShipping(
  tx: Prisma.TransactionClient,
  exchangeId: string,
  actorUserId?: string | null
) {
  const exchange = await tx.exchange.findUnique({
    where: { id: exchangeId },
    include: {
      items: { select: { direction: true } },
    },
  });

  if (!exchange) return;
  if (!exchange.inspectedAt) return;
  if (
    exchange.status === ExchangeStatus.CANCELLED ||
    exchange.status === ExchangeStatus.COMPLETED ||
    exchange.status === ExchangeStatus.OUTBOUND
  ) {
    return;
  }
  if (exchange.balanceStatus === ExchangeBalanceStatus.PENDING) return;

  const hasOutbound = exchange.items.some((item) => item.direction === "OUTBOUND");
  if (!hasOutbound) return;
  if (exchange.status === ExchangeStatus.READY_OUTBOUND) return;

  await tx.exchange.update({
    where: { id: exchangeId },
    data: { status: ExchangeStatus.READY_OUTBOUND },
  });

  await appendExchangeEvent(tx, {
    exchangeId,
    type: "BALANCE_UPDATED",
    actorUserId: actorUserId ?? undefined,
    payload: { releasedOutbound: true },
  });
}
