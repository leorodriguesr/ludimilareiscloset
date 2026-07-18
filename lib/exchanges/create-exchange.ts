import type {
  ExchangeKind,
  ExchangeReason,
  ExchangeShippingMethod,
  ExchangeShippingPaidBy,
  ExchangeShippingType,
} from "@/app/generated/prisma/client";
import { ExchangeStatus } from "@/app/generated/prisma/client";
import {
  exchangeShippingMethodServiceName,
  isLocalExchangeShippingMethod,
} from "@/lib/exchanges/shipping-method";
import type { CartPieceSelection } from "@/lib/cart/types";
import { computeExchangeBalance } from "@/lib/exchanges/balance";
import {
  EXCHANGE_REASONS,
  ExchangeError,
} from "@/lib/exchanges/constants";
import { appendExchangeEvent } from "@/lib/exchanges/events";
import {
  parsePieceSelections,
  serializePieceSelections,
} from "@/lib/exchanges/serialize";
import { OrderCreateError } from "@/lib/orders/create-order";
import { getAvailableStock } from "@/lib/orders/stock/availability";
import { buildStockDemands } from "@/lib/orders/stock/build-demands";
import { prisma } from "@/lib/prisma";

export type CreateExchangeReturnLine = {
  orderItemId: string;
  quantity: number;
};

export type CreateExchangeOutboundCatalogLine = {
  kind?: "catalog";
  productId: string;
  quantity: number;
  unitPrice?: number;
  pieceSelections?: CartPieceSelection[];
};

export type CreateExchangeOutboundCustomLine = {
  kind: "custom";
  description: string;
  quantity: number;
  unitPrice: number;
  pieces?: { name: string; size: string; color: string }[];
};

export type CreateExchangeOutboundLine =
  | CreateExchangeOutboundCatalogLine
  | CreateExchangeOutboundCustomLine;

export type CreateExchangeShippingInput = {
  type: ExchangeShippingType;
  method?: ExchangeShippingMethod;
  shippingServiceId?: number | null;
  shippingServiceName?: string | null;
  quotedPrice?: number | null;
  paidBy: ExchangeShippingPaidBy;
  packageHeightCm?: number | null;
  packageWidthCm?: number | null;
  packageLengthCm?: number | null;
  packageWeightKg?: number | null;
};

