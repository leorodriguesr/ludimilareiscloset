import { PaymentChannel } from "@/app/generated/prisma/client";
import { parsePieceSelections } from "@/lib/exchanges/serialize";
import {
  ORDER_CHARGE_STATUS,
  ORDER_PENDING_TTL_MS,
  ORDER_STATUS,
  type PaymentMethod,
} from "@/lib/orders/constants";
import { OrderCreateError } from "@/lib/orders/create-order";
import { reserveStockForOrderLines } from "@/lib/orders/stock/reservation";
import { prisma } from "@/lib/prisma";

export type ReactivateCancelledOrderResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code: "not_found" | "not_pending" | "insufficient_stock";
    };

/**
 * Reabre venda cancelada/expirada ainda não paga: volta a `pending_payment`,
 * reserva estoque de novo e renova o TTL de 24h.
 */
export async function reactivateUnpaidCancelledOrder(input: {
  orderId: string;
  paymentMethod?: PaymentMethod;
}): Promise<ReactivateCancelledOrderResult> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      status: true,
      paidAt: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          price: true,
          pieceSelectionsJson: true,
        },
      },
    },
  });

  if (!order) {
    return { ok: false, error: "Pedido não encontrado.", code: "not_found" };
  }

  const inactive =
    order.status === ORDER_STATUS.CANCELLED ||
    order.status === ORDER_STATUS.EXPIRED;

  if (!inactive) {
    if (
      input.paymentMethod &&
      order.status === ORDER_STATUS.PENDING_PAYMENT &&
      !order.paidAt
    ) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentMethod: input.paymentMethod,
          paymentChannel: PaymentChannel.GATEWAY,
        },
      });
    }
    return { ok: true };
  }

  if (order.paidAt) {
    return {
      ok: false,
      error: "Venda paga cancelada não pode ser reaberta por este fluxo.",
      code: "not_pending",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const stockLines = order.items
        .filter(
          (item): item is typeof item & { productId: string } =>
            Boolean(item.productId)
        )
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          pieceSelections: parsePieceSelections(item.pieceSelectionsJson),
        }));

      if (stockLines.length > 0) {
        await reserveStockForOrderLines(tx, order.id, stockLines);
      }

      const cancelledCharge = await tx.orderCharge.findFirst({
        where: { orderId: order.id, status: ORDER_CHARGE_STATUS.CANCELLED },
        orderBy: { sequence: "desc" },
        select: { id: true },
      });

      if (cancelledCharge) {
        await tx.orderCharge.update({
          where: { id: cancelledCharge.id },
          data: { status: ORDER_CHARGE_STATUS.PENDING, paidAt: null },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: ORDER_STATUS.PENDING_PAYMENT,
          shippingStatus: "to_pack",
          expiresAt: new Date(Date.now() + ORDER_PENDING_TTL_MS),
          expiredAt: null,
          cancelledAt: null,
          cancellationReason: null,
          ...(input.paymentMethod
            ? {
                paymentMethod: input.paymentMethod,
                paymentChannel: PaymentChannel.GATEWAY,
              }
            : {}),
        },
      });
    });
  } catch (e) {
    if (e instanceof OrderCreateError && e.code === "INSUFFICIENT_STOCK") {
      return {
        ok: false,
        error: "Estoque insuficiente para reabrir esta venda.",
        code: "insufficient_stock",
      };
    }
    throw e;
  }

  return { ok: true };
}
