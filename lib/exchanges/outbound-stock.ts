import { ExchangeStatus, StockType } from "@/app/generated/prisma/client";
import { ExchangeError } from "@/lib/exchanges/constants";
import { appendExchangeEvent } from "@/lib/exchanges/events";
import { getAvailableStock } from "@/lib/orders/stock/availability";
import type { Prisma } from "@/app/generated/prisma/client";

type StockTx = Prisma.TransactionClient;

export type ExchangeOutboundStockLine = {
  productId: string;
  pieceVariantId: string | null;
  quantity: number;
};

function mergeStockLines(
  lines: ExchangeOutboundStockLine[]
): ExchangeOutboundStockLine[] {
  const merged = new Map<string, ExchangeOutboundStockLine>();
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const key = `${line.productId}:${line.pieceVariantId ?? ""}`;
    const current = merged.get(key);
    if (current) {
      current.quantity += line.quantity;
    } else {
      merged.set(key, { ...line });
    }
  }
  return [...merged.values()];
}

async function syncProductStockQuantityFromVariants(
  tx: StockTx,
  productId: string
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: {
      stockType: true,
      pieces: {
        select: {
          variants: { select: { quantity: true } },
        },
      },
    },
  });

  if (!product || product.stockType !== StockType.LIMITED) return;

  const hasVariants = product.pieces.some((p) => p.variants.length > 0);
  if (!hasVariants) return;

  const sum = product.pieces.reduce(
    (acc, p) => acc + p.variants.reduce((a, v) => a + v.quantity, 0),
    0
  );

  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: sum },
  });
}

async function debitPhysicalStockOrThrow(
  tx: StockTx,
  lines: ExchangeOutboundStockLine[]
): Promise<void> {
  const productIds = new Set<string>();

  for (const line of lines) {
    if (line.quantity <= 0) continue;
    productIds.add(line.productId);

    if (line.pieceVariantId) {
      const updated = await tx.$executeRawUnsafe(
        `UPDATE "PieceVariant"
         SET "quantity" = "quantity" - ?
         WHERE "id" = ? AND "quantity" >= ?`,
        line.quantity,
        line.pieceVariantId,
        line.quantity
      );
      if (Number(updated) < 1) {
        throw new ExchangeError(
          "INSUFFICIENT_STOCK",
          "Estoque insuficiente para o envio da troca."
        );
      }
    } else {
      const updated = await tx.$executeRawUnsafe(
        `UPDATE "Product"
         SET "stockQuantity" = COALESCE("stockQuantity", 0) - ?,
             "updatedAt" = datetime('now')
         WHERE "id" = ? AND "stockType" = ? AND COALESCE("stockQuantity", 0) >= ?`,
        line.quantity,
        line.productId,
        StockType.LIMITED,
        line.quantity
      );
      if (Number(updated) < 1) {
        throw new ExchangeError(
          "INSUFFICIENT_STOCK",
          "Estoque insuficiente para o envio da troca."
        );
      }
    }
  }

  for (const productId of productIds) {
    await syncProductStockQuantityFromVariants(tx, productId);
  }
}

export async function releaseExchangeStockReservations(
  tx: StockTx,
  exchangeId: string
): Promise<void> {
  await tx.stockReservation.deleteMany({
    where: { exchangeId },
  });
}

export async function reserveExchangeOutboundStock(
  tx: StockTx,
  input: {
    exchangeId: string;
    orderId: string;
    actorUserId?: string | null;
    lines: ExchangeOutboundStockLine[];
  }
): Promise<void> {
  const lines = mergeStockLines(input.lines);
  if (lines.length === 0) return;

  // A primeira escrita serializa reservas concorrentes no SQLite/Turso.
  await tx.stockReservation.deleteMany({
    where: { exchangeId: input.exchangeId },
  });

  for (const line of lines) {
    const available = await getAvailableStock(tx, {
      productId: line.productId,
      pieceVariantId: line.pieceVariantId,
      excludeOrderId: null,
      excludeExchangeId: input.exchangeId,
    });
    if (available < line.quantity) {
      throw new ExchangeError(
        "INSUFFICIENT_STOCK",
        "Estoque insuficiente para reservar o envio da troca."
      );
    }
  }

  await tx.stockReservation.createMany({
    data: lines.map((line) => ({
      orderId: input.orderId,
      exchangeId: input.exchangeId,
      productId: line.productId,
      pieceVariantId: line.pieceVariantId,
      quantity: line.quantity,
    })),
  });

  await appendExchangeEvent(tx, {
    exchangeId: input.exchangeId,
    type: "STOCK_RESERVED",
    actorUserId: input.actorUserId ?? undefined,
    payload: { reserved: true, lines: lines.length },
  });
}

export async function commitExchangeOutboundStock(
  tx: StockTx,
  input: {
    exchangeId: string;
    actorUserId?: string | null;
  }
): Promise<void> {
  const exchange = await tx.exchange.findUnique({
    where: { id: input.exchangeId },
    include: {
      items: {
        where: { direction: "OUTBOUND" },
        select: {
          id: true,
          productId: true,
          pieceVariantId: true,
          quantity: true,
          stockDebited: true,
        },
      },
    },
  });
  if (!exchange) return;
  if (exchange.status === ExchangeStatus.CANCELLED) return;

  const reservations = await tx.stockReservation.findMany({
    where: { exchangeId: exchange.id },
    select: {
      productId: true,
      pieceVariantId: true,
      quantity: true,
    },
  });

  const pendingItems = exchange.items.filter(
    (item) => item.productId && !item.stockDebited
  );

  if (reservations.length === 0 && pendingItems.length === 0) return;

  const lines: ExchangeOutboundStockLine[] =
    reservations.length > 0
      ? reservations
      : pendingItems.map((item) => ({
          productId: item.productId!,
          pieceVariantId: item.pieceVariantId,
          quantity: item.quantity,
        }));

  await debitPhysicalStockOrThrow(tx, lines);
  await releaseExchangeStockReservations(tx, exchange.id);

  const pendingIds = pendingItems.map((item) => item.id);
  if (pendingIds.length > 0) {
    await tx.exchangeItem.updateMany({
      where: { id: { in: pendingIds } },
      data: { stockDebited: true },
    });
  }

  await appendExchangeEvent(tx, {
    exchangeId: exchange.id,
    type: "STOCK_DEBITED",
    actorUserId: input.actorUserId ?? undefined,
    payload: { committed: true, lines: lines.length },
  });
}