export type CreateExchangeInput = {
  orderId: string;
  kind?: ExchangeKind;
  reason: ExchangeReason;
  reasonNotes?: string | null;
  notes?: string | null;
  openedByUserId: string;
  returnLines: CreateExchangeReturnLine[];
  outboundLines: CreateExchangeOutboundLine[];
  shippings: CreateExchangeShippingInput[];
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function createExchange(input: CreateExchangeInput) {
  const kind: ExchangeKind = input.kind === "RETURN" ? "RETURN" : "EXCHANGE";

  if (input.returnLines.length === 0) {
    throw new ExchangeError(
      "RETURN_REQUIRED",
      "Selecione ao menos um item para devolver."
    );
  }

  if (kind === "RETURN" && input.outboundLines.length > 0) {
    throw new ExchangeError(
      "RETURN_NO_OUTBOUND",
      "Devolução não pode incluir itens de saída."
    );
  }

  if (!EXCHANGE_REASONS.includes(input.reason)) {
    throw new ExchangeError("INVALID_REASON", "Motivo da troca inválido.");
  }

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      items: true,
      exchanges: {
        where: { status: { not: ExchangeStatus.CANCELLED } },
        include: {
          items: {
            where: { direction: "RETURN" },
            select: { orderItemId: true, quantity: true },
          },
        },
      },
    },
  });

  if (!order) {
    throw new ExchangeError("ORDER_NOT_FOUND", "Pedido não encontrado.");
  }

  if (!order.paidAt || order.status !== "paid") {
    throw new ExchangeError(
      "ORDER_NOT_PAID",
      "Só é possível abrir troca em pedidos pagos."
    );
  }

  const alreadyReturnedByItem = new Map<string, number>();
  for (const ex of order.exchanges) {
    for (const item of ex.items) {
      if (!item.orderItemId) continue;
      alreadyReturnedByItem.set(
        item.orderItemId,
        (alreadyReturnedByItem.get(item.orderItemId) ?? 0) + item.quantity
      );
    }
  }

  const returnRows: {
    orderItemId: string;
    productId: string | null;
    productName: string;
    productImageUrl: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    pieceSelectionsJson: string | null;
    pieceVariantId: string | null;
  }[] = [];

  for (const line of input.returnLines) {
    const orderItem = order.items.find((i) => i.id === line.orderItemId);
    if (!orderItem) {
      throw new ExchangeError(
        "ORDER_ITEM_NOT_FOUND",
        "Item do pedido não encontrado."
      );
    }
    if (line.quantity < 1 || line.quantity > orderItem.quantity) {
      throw new ExchangeError(
        "INVALID_RETURN_QTY",
        `Quantidade inválida para ${orderItem.productName}.`
      );
    }
    const already = alreadyReturnedByItem.get(orderItem.id) ?? 0;
    if (already + line.quantity > orderItem.quantity) {
      throw new ExchangeError(
        "RETURN_EXCEEDS",
        `Quantidade de devolução excede o disponível para ${orderItem.productName}.`
      );
    }

    const unitPrice = orderItem.price;
    returnRows.push({
      orderItemId: orderItem.id,
      productId: orderItem.productId,
      productName: orderItem.productName,
      productImageUrl: orderItem.productImageUrl,
      quantity: line.quantity,
      unitPrice,
      lineTotal: roundMoney(unitPrice * line.quantity),
      pieceSelectionsJson: orderItem.pieceSelectionsJson,
      pieceVariantId: null,
    });
  }

  const outboundRows: {
    productId: string | null;
    productName: string;
    productImageUrl: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    pieceSelectionsJson: string | null;
    pieceVariantId: string | null;
  }[] = [];

  for (const line of input.outboundLines) {
    if (line.quantity < 1) {
      throw new ExchangeError("INVALID_OUTBOUND_QTY", "Quantidade inválida.");
    }

    if (line.kind === "custom") {
      const description = line.description.trim();
      if (!description) {
        throw new ExchangeError(
          "CUSTOM_DESCRIPTION_REQUIRED",
          "Informe a descrição do produto de saída."
        );
      }
      if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
        throw new ExchangeError(
          "INVALID_UNIT_PRICE",
          "Valor inválido para produto de saída."
        );
      }
      const unitPrice = roundMoney(line.unitPrice);
      const pieceSelections: CartPieceSelection[] = (line.pieces ?? [])
        .filter((p) => p.name.trim() || p.size.trim() || p.color.trim())
        .map((p) => ({
          pieceName: p.name.trim() || "Peça",
          size: p.size.trim() || null,
          color: p.color.trim() || null,
        }));

      outboundRows.push({
        productId: null,
        productName: description,
        productImageUrl: null,
        quantity: line.quantity,
        unitPrice,
        lineTotal: roundMoney(unitPrice * line.quantity),
        pieceSelectionsJson: serializePieceSelections(pieceSelections),
        pieceVariantId: null,
      });
      continue;
    }

    const product = await prisma.product.findUnique({
      where: { id: line.productId },
      select: {
        id: true,
        name: true,
        price: true,
        pixPrice: true,
        images: {
          orderBy: { order: "asc" },
          take: 1,
          select: { url: true },
        },
      },
    });

    if (!product) {
      throw new ExchangeError(
        "PRODUCT_NOT_FOUND",
        "Produto de saída não encontrado."
      );
    }

    const unitPrice =
      line.unitPrice != null && Number.isFinite(line.unitPrice)
        ? roundMoney(line.unitPrice)
        : roundMoney(product.pixPrice ?? product.price);

    outboundRows.push({
      productId: product.id,
      productName: product.name,
      productImageUrl: product.images[0]?.url ?? null,
      quantity: line.quantity,
      unitPrice,
      lineTotal: roundMoney(unitPrice * line.quantity),
      pieceSelectionsJson: serializePieceSelections(line.pieceSelections),
      pieceVariantId: null,
    });
  }

  try {
    const catalogOutbound = outboundRows.filter(
      (r): r is typeof r & { productId: string } => !!r.productId
    );

    const demands = await buildStockDemands(
      catalogOutbound.map((r) => ({
        productId: r.productId,
        quantity: r.quantity,
        price: r.unitPrice,
        pieceSelections: parsePieceSelections(r.pieceSelectionsJson),
      })),
      prisma
    );

    const now = new Date();
    for (const demand of demands) {
      const available = await getAvailableStock(prisma, {
        productId: demand.productId,
        pieceVariantId: demand.pieceVariantId,
        excludeOrderId: order.id,
        now,
      });
      if (available < demand.quantity) {
        throw new ExchangeError(
          "INSUFFICIENT_STOCK",
          "Estoque insuficiente para um dos itens de saída."
        );
      }
    }

    // Resolve first variant id per catalog outbound line for later debit.
    for (let i = 0; i < outboundRows.length; i++) {
      const row = outboundRows[i];
      if (!row.productId) continue;
      const lineDemands = await buildStockDemands(
        [
          {
            productId: row.productId,
            quantity: row.quantity,
            price: row.unitPrice,
            pieceSelections: parsePieceSelections(row.pieceSelectionsJson),
          },
        ],
        prisma
      );
      if (lineDemands.length === 1) {
        outboundRows[i] = {
          ...row,
          pieceVariantId: lineDemands[0].pieceVariantId,
        };
      }
    }

    for (let i = 0; i < returnRows.length; i++) {
      const row = returnRows[i];
      if (!row.productId) continue;
      const lineDemands = await buildStockDemands(
        [
          {
            productId: row.productId,
            quantity: row.quantity,
            price: row.unitPrice,
            pieceSelections: parsePieceSelections(row.pieceSelectionsJson),
          },
        ],
        prisma
      );
      if (lineDemands.length === 1) {
        returnRows[i] = {
          ...row,
          pieceVariantId: lineDemands[0].pieceVariantId,
        };
      }
    }
  } catch (e) {
    if (e instanceof ExchangeError) throw e;
    if (e instanceof OrderCreateError) {
      throw new ExchangeError(e.code, e.message);
    }
    throw e;
  }

  const returnedItemsTotal = roundMoney(
    returnRows.reduce((a, r) => a + r.lineTotal, 0)
  );
  const newItemsTotal = roundMoney(
    outboundRows.reduce((a, r) => a + r.lineTotal, 0)
  );

  const shippings = input.shippings.map((s) => {
    const method: ExchangeShippingMethod =
      s.method === "STORE_PICKUP" ||
      s.method === "LOCAL_COURIER" ||
      s.method === "CARRIER"
        ? s.method
        : "CARRIER";
    const local = isLocalExchangeShippingMethod(method);
    return {
      type: s.type,
      method,
      shippingServiceId: local ? null : (s.shippingServiceId ?? null),
      shippingServiceName: local
        ? exchangeShippingMethodServiceName(method)
        : (s.shippingServiceName ?? null),
      quotedPrice: local ? (s.quotedPrice ?? 0) : (s.quotedPrice ?? null),
      paidBy: s.paidBy,
      packageHeightCm: local ? null : (s.packageHeightCm ?? null),
      packageWidthCm: local ? null : (s.packageWidthCm ?? null),
      packageLengthCm: local ? null : (s.packageLengthCm ?? null),
      packageWeightKg: local ? null : (s.packageWeightKg ?? null),
    };
  });

  if (!shippings.some((s) => s.type === "RETURN")) {
    shippings.push({
      type: "RETURN",
      method: "CARRIER",
      shippingServiceId: null,
      shippingServiceName: null,
      quotedPrice: null,
      paidBy: "STORE",
      packageHeightCm: null,
      packageWidthCm: null,
      packageLengthCm: null,
      packageWeightKg: null,
    });
  }

  if (
    outboundRows.length > 0 &&
    !shippings.some((s) => s.type === "OUTBOUND")
  ) {
    shippings.push({
      type: "OUTBOUND",
      method: "CARRIER",
      shippingServiceId: null,
      shippingServiceName: null,
      quotedPrice: null,
      paidBy: "STORE",
      packageHeightCm: null,
      packageWidthCm: null,
      packageLengthCm: null,
      packageWeightKg: null,
    });
  }

  const balance = computeExchangeBalance({
    returnedItemsTotal,
    newItemsTotal,
    shippings,
  });

  return prisma.$transaction(async (tx) => {
    const maxRow = await tx.$queryRawUnsafe<[{ max: number | null }]>(
      `SELECT MAX("exchangeNumber") as max FROM "Exchange"`
    );
    const nextNumber = (maxRow[0]?.max ?? 0) + 1;

    const exchange = await tx.exchange.create({
      data: {
        exchangeNumber: nextNumber,
        orderId: order.id,
        kind,
        status: ExchangeStatus.AWAITING_RETURN,
        reason: input.reason,
        reasonNotes: input.reasonNotes?.trim() || null,
        notes: input.notes?.trim() || null,
        openedByUserId: input.openedByUserId,
        returnedItemsTotal: balance.returnedItemsTotal,
        newItemsTotal: balance.newItemsTotal,
        productsDelta: balance.productsDelta,
        shippingCustomerTotal: balance.shippingCustomerTotal,
        balanceAmount: balance.balanceAmount,
        balanceStatus: balance.balanceStatus,
        items: {
          create: [
            ...returnRows.map((r) => ({
              direction: "RETURN" as const,
              orderItemId: r.orderItemId,
              productId: r.productId,
              productName: r.productName,
              productImageUrl: r.productImageUrl,
              quantity: r.quantity,
              unitPrice: r.unitPrice,
              lineTotal: r.lineTotal,
              pieceSelectionsJson: r.pieceSelectionsJson,
              pieceVariantId: r.pieceVariantId,
            })),
            ...outboundRows.map((r) => ({
              direction: "OUTBOUND" as const,
              productId: r.productId,
              productName: r.productName,
              productImageUrl: r.productImageUrl,
              quantity: r.quantity,
              unitPrice: r.unitPrice,
              lineTotal: r.lineTotal,
              pieceSelectionsJson: r.pieceSelectionsJson,
              pieceVariantId: r.pieceVariantId,
            })),
          ],
        },
        shippings: {
          create: shippings.map((s) => ({
            type: s.type,
            method: s.method,
            shippingServiceId: s.shippingServiceId,
            shippingServiceName: s.shippingServiceName,
            quotedPrice: s.quotedPrice,
            paidBy: s.paidBy,
            packageHeightCm: s.packageHeightCm,
            packageWidthCm: s.packageWidthCm,
            packageLengthCm: s.packageLengthCm,
            packageWeightKg: s.packageWeightKg,
          })),
        },
      },
      include: {
        items: true,
        shippings: true,
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
      type: "CREATED",
      actorUserId: input.openedByUserId,
      payload: {
        kind,
        reason: input.reason,
        returnCount: returnRows.length,
        outboundCount: outboundRows.length,
        balanceAmount: balance.balanceAmount,
      },
    });

    return exchange;
  });
}
