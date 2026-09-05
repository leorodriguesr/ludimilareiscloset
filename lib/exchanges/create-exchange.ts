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
import { isWithinExchangeWindow } from "@/lib/exchanges/eligibility";
import { appendExchangeEvent } from "@/lib/exchanges/events";
import type { CreateExchangeOutboundLine } from "@/lib/exchanges/outbound-lines";
import { resolveOutboundRows } from "@/lib/exchanges/outbound-lines";
import {
  isSamePieceSwap,
  productIdentityKey,
  roundMoney,
} from "@/lib/exchanges/product-diff";
import {
  formatPieceLabel,
  maxPieceUnitsForOrderItem,
  pieceIdentity,
  pieceReturnKey,
  returnUnitCount,
} from "@/lib/exchanges/return-units";
import {
  parsePieceSelections,
  serializePieceSelections,
} from "@/lib/exchanges/serialize";
import { OrderCreateError } from "@/lib/orders/create-order";
import { buildStockDemands } from "@/lib/orders/stock/build-demands";
import { prisma } from "@/lib/prisma";

export type CreateExchangeReturnLine = {
  orderItemId: string;
  quantity: number;
  pieceSelections?: CartPieceSelection[];
  /** Crédito informado no cadastro (troca). */
  creditAmount?: number | null;
};

export type {
  CreateExchangeOutboundCatalogLine,
  CreateExchangeOutboundCustomLine,
  CreateExchangeOutboundLine,
} from "@/lib/exchanges/outbound-lines";

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
  /** Só devolução: valor informado no admin (não é a soma das peças). */
  refundAmount?: number | null;
  /** Admin pode cadastrar troca depois dos 7 dias. */
  bypassExchangeWindow?: boolean;
  /** Edita o registro existente (só antes da etiqueta reversa). */
  replaceExchangeId?: string;
};

