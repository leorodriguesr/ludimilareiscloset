import { DiscountMode, OrderSource } from "@/app/generated/prisma/client";
import {
  normalizeAdminSaleLineInput,
  resolveAdminSalePricing,
  type AdminSaleLineInput,
  type DiscountInput,
} from "@/lib/admin-sale/pricing";
import { continueAdminSalePayment } from "@/lib/admin-sale/continue-admin-sale-payment";
import { serializePieceSelections } from "@/lib/exchanges/serialize";
import {
  ORDER_CHARGE_REASON,
  ORDER_CHARGE_STATUS,
  ORDER_ITEM_PAYMENT_STATUS,
  ORDER_STATUS,
  type PaymentMethod,
} from "@/lib/orders/constants";
import {
  releaseStockReservations,
  reserveStockForOrderLines,
} from "@/lib/orders/stock/reservation";
import { prisma } from "@/lib/prisma";

export class AdminSaleItemsError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AdminSaleItemsError";
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseLines(raw: unknown, allowEmpty: boolean): AdminSaleLineInput[] {
  if (!Array.isArray(raw)) {
    throw new AdminSaleItemsError("Informe a lista de itens.", 400);
  }
  if (raw.length === 0) {
    if (allowEmpty) return [];
    throw new AdminSaleItemsError("Informe ao menos um item.", 400);
  }
  return raw.map((row) => {
    if (!row || typeof row !== "object") {
      throw new AdminSaleItemsError("Item inválido.", 400);
    }
    const record = row as Record<string, unknown>;
    let itemDiscount: DiscountInput | undefined;
    if (record.itemDiscount && typeof record.itemDiscount === "object") {
      const d = record.itemDiscount as Record<string, unknown>;
      const mode = d.mode === DiscountMode.PERCENT ? DiscountMode.PERCENT : DiscountMode.FIXED;
      const value = Number(d.value);
      if (Number.isFinite(value) && value > 0) {
        itemDiscount = { mode, value };
      }
    }
    return normalizeAdminSaleLineInput(record, itemDiscount);
  });
}

function stockLinesFromPricing(
  lines: Awaited<ReturnType<typeof resolveAdminSalePricing>>["lines"]
) {
  return lines
    .filter(
      (l): l is typeof l & { productId: string } =>
        typeof l.productId === "string" && l.productId.length > 0
    )
    .map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      price: l.unitPrice,
      pieceSelections: l.pieceSelections,
    }));
}

