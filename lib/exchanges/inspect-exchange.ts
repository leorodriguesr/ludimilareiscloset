import {
  ExchangeBalanceStatus,
  ExchangeItemDisposition,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import {
  EXCHANGE_DISPOSITIONS,
  ExchangeError,
} from "@/lib/exchanges/constants";
import { appendExchangeEvent } from "@/lib/exchanges/events";
import {
  commitExchangeOutboundStock,
  reserveExchangeOutboundStock,
} from "@/lib/exchanges/outbound-stock";
import { restoreCommittedStock } from "@/lib/orders/stock/restore";
import { prisma } from "@/lib/prisma";

export type InspectReturnLine = {
  exchangeItemId: string;
  disposition: ExchangeItemDisposition;
};

export async function inspectExchange(input: {
  exchangeId: string;
  actorUserId: string;
  lines: InspectReturnLine[];
}) {
  const exchange = await prisma.exchange.findUnique({
    where: { id: input.exchangeId },
    include: { items: true },
  });

  if (!exchange) {
    throw new ExchangeError("NOT_FOUND", "Troca não encontrada.");
  }

  if (
    exchange.status !== ExchangeStatus.AWAITING_RETURN &&
    exchange.status !== ExchangeStatus.RETURN_IN_TRANSIT &&
    exchange.status !== ExchangeStatus.RECEIVED
  ) {
    throw new ExchangeError(
      "INVALID_STATUS",
      "Esta troca não pode ser conferida neste status."
    );
  }

  if (exchange.inspectedAt) {
    throw new ExchangeError(
      "ALREADY_INSPECTED",
      "Esta troca já foi conferida."
    );
  }

  const returnItems = exchange.items.filter((i) => i.direction === "RETURN");
  const outboundItems = exchange.items.filter((i) => i.direction === "OUTBOUND");

  if (input.lines.length !== returnItems.length) {
    throw new ExchangeError(
      "INSPECT_INCOMPLETE",
      "Informe o destino de todos os itens devolvidos."
    );
  }

  const dispositionById = new Map(
    input.lines.map((l) => [l.exchangeItemId, l.disposition])
  );

  for (const item of returnItems) {
    const disposition = dispositionById.get(item.id);
    if (!disposition) {
      throw new ExchangeError(
        "INSPECT_INCOMPLETE",
        `Destino não informado para ${item.productName}.`
      );
    }
    if (!EXCHANGE_DISPOSITIONS.includes(disposition)) {
      throw new ExchangeError("INVALID_DISPOSITION", "Destino inválido.");
    }
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.exchange.updateMany({
      where: {
        id: exchange.id,
        inspectedAt: null,
        status: {
          in: [
            ExchangeStatus.AWAITING_RETURN,
            ExchangeStatus.RETURN_IN_TRANSIT,
            ExchangeStatus.RECEIVED,
          ],
        },
      },
      data: {
        inspectedAt: now,
        receivedAt: exchange.receivedAt ?? now,
      },
    });
    if (claimed.count !== 1) {
      throw new ExchangeError(
        "ALREADY_INSPECTED",
        "Esta troca já foi conferida."
      );
    }

    const restoreLines: {
      productId: string;
      pieceVariantId: string | null;
      quantity: number;
    }[] = [];

    for (const item of returnItems) {
      const disposition = dispositionById.get(item.id)!;
      const shouldRestore = disposition === "RESELLABLE" && !!item.productId;

      await tx.exchangeItem.update({
        where: { id: item.id },
        data: {
          disposition,
          stockRestored: shouldRestore,
        },
      });

      if (shouldRestore && item.productId) {
        restoreLines.push({
          productId: item.productId,
          pieceVariantId: item.pieceVariantId,
          quantity: item.quantity,
        });
      }
    }

    if (restoreLines.length > 0) {
      await restoreCommittedStock(tx, restoreLines);
      await appendExchangeEvent(tx, {
        exchangeId: exchange.id,
        type: "STOCK_RESTORED",
        actorUserId: input.actorUserId,
        payload: { lines: restoreLines.length },
      });
    }

    const balanceOpen =
      exchange.balanceStatus === ExchangeBalanceStatus.PENDING ||
      exchange.balanceStatus === ExchangeBalanceStatus.CREDIT_PENDING;

    const customerOwes =
      exchange.balanceStatus === ExchangeBalanceStatus.PENDING;

    const stockLines = outboundItems
      .filter((item) => item.productId && !item.stockDebited)
      .map((item) => ({
        productId: item.productId!,
        pieceVariantId: item.pieceVariantId,
        quantity: item.quantity,
      }));

    if (stockLines.length > 0) {
      if (customerOwes) {
        await reserveExchangeOutboundStock(tx, {
          exchangeId: exchange.id,
          orderId: exchange.orderId,
          actorUserId: input.actorUserId,
          lines: stockLines,
        });
      } else {
        await commitExchangeOutboundStock(tx, {
          exchangeId: exchange.id,
          actorUserId: input.actorUserId,
        });
      }
    }
    const nextStatus =
      exchange.kind === "EXCHANGE" && outboundItems.length === 0
        ? ExchangeStatus.RECEIVED
        : outboundItems.length > 0
          ? customerOwes
            ? ExchangeStatus.RECEIVED
            : ExchangeStatus.READY_OUTBOUND
          : balanceOpen
            ? ExchangeStatus.RECEIVED
            : ExchangeStatus.COMPLETED;

    const updated = await tx.exchange.update({
      where: { id: exchange.id },
      data: {
        status: nextStatus,
        completedAt: nextStatus === ExchangeStatus.COMPLETED ? now : null,
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
      type: "RECEIVED",
      actorUserId: input.actorUserId,
    });
    await appendExchangeEvent(tx, {
      exchangeId: exchange.id,
      type: "INSPECTED",
      actorUserId: input.actorUserId,
    });

    if (nextStatus === ExchangeStatus.COMPLETED) {
      await appendExchangeEvent(tx, {
        exchangeId: exchange.id,
        type: "COMPLETED",
        actorUserId: input.actorUserId,
      });
    }

    return updated;
  });
}
