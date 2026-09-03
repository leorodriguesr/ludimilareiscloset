import {
  ExchangeBalanceStatus,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import { computeExchangeBalance } from "@/lib/exchanges/balance";
import type { CreateExchangeShippingInput } from "@/lib/exchanges/create-exchange";
import { ExchangeError } from "@/lib/exchanges/constants";
import { appendExchangeEvent } from "@/lib/exchanges/events";
import { exchangeDetailInclude } from "@/lib/exchanges/include";
import type { CreateExchangeOutboundLine } from "@/lib/exchanges/outbound-lines";
import { resolveOutboundRows } from "@/lib/exchanges/outbound-lines";
import {
  isSamePieceSwap,
  productIdentityKey,
  roundMoney,
} from "@/lib/exchanges/product-diff";
import {
  additionalSaleRecognitionDate,
  additionalSaleSnapshot,
} from "@/lib/exchanges/additional-sale";
import { returnUnitCount } from "@/lib/exchanges/return-units";
import { parsePieceSelections } from "@/lib/exchanges/serialize";
import { maybeReleaseOutboundShipping } from "@/lib/exchanges/release-outbound";
import {
  exchangeShippingMethodServiceName,
  isLocalExchangeShippingMethod,
  LOCAL_COURIER_CUSTOMER_FEE,
} from "@/lib/exchanges/shipping-method";
import { debitCommittedStock } from "@/lib/orders/stock/restore";
import { prisma } from "@/lib/prisma";

export async function addExchangeOutbound(input: {
  exchangeId: string;
  actorUserId: string;
  outboundLines: CreateExchangeOutboundLine[];
  shipping: CreateExchangeShippingInput;
  adjustmentAmount?: number | null;
  adjustmentReason?: string | null;
}) {
  if (input.outboundLines.length === 0) {
    throw new ExchangeError(
      "OUTBOUND_REQUIRED",
      "Selecione o produto que será enviado na troca."
    );
  }

  const exchange = await prisma.exchange.findUnique({
    where: { id: input.exchangeId },
    include: {
      items: true,
      shippings: true,
      order: {
        include: { items: true },
      },
    },
  });

  if (!exchange) {
    throw new ExchangeError("NOT_FOUND", "Troca não encontrada.");
  }
  if (exchange.kind !== "EXCHANGE") {
    throw new ExchangeError(
      "NOT_EXCHANGE",
      "Só a troca define o envio depois da conferência."
    );
  }
  if (exchange.status === ExchangeStatus.CANCELLED) {
    throw new ExchangeError("CANCELLED", "Troca cancelada.");
  }
  if (!exchange.inspectedAt) {
    throw new ExchangeError(
      "NOT_INSPECTED",
      "Confira as peças antes de definir o envio."
    );
  }
  if (exchange.items.some((item) => item.direction === "OUTBOUND")) {
    throw new ExchangeError(
      "OUTBOUND_EXISTS",
      "O envio desta troca já foi definido."
    );
  }

  const outboundRows = await resolveOutboundRows(
    input.outboundLines,
    exchange.orderId
  );

  const returnedByItem = new Map<string, number>();
  for (const item of exchange.items) {
    if (item.direction !== "RETURN" || !item.orderItemId) continue;
    const selectedUnits = returnUnitCount(
      item.quantity,
      parsePieceSelections(item.pieceSelectionsJson)
    );
    returnedByItem.set(
      item.orderItemId,
      (returnedByItem.get(item.orderItemId) ?? 0) + selectedUnits
    );
  }

  const returnedProductKeys = [...returnedByItem.keys()].map((itemId) => {
    const orderItem = exchange.order.items.find((i) => i.id === itemId);
    return {
      key: productIdentityKey(
        orderItem?.productId ?? null,
        orderItem?.productName ?? ""
      ),
      quantity: orderItem?.quantity ?? 1,
    };
  });
  const allReturnItemsFullySelected =
    returnedByItem.size > 0 &&
    [...returnedByItem].every(([itemId, selectedUnits]) => {
      const orderItem = exchange.order.items.find((item) => item.id === itemId);
      if (!orderItem) return false;
      const maxUnits = returnUnitCount(
        orderItem.quantity,
        parsePieceSelections(orderItem.pieceSelectionsJson)
      );
      return selectedUnits === maxUnits && maxUnits > 0;
    });
  const replacementRows = outboundRows.filter(
    (row) => row.lineRole !== "ADDITIONAL_SALE"
  );
  const outboundProductKeys = replacementRows.map((row) => ({
    key: productIdentityKey(row.productId, row.productName),
    quantity: row.quantity,
  }));
  const samePieceSwap =
    replacementRows.length > 0 &&
    isSamePieceSwap({
      returned: returnedProductKeys,
      outbound: outboundProductKeys,
      allReturnItemsFullySelected,
    });
  const extraSale = additionalSaleSnapshot(outboundRows);

  const method =
    input.shipping.method === "STORE_PICKUP" ||
    input.shipping.method === "LOCAL_COURIER" ||
    input.shipping.method === "CARRIER"
      ? input.shipping.method
      : "CARRIER";
  const local = isLocalExchangeShippingMethod(method);
  const paidBy =
    method === "STORE_PICKUP"
      ? ("STORE" as const)
      : input.shipping.paidBy === "STORE" || input.shipping.paidBy === "CUSTOMER"
        ? input.shipping.paidBy
        : ("STORE" as const);
  let quotedPrice =
    local
      ? (input.shipping.quotedPrice ?? 0)
      : (input.shipping.quotedPrice ?? null);
  if (method === "LOCAL_COURIER") {
    quotedPrice = paidBy === "CUSTOMER" ? LOCAL_COURIER_CUSTOMER_FEE : 0;
  }
  if (method === "STORE_PICKUP") {
    quotedPrice = 0;
  }
  const outboundShipping = {
    type: "OUTBOUND" as const,
    method,
    shippingServiceId: local ? null : (input.shipping.shippingServiceId ?? null),
    shippingServiceName: local
      ? exchangeShippingMethodServiceName(method)
      : (input.shipping.shippingServiceName ?? null),
    quotedPrice,
    paidBy,
    packageHeightCm: local ? null : (input.shipping.packageHeightCm ?? null),
    packageWidthCm: local ? null : (input.shipping.packageWidthCm ?? null),
    packageLengthCm: local ? null : (input.shipping.packageLengthCm ?? null),
    packageWeightKg: local ? null : (input.shipping.packageWeightKg ?? null),
  };

  const existingShippings = exchange.shippings.map((s) => ({
    quotedPrice: s.quotedPrice,
    paidBy: s.paidBy,
  }));

  const returnedItemsTotal = roundMoney(exchange.returnedItemsTotal);
  const newItemsTotal = roundMoney(
    outboundRows.reduce((a, r) => a + r.lineTotal, 0)
  );
  const adjustmentAmount = roundMoney(input.adjustmentAmount ?? 0);

  const balance = computeExchangeBalance({
    returnedItemsTotal,
    newItemsTotal,
    samePieceSwap,
    additionalItemsTotal: extraSale.additionalSaleItemsTotal,
    adjustmentAmount,
    shippings: [
      ...existingShippings,
      {
        quotedPrice: outboundShipping.quotedPrice,
        paidBy: outboundShipping.paidBy,
      },
    ],
  });

  const customerOwes = balance.balanceStatus === ExchangeBalanceStatus.PENDING;

  await prisma.$transaction(async (tx) => {
    await tx.exchangeItem.createMany({
      data: outboundRows.map((r) => ({
        exchangeId: exchange.id,
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
    });

    await tx.exchangeShipping.create({
      data: {
        exchangeId: exchange.id,
        type: outboundShipping.type,
        method: outboundShipping.method,
        shippingServiceId: outboundShipping.shippingServiceId,
        shippingServiceName: outboundShipping.shippingServiceName,
        quotedPrice: outboundShipping.quotedPrice,
        paidBy: outboundShipping.paidBy,
        packageHeightCm: outboundShipping.packageHeightCm,
        packageWidthCm: outboundShipping.packageWidthCm,
        packageLengthCm: outboundShipping.packageLengthCm,
        packageWeightKg: outboundShipping.packageWeightKg,
      },
    });

    const debitLines = outboundRows
      .filter((row) => row.productId)
      .map((row) => ({
        productId: row.productId!,
        pieceVariantId: row.pieceVariantId,
        quantity: row.quantity,
      }));

    if (debitLines.length > 0) {
      await debitCommittedStock(tx, debitLines);
      const created = await tx.exchangeItem.findMany({
        where: { exchangeId: exchange.id, direction: "OUTBOUND" },
        select: { id: true },
      });
      await tx.exchangeItem.updateMany({
        where: { id: { in: created.map((row) => row.id) } },
        data: { stockDebited: true },
      });
      await appendExchangeEvent(tx, {
        exchangeId: exchange.id,
        type: "STOCK_DEBITED",
        actorUserId: input.actorUserId,
        payload: { lines: debitLines.length },
      });
    }

    await tx.exchange.update({
      where: { id: exchange.id },
      data: {
        returnedItemsTotal: balance.returnedItemsTotal,
        newItemsTotal: balance.newItemsTotal,
        productsDelta: balance.productsDelta,
        shippingCustomerTotal: balance.shippingCustomerTotal,
        balanceAdjustmentAmount: adjustmentAmount,
        balanceAdjustmentReason: input.adjustmentReason?.trim() || null,
        balanceAmount: balance.balanceAmount,
        balanceStatus: balance.balanceStatus,
        additionalSaleItemsTotal: extraSale.additionalSaleItemsTotal,
        additionalSaleItemCount: extraSale.additionalSaleItemCount,
        additionalSaleRecognizedAt: additionalSaleRecognitionDate({
          additionalSaleItemCount: extraSale.additionalSaleItemCount,
          balanceStatus: balance.balanceStatus,
        }),
        status: customerOwes
          ? ExchangeStatus.RECEIVED
          : ExchangeStatus.READY_OUTBOUND,
      },
    });

    await appendExchangeEvent(tx, {
      exchangeId: exchange.id,
      type: "BALANCE_UPDATED",
      actorUserId: input.actorUserId,
      payload: {
        samePieceSwap,
        balanceAmount: balance.balanceAmount,
        outboundCount: outboundRows.length,
        additionalSaleItemCount: extraSale.additionalSaleItemCount,
        adjustmentAmount,
      },
    });

    if (!customerOwes) {
      await maybeReleaseOutboundShipping(tx, exchange.id, input.actorUserId);
    }
  });

  return prisma.exchange.findUniqueOrThrow({
    where: { id: exchange.id },
    include: exchangeDetailInclude,
  });
}