export async function replaceAdminSaleItems(input: {
  orderId: string;
  lines: unknown;
  actorUserId: string;
}): Promise<{ paymentRegenerated: boolean; pendingAmount: number }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      items: true,
      charges: { orderBy: { sequence: "asc" } },
    },
  });

  if (!order) {
    throw new AdminSaleItemsError("Pedido não encontrado.", 404);
  }
  if (order.orderSource !== OrderSource.ADMIN_SALE) {
    throw new AdminSaleItemsError(
      "Só é possível editar itens de venda avulsa.",
      400
    );
  }
  if (
    order.status === ORDER_STATUS.CANCELLED ||
    order.status === ORDER_STATUS.EXPIRED
  ) {
    throw new AdminSaleItemsError("Esta venda não pode ser editada.", 400);
  }
  if (order.labelUrl || order.superfreteShipmentId) {
    throw new AdminSaleItemsError(
      "Não é possível alterar itens após gerar a etiqueta.",
      400
    );
  }
  if (
    order.shippingStatus === "shipped" ||
    order.shippingStatus === "delivered"
  ) {
    throw new AdminSaleItemsError(
      "Não é possível alterar itens de um pedido já enviado.",
      400
    );
  }

  const paymentMethod: PaymentMethod =
    order.paymentMethod === "card" ? "card" : "pix";
  const lines = parseLines(
    input.lines,
    order.status === ORDER_STATUS.PAID
  );
  const orderDiscount: DiscountInput | undefined =
    order.orderDiscountMode &&
    order.orderDiscountValue != null &&
    order.orderDiscountValue > 0
      ? {
          mode: order.orderDiscountMode,
          value: order.orderDiscountValue,
        }
      : undefined;

  if (order.status === ORDER_STATUS.PENDING_PAYMENT) {
    const pricing = await resolveAdminSalePricing({
      lines,
      paymentMethod,
      shippingAmount: order.shippingAmount,
      orderDiscount,
    });

    const initialCharge =
      order.charges.find((c) => c.reason === ORDER_CHARGE_REASON.INITIAL) ??
      order.charges[0];

    await prisma.$transaction(async (tx) => {
      await releaseStockReservations(tx, order.id);
      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      await tx.orderItem.createMany({
        data: pricing.lines.map((line) => ({
          orderId: order.id,
          productId: line.productId,
          productName: line.productName,
          productDescription: line.productDescription,
          productImageUrl: line.productImageUrl,
          quantity: line.quantity,
          catalogListPrice: line.catalogListPrice,
          catalogPromoPrice: line.catalogPromoPrice,
          catalogUnitPrice: line.catalogUnitPrice,
          itemDiscountMode: line.itemDiscountMode,
          itemDiscountValue: line.itemDiscountValue,
          itemDiscountAmount: line.itemDiscountAmount,
          lineSubtotalOriginal: line.lineSubtotalOriginal,
          lineSubtotalFinal: line.lineSubtotalFinal,
          price: line.unitPrice,
          pieceSelectionsJson: serializePieceSelections(line.pieceSelections),
          paymentStatus: ORDER_ITEM_PAYMENT_STATUS.PENDING,
          chargeId: initialCharge?.id ?? null,
        })),
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          subtotalOriginal: pricing.subtotalOriginal,
          itemsDiscountTotal: pricing.itemsDiscountTotal,
          orderDiscountAmount: pricing.orderDiscountAmount,
          total: pricing.total,
          lastRecalculatedAt: new Date(),
        },
      });

      if (initialCharge) {
        await tx.orderCharge.update({
          where: { id: initialCharge.id },
          data: { amount: pricing.total, status: ORDER_CHARGE_STATUS.PENDING },
        });
      }

      const stock = stockLinesFromPricing(pricing.lines);
      if (stock.length > 0) {
        await reserveStockForOrderLines(tx, order.id, stock);
      }
    });

    const pay = await continueAdminSalePayment({
      orderId: order.id,
      userId: input.actorUserId,
      forceNewLink: true,
    });
    if (!pay.ok) {
      throw new AdminSaleItemsError(
        `Itens atualizados, mas o novo link falhou: ${pay.error}`,
        502
      );
    }

    return { paymentRegenerated: true, pendingAmount: pricing.total };
  }

  if (order.status !== ORDER_STATUS.PAID) {
    throw new AdminSaleItemsError("Status da venda não permite edição.", 400);
  }

  const paidItems = order.items.filter(
    (item) => item.paymentStatus === ORDER_ITEM_PAYMENT_STATUS.PAID
  );
  if (paidItems.length === 0) {
    throw new AdminSaleItemsError(
      "Pedido pago sem itens pagos. Recarregue a página.",
      400
    );
  }

  const paidTotal =
    order.paidTotal > 0
      ? order.paidTotal
      : round2(
          paidItems.reduce((sum, item) => sum + item.price * item.quantity, 0) +
            order.shippingAmount
        );

  if (lines.length === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({
        where: {
          orderId: order.id,
          paymentStatus: ORDER_ITEM_PAYMENT_STATUS.PENDING,
        },
      });
      await tx.orderCharge.updateMany({
        where: {
          orderId: order.id,
          status: ORDER_CHARGE_STATUS.PENDING,
        },
        data: { status: ORDER_CHARGE_STATUS.CANCELLED },
      });
      await releaseStockReservations(tx, order.id);
      await tx.order.update({
        where: { id: order.id },
        data: { total: paidTotal, lastRecalculatedAt: new Date() },
      });
    });
    return { paymentRegenerated: false, pendingAmount: 0 };
  }

  const pricing = await resolveAdminSalePricing({
    lines,
    paymentMethod,
    shippingAmount: 0,
  });
  const pendingAmount = pricing.total;

  await prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({
      where: {
        orderId: order.id,
        paymentStatus: ORDER_ITEM_PAYMENT_STATUS.PENDING,
      },
    });

    let pendingCharge = await tx.orderCharge.findFirst({
      where: {
        orderId: order.id,
        reason: ORDER_CHARGE_REASON.ADDON,
        status: ORDER_CHARGE_STATUS.PENDING,
      },
      orderBy: { sequence: "desc" },
    });

    if (!pendingCharge) {
      const maxSeq = await tx.orderCharge.aggregate({
        where: { orderId: order.id },
        _max: { sequence: true },
      });
      pendingCharge = await tx.orderCharge.create({
        data: {
          orderId: order.id,
          sequence: (maxSeq._max.sequence ?? 1) + 1,
          amount: pendingAmount,
          status: ORDER_CHARGE_STATUS.PENDING,
          reason: ORDER_CHARGE_REASON.ADDON,
        },
      });
    } else {
      await tx.orderCharge.update({
        where: { id: pendingCharge.id },
        data: { amount: pendingAmount },
      });
    }

    await tx.orderItem.createMany({
      data: pricing.lines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        productName: line.productName,
        productDescription: line.productDescription,
        productImageUrl: line.productImageUrl,
        quantity: line.quantity,
        catalogListPrice: line.catalogListPrice,
        catalogPromoPrice: line.catalogPromoPrice,
        catalogUnitPrice: line.catalogUnitPrice,
        itemDiscountMode: line.itemDiscountMode,
        itemDiscountValue: line.itemDiscountValue,
        itemDiscountAmount: line.itemDiscountAmount,
        lineSubtotalOriginal: line.lineSubtotalOriginal,
        lineSubtotalFinal: line.lineSubtotalFinal,
        price: line.unitPrice,
        pieceSelectionsJson: serializePieceSelections(line.pieceSelections),
        paymentStatus: ORDER_ITEM_PAYMENT_STATUS.PENDING,
        chargeId: pendingCharge!.id,
      })),
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        total: round2(paidTotal + pendingAmount),
        lastRecalculatedAt: new Date(),
      },
    });

    await releaseStockReservations(tx, order.id);
    const stock = stockLinesFromPricing(pricing.lines);
    if (stock.length > 0) {
      await reserveStockForOrderLines(tx, order.id, stock);
    }
  });

  const pay = await continueAdminSalePayment({
    orderId: order.id,
    userId: input.actorUserId,
    forceNewLink: true,
  });
  if (!pay.ok) {
    throw new AdminSaleItemsError(
      `Itens atualizados, mas o novo link falhou: ${pay.error}`,
      502
    );
  }

  return { paymentRegenerated: true, pendingAmount };
}
