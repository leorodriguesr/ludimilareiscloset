import {
  ExchangeBalanceStatus,
  ExchangeEventType,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import { appendCashLedgerEntry } from "@/lib/cash/ledger";
import { ExchangeError } from "@/lib/exchanges/constants";
import { appendExchangeEvent } from "@/lib/exchanges/events";
import { prisma } from "@/lib/prisma";

export async function settleExchangeBalance(input: {
  exchangeId: string;
  actorUserId: string;
  action: "mark_paid" | "waive" | "mark_credit_settled";
  notes?: string | null;
  /** Quando veio de webhook/pagamento online. */
  paymentAttemptId?: string | null;
  skipLedger?: boolean;
}) {
  const exchange = await prisma.exchange.findUnique({
    where: { id: input.exchangeId },
  });

  if (!exchange) {
    throw new ExchangeError("NOT_FOUND", "Troca não encontrada.");
  }

  if (exchange.status === ExchangeStatus.CANCELLED) {
    throw new ExchangeError("CANCELLED", "Troca cancelada.");
  }

  const now = new Date();
  let balanceStatus: ExchangeBalanceStatus = exchange.balanceStatus;
  let eventType: ExchangeEventType = ExchangeEventType.BALANCE_UPDATED;

  if (input.action === "mark_paid") {
    if (exchange.balanceAmount <= 0) {
      throw new ExchangeError(
        "NO_AMOUNT_DUE",
        "Não há valor a cobrar nesta troca."
      );
    }
    if (
      exchange.balanceStatus === ExchangeBalanceStatus.PAID ||
      exchange.balanceStatus === ExchangeBalanceStatus.WAIVED
    ) {
      throw new ExchangeError("ALREADY_SETTLED", "Saldo já quitado.");
    }
    balanceStatus = ExchangeBalanceStatus.PAID;
    eventType = ExchangeEventType.BALANCE_PAID;
  } else if (input.action === "waive") {
    balanceStatus = ExchangeBalanceStatus.WAIVED;
    eventType = ExchangeEventType.BALANCE_WAIVED;
  } else {
    if (exchange.balanceAmount >= 0) {
      throw new ExchangeError(
        "NO_CREDIT",
        "Não há crédito pendente nesta troca."
      );
    }
    if (!exchange.inspectedAt) {
      throw new ExchangeError(
        "NOT_INSPECTED",
        "Receba e confira as peças antes de marcar o reembolso."
      );
    }
    if (exchange.balanceStatus === ExchangeBalanceStatus.SETTLED) {
      throw new ExchangeError("ALREADY_SETTLED", "Crédito já quitado.");
    }
    balanceStatus = ExchangeBalanceStatus.SETTLED;
    eventType = ExchangeEventType.BALANCE_REFUND_MARKED;
  }

  const label = `Troca #${exchange.exchangeNumber ?? exchange.id.slice(0, 6)}`;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.exchange.update({
      where: { id: exchange.id },
      data: {
        balanceStatus,
        balancePaidAt: now,
        balancePaidByUserId: input.actorUserId,
        balanceNotes: input.notes?.trim() || exchange.balanceNotes,
      },
      include: {
        items: true,
        shippings: true,
        events: { orderBy: { createdAt: "asc" } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            recipientName: true,
            email: true,
          },
        },
      },
    });

    await appendExchangeEvent(tx, {
      exchangeId: exchange.id,
      type: eventType,
      actorUserId: input.actorUserId,
      payload: { action: input.action, balanceAmount: exchange.balanceAmount },
    });

    if (!input.skipLedger) {
      if (input.action === "mark_paid") {
        await appendCashLedgerEntry(tx, {
          direction: "IN",
          kind: "EXCHANGE_BALANCE",
          amount: exchange.balanceAmount,
          description: `Diferença recebida · ${label}`,
          orderId: exchange.orderId,
          exchangeId: exchange.id,
          paymentAttemptId: input.paymentAttemptId ?? null,
          actorUserId: input.actorUserId,
        });
      } else if (input.action === "mark_credit_settled") {
        await appendCashLedgerEntry(tx, {
          direction: "OUT",
          kind: "EXCHANGE_REFUND",
          amount: Math.abs(exchange.balanceAmount),
          description: `Reembolso / crédito · ${label}`,
          orderId: exchange.orderId,
          exchangeId: exchange.id,
          actorUserId: input.actorUserId,
        });
      }
    }

    return updated;
  });
}

export async function completeExchange(input: {
  exchangeId: string;
  actorUserId: string;
}) {
  const exchange = await prisma.exchange.findUnique({
    where: { id: input.exchangeId },
    include: { items: true },
  });

  if (!exchange) {
    throw new ExchangeError("NOT_FOUND", "Troca não encontrada.");
  }

  if (
    exchange.status !== ExchangeStatus.READY_OUTBOUND &&
    exchange.status !== ExchangeStatus.OUTBOUND &&
    exchange.status !== ExchangeStatus.RECEIVED
  ) {
    throw new ExchangeError(
      "INVALID_STATUS",
      "Este registro não pode ser concluído neste status."
    );
  }

  if (
    exchange.balanceStatus === ExchangeBalanceStatus.PENDING ||
    exchange.balanceStatus === ExchangeBalanceStatus.CREDIT_PENDING
  ) {
    throw new ExchangeError(
      "BALANCE_OPEN",
      "Quite o saldo da troca antes de concluir."
    );
  }

  const hasOutbound = exchange.items.some((i) => i.direction === "OUTBOUND");
  if (hasOutbound && !exchange.inspectedAt) {
    throw new ExchangeError(
      "NOT_INSPECTED",
      "Conclua a conferência antes de finalizar."
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.exchange.update({
      where: { id: exchange.id },
      data: {
        status: ExchangeStatus.COMPLETED,
        completedAt: new Date(),
      },
      include: {
        items: true,
        shippings: true,
        events: { orderBy: { createdAt: "asc" } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            recipientName: true,
            email: true,
          },
        },
      },
    });

    await appendExchangeEvent(tx, {
      exchangeId: exchange.id,
      type: "COMPLETED",
      actorUserId: input.actorUserId,
    });

    return updated;
  });
}

export async function cancelExchange(input: {
  exchangeId: string;
  actorUserId: string;
  reason?: string | null;
}) {
  const exchange = await prisma.exchange.findUnique({
    where: { id: input.exchangeId },
  });

  if (!exchange) {
    throw new ExchangeError("NOT_FOUND", "Troca não encontrada.");
  }

  if (exchange.status === ExchangeStatus.COMPLETED) {
    throw new ExchangeError(
      "ALREADY_COMPLETED",
      "Troca concluída não pode ser cancelada."
    );
  }

  if (exchange.status === ExchangeStatus.CANCELLED) {
    throw new ExchangeError("ALREADY_CANCELLED", "Troca já cancelada.");
  }

  if (exchange.inspectedAt) {
    throw new ExchangeError(
      "ALREADY_INSPECTED",
      "Troca já conferida não pode ser cancelada por este fluxo."
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.exchange.update({
      where: { id: exchange.id },
      data: {
        status: ExchangeStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: input.reason?.trim() || null,
      },
      include: {
        items: true,
        shippings: true,
        events: { orderBy: { createdAt: "asc" } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            recipientName: true,
            email: true,
          },
        },
      },
    });

    await appendExchangeEvent(tx, {
      exchangeId: exchange.id,
      type: "CANCELLED",
      actorUserId: input.actorUserId,
      payload: { reason: input.reason ?? null },
    });

    return updated;
  });
}