export async function createExchange(input: CreateExchangeInput) {
  const kind: ExchangeKind = input.kind === "RETURN" ? "RETURN" : "EXCHANGE";

  if (input.returnLines.length === 0) {
    throw new ExchangeError(
      "RETURN_REQUIRED",
      "Selecione ao menos um item para devolver."
    );
  }

  if (kind === "RETURN") {
    const refund = input.refundAmount;
    if (refund == null || !Number.isFinite(refund) || refund < 0) {
      throw new ExchangeError(
        "INVALID_REFUND_AMOUNT",
        "Informe o valor a reembolsar."
      );
    }
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
            select: {
              orderItemId: true,
              quantity: true,
              pieceSelectionsJson: true,
            },
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

  if (order.shippingStatus !== "delivered") {
    throw new ExchangeError(
      "ORDER_NOT_DELIVERED",
      "Só é possível abrir troca em pedidos já entregues."
    );
  }

  if (
    !input.bypassExchangeWindow &&
    !isWithinExchangeWindow(order.deliveredAt)
  ) {
    throw new ExchangeError(
      "EXCHANGE_WINDOW",
      "Só é possível abrir troca até 7 dias após a entrega à cliente."
    );
  }

  const existing =
    input.replaceExchangeId != null
      ? await prisma.exchange.findUnique({
          where: { id: input.replaceExchangeId },
          include: { shippings: true },
        })
      : null;

  if (input.replaceExchangeId) {
    if (!existing || existing.orderId !== order.id) {
      throw new ExchangeError("NOT_FOUND", "Troca não encontrada.");
    }
    if (
      existing.status === ExchangeStatus.CANCELLED ||
      existing.status === ExchangeStatus.COMPLETED
    ) {
      throw new ExchangeError(
        "NOT_EDITABLE",
        "Esta troca não pode mais ser editada."
      );
    }
    if (existing.inspectedAt) {
      throw new ExchangeError(
        "NOT_EDITABLE",
        "Esta troca já foi conferida e não pode ser editada."
      );
    }
  }

  const otherExchanges = order.exchanges.filter(
    (ex) => ex.id !== input.replaceExchangeId
  );
  if (otherExchanges.length > 0) {
    throw new ExchangeError(
      "HAS_EXCHANGE",
      "Este pedido já tem troca ou devolução cadastrada."
    );
  }

  const alreadyReturnedUnitsByItem = new Map<string, number>();
  const alreadyReturnedByPiece = new Map<string, number>();
  for (const ex of otherExchanges) {
    for (const item of ex.items) {
      if (!item.orderItemId) continue;
      alreadyReturnedUnitsByItem.set(
        item.orderItemId,
        (alreadyReturnedUnitsByItem.get(item.orderItemId) ?? 0) +
          returnUnitCount(
            item.quantity,
            parsePieceSelections(item.pieceSelectionsJson)
          )
      );
      const pieces = parsePieceSelections(item.pieceSelectionsJson);
      const rows: Array<CartPieceSelection | null> =
        pieces.length > 0 ? pieces : [null];
      for (let q = 0; q < item.quantity; q++) {
        for (const piece of rows) {
          const key = pieceReturnKey(item.orderItemId, piece);
          alreadyReturnedByPiece.set(
            key,
            (alreadyReturnedByPiece.get(key) ?? 0) + 1
          );
        }
      }
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

  const runningReturnedUnits = new Map(alreadyReturnedUnitsByItem);
  const runningReturnedByPiece = new Map(alreadyReturnedByPiece);

  for (const line of input.returnLines) {
    const orderItem = order.items.find((i) => i.id === line.orderItemId);
    if (!orderItem) {
      throw new ExchangeError(
        "ORDER_ITEM_NOT_FOUND",
        "Item do pedido não encontrado."
      );
    }
    if (line.quantity < 1) {
      throw new ExchangeError(
        "INVALID_RETURN_QTY",
        `Quantidade inválida para ${orderItem.productName}.`
      );
    }

    const orderPieces = parsePieceSelections(orderItem.pieceSelectionsJson);
    const maxUnits = returnUnitCount(orderItem.quantity, orderPieces);
    const selectedPieces =
      line.pieceSelections && line.pieceSelections.length > 0
        ? line.pieceSelections
        : orderPieces;
    const lineUnits = returnUnitCount(line.quantity, selectedPieces);
    const already = runningReturnedUnits.get(orderItem.id) ?? 0;
    if (already + lineUnits > maxUnits) {
      throw new ExchangeError(
        "RETURN_EXCEEDS",
        `Quantidade de devolução excede o disponível para ${orderItem.productName}.`
      );
    }

    if (line.pieceSelections && line.pieceSelections.length > 0) {
      const allowed = new Set(orderPieces.map(pieceIdentity));
      if (orderPieces.length > 0) {
        for (const piece of line.pieceSelections) {
          if (!allowed.has(pieceIdentity(piece))) {
            throw new ExchangeError(
              "INVALID_RETURN_PIECE",
              `Peça inválida para ${orderItem.productName}.`
            );
          }
        }
      }
    }

    runningReturnedUnits.set(orderItem.id, already + lineUnits);

    const maxByPiece = maxPieceUnitsForOrderItem(orderItem);
    const selectedRows: Array<CartPieceSelection | null> =
      selectedPieces.length > 0 ? selectedPieces : [null];
    for (let q = 0; q < line.quantity; q++) {
      for (const piece of selectedRows) {
        const key = pieceReturnKey(orderItem.id, piece);
        const max = maxByPiece.get(key) ?? 0;
        const used = runningReturnedByPiece.get(key) ?? 0;
        if (used + 1 > max) {
          throw new ExchangeError(
            "ALREADY_RETURNED",
            `Esta peça de ${orderItem.productName} já está em outra troca.`
          );
        }
        runningReturnedByPiece.set(key, used + 1);
      }
    }

    const productName =
      selectedPieces.length > 0
        ? selectedPieces.map(formatPieceLabel).join(" + ")
        : orderItem.productName;

    returnRows.push({
      orderItemId: orderItem.id,
      productId: orderItem.productId,
      productName,
      productImageUrl: orderItem.productImageUrl,
      quantity: line.quantity,
      unitPrice: 0,
      lineTotal: 0,
      pieceSelectionsJson: serializePieceSelections(
        selectedPieces.length > 0 ? selectedPieces : undefined
      ),
      pieceVariantId: null,
    });
  }

  if (kind === "EXCHANGE") {
    const creditByItem = new Map<string, number>();
    for (const line of input.returnLines) {
      if (line.creditAmount == null || !Number.isFinite(line.creditAmount)) {
        continue;
      }
      creditByItem.set(
        line.orderItemId,
        roundMoney((creditByItem.get(line.orderItemId) ?? 0) + line.creditAmount)
      );
    }

    const rowsByItem = new Map<string, typeof returnRows>();
    for (const row of returnRows) {
      const list = rowsByItem.get(row.orderItemId) ?? [];
      list.push(row);
      rowsByItem.set(row.orderItemId, list);
    }

    for (const [itemId, rows] of rowsByItem) {
      const orderItem = order.items.find((i) => i.id === itemId);
      if (!orderItem) continue;
      const maxUnits = returnUnitCount(
        orderItem.quantity,
        parsePieceSelections(orderItem.pieceSelectionsJson)
      );
      const selectedUnits = rows.reduce((acc, row) => acc + row.quantity, 0);
      const isFull = selectedUnits === maxUnits && maxUnits > 0;
      let credit = creditByItem.get(itemId);
      if (credit == null) {
        if (isFull) {
          credit = roundMoney(orderItem.price);
        } else {
          throw new ExchangeError(
            "CREDIT_REQUIRED",
            `Informe o crédito de ${orderItem.productName}.`
          );
        }
      }
      if (credit < 0) {
        throw new ExchangeError(
          "INVALID_CREDIT",
          `Crédito inválido para ${orderItem.productName}.`
        );
      }
      if (credit - orderItem.price > 0.009) {
        throw new ExchangeError(
          "CREDIT_EXCEEDS",
          `O crédito de ${orderItem.productName} não pode passar do valor pago.`
        );
      }
      const share = rows.length > 0 ? roundMoney(credit / rows.length) : 0;
      let assigned = 0;
      rows.forEach((row, index) => {
        const lineTotal =
          index === rows.length - 1 ? roundMoney(credit - assigned) : share;
        assigned = roundMoney(assigned + lineTotal);
        row.lineTotal = lineTotal;
        row.unitPrice = row.quantity > 0 ? roundMoney(lineTotal / row.quantity) : 0;
      });
    }
  }

  const outboundRows = await resolveOutboundRows(
    kind === "RETURN" ? [] : input.outboundLines,
    order.id
  );

  try {
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

  const returnedByItem = new Map<
    string,
    { selectedUnits: number; maxUnits: number }
  >();
  for (const line of input.returnLines) {
    const orderItem = order.items.find((i) => i.id === line.orderItemId);
    if (!orderItem) continue;
    const maxUnits = returnUnitCount(
      orderItem.quantity,
      parsePieceSelections(orderItem.pieceSelectionsJson)
    );
    const selectedPieces =
      line.pieceSelections && line.pieceSelections.length > 0
        ? line.pieceSelections
        : parsePieceSelections(orderItem.pieceSelectionsJson);
    const lineUnits = returnUnitCount(line.quantity, selectedPieces);
    const prev = returnedByItem.get(orderItem.id) ?? {
      selectedUnits: 0,
      maxUnits,
    };
    returnedByItem.set(orderItem.id, {
      selectedUnits: prev.selectedUnits + lineUnits,
      maxUnits,
    });
  }

  const allReturnItemsFullySelected = [...returnedByItem.values()].every(
    (row) => row.selectedUnits === row.maxUnits && row.maxUnits > 0
  );
  const returnedProductKeys = [...returnedByItem.keys()].map((itemId) => {
    const orderItem = order.items.find((i) => i.id === itemId)!;
    return {
      key: productIdentityKey(orderItem.productId, orderItem.productName),
      quantity: orderItem.quantity,
    };
  });
  const outboundProductKeys = outboundRows.map((row) => ({
    key: productIdentityKey(row.productId, row.productName),
    quantity: row.quantity,
  }));
  const returnedItemsTotal =
    kind === "RETURN"
      ? roundMoney(input.refundAmount ?? 0)
      : roundMoney(returnRows.reduce((a, r) => a + r.lineTotal, 0));
  const newItemsTotal =
    kind === "EXCHANGE"
      ? roundMoney(outboundRows.reduce((a, r) => a + r.lineTotal, 0))
      : 0;
  const deferProductBalance =
    kind === "EXCHANGE" && outboundRows.length === 0;
  const samePieceSwap =
    !deferProductBalance &&
    kind === "EXCHANGE" &&
    isSamePieceSwap({
      returned: returnedProductKeys,
      outbound: outboundProductKeys,
      allReturnItemsFullySelected,
    });

  const shippings = input.shippings
    .filter((s) => s.type === "RETURN" || outboundRows.length > 0)
    .map((s) => {
    const method: ExchangeShippingMethod =
      s.method === "STORE_PICKUP" ||
      s.method === "LOCAL_COURIER" ||
      s.method === "CARRIER"
        ? s.method
        : "CARRIER";
    const local = isLocalExchangeShippingMethod(method);
    const paidBy =
      kind === "EXCHANGE"
        ? s.type === "OUTBOUND"
          ? "CUSTOMER"
          : "STORE"
        : s.paidBy;
    return {
      type: s.type,
      method,
      shippingServiceId: local ? null : (s.shippingServiceId ?? null),
      shippingServiceName: local
        ? exchangeShippingMethodServiceName(method)
        : (s.shippingServiceName ?? null),
      quotedPrice: local ? (s.quotedPrice ?? 0) : (s.quotedPrice ?? null),
      paidBy,
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

  const balance = deferProductBalance
    ? {
        returnedItemsTotal,
        newItemsTotal: 0,
        productsDelta: 0,
        shippingCustomerTotal: 0,
        balanceAmount: 0,
        balanceStatus: "NONE" as const,
      }
    : computeExchangeBalance({
        returnedItemsTotal,
        newItemsTotal,
        shippings,
        samePieceSwap,
      });

  const itemCreates = [
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
      lineRole: r.lineRole,
    })),
  ];

  const shippingCreates = shippings.map((s) => ({
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
  }));

  const created = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.exchangeItem.deleteMany({ where: { exchangeId: existing.id } });
      await tx.exchangeShipping.deleteMany({
        where: { exchangeId: existing.id, type: "OUTBOUND" },
      });

      const returnDraft = shippingCreates.find((s) => s.type === "RETURN");
      const currentReturn = existing.shippings.find((s) => s.type === "RETURN");
      if (returnDraft && currentReturn) {
        await tx.exchangeShipping.update({
          where: { id: currentReturn.id },
          data: returnDraft,
        });
      } else if (returnDraft && !currentReturn) {
        await tx.exchangeShipping.create({
          data: { exchangeId: existing.id, ...returnDraft },
        });
      }

      for (const outboundDraft of shippingCreates.filter(
        (s) => s.type === "OUTBOUND"
      )) {
        await tx.exchangeShipping.create({
          data: { exchangeId: existing.id, ...outboundDraft },
        });
      }

      const exchange = await tx.exchange.update({
        where: { id: existing.id },
        data: {
          kind,
          reason: input.reason,
          reasonNotes: input.reasonNotes?.trim() || null,
          notes: input.notes?.trim() || null,
          returnedItemsTotal: balance.returnedItemsTotal,
          newItemsTotal: balance.newItemsTotal,
          productsDelta: balance.productsDelta,
          shippingCustomerTotal: balance.shippingCustomerTotal,
          balanceAmount: balance.balanceAmount,
          balanceStatus: balance.balanceStatus,
          outboundDefinedAt:
            outboundRows.length > 0
              ? (existing.outboundDefinedAt ?? new Date())
              : null,
          items: { create: itemCreates },
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
        type: "NOTE_ADDED",
        actorUserId: input.openedByUserId,
        payload: {
          kind: "exchange_updated",
          reason: input.reason,
          returnCount: returnRows.length,
          balanceAmount: balance.balanceAmount,
        },
      });

      return exchange;
    }

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
        outboundDefinedAt: outboundRows.length > 0 ? new Date() : null,
        items: { create: itemCreates },
        shippings: { create: shippingCreates },
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
        samePieceSwap,
      },
    });

    return exchange;
  });

  const reloaded = await prisma.exchange.findUnique({
    where: { id: created.id },
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

  return reloaded ?? created;
}
