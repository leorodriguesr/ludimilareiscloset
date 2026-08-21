import {
  CustomerDataStatus,
  OrderSource,
  PaymentChannel,
} from "@/app/generated/prisma/client";
import { appendCashLedgerEntry } from "@/lib/cash/ledger";
import { parsePieceSelections } from "@/lib/exchanges/serialize";
import { onOrderPaymentConfirmed } from "@/lib/fulfillment/fulfillment-service";
import {
  ORDER_CHARGE_STATUS,
  ORDER_ITEM_PAYMENT_STATUS,
  ORDER_STATUS,
  PAYMENT_ATTEMPT_STATUS,
  PAYMENT_METHOD,
  type PaymentMethod,
} from "@/lib/orders/constants";
import { OrderCreateError } from "@/lib/orders/create-order";
import {
  commitStockReservations,
  reserveStockForOrderLines,
} from "@/lib/orders/stock/reservation";
import { prisma } from "@/lib/prisma";

function resolvePaymentMethod(
  preferred: PaymentMethod | undefined,
  current: string | null
): PaymentMethod {
  if (preferred === PAYMENT_METHOD.PIX || preferred === PAYMENT_METHOD.CARD) {
    return preferred;
  }
  if (current === PAYMENT_METHOD.CARD) return PAYMENT_METHOD.CARD;
  return PAYMENT_METHOD.PIX;
}

export async function markOrderPaidManually(input: {
  orderId: string;
  paymentMethod?: PaymentMethod;
  markedByUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      paidTotal: true,
      orderSource: true,
      status: true,
      paidAt: true,
      paymentMethod: true,
      fulfillmentType: true,
      customerDataStatus: true,
      recipientName: true,
      addressStreet: true,
      addressCity: true,
      addressState: true,
      destinationCep: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          price: true,
          paymentStatus: true,
          pieceSelectionsJson: true,
        },
      },
    },
  });

  if (!order) {
    return { ok: false, error: "Pedido não encontrado." };
  }

  if (order.status === ORDER_STATUS.PAID && order.paidAt) {
    const pendingCharge = await prisma.orderCharge.findFirst({
      where: { orderId: order.id, status: ORDER_CHARGE_STATUS.PENDING },
      orderBy: { sequence: "desc" },
    });
    if (!pendingCharge) {
      await onOrderPaymentConfirmed(order);
      return { ok: true };
    }

    const paidAt = new Date();
    try {
      await prisma.$transaction(async (tx) => {
        await commitStockReservations(tx, order.id);
        await tx.orderCharge.update({
          where: { id: pendingCharge.id },
          data: { status: ORDER_CHARGE_STATUS.PAID, paidAt },
        });
        await tx.orderItem.updateMany({
          where: { chargeId: pendingCharge.id },
          data: {
            paymentStatus: ORDER_ITEM_PAYMENT_STATUS.PAID,
            paidAt,
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paidTotal: { increment: pendingCharge.amount } },
        });
        await tx.paymentAttempt.updateMany({
          where: {
            orderId: order.id,
            status: {
              in: [
                PAYMENT_ATTEMPT_STATUS.ACTIVE,
                PAYMENT_ATTEMPT_STATUS.CREATED,
              ],
            },
          },
          data: { status: PAYMENT_ATTEMPT_STATUS.SUPERSEDED },
        });
        await appendCashLedgerEntry(tx, {
          direction: "IN",
          kind: "SALE",
          amount: pendingCharge.amount,
          description: `Acréscimo manual · pedido #${order.orderNumber ?? order.id.slice(0, 8)}`,
          orderId: order.id,
          actorUserId: input.markedByUserId,
        });
      });
    } catch (e) {
      console.error("[markOrderPaidManually] addon", e);
      return { ok: false, error: "Não foi possível confirmar o acréscimo." };
    }
    return { ok: true };
  }

  const isCancelled = order.status === ORDER_STATUS.CANCELLED;
  const isPendingAdminSale =
    order.status === ORDER_STATUS.PENDING_PAYMENT &&
    order.orderSource === OrderSource.ADMIN_SALE;

  if (!isCancelled && !isPendingAdminSale) {
    if (order.orderSource !== OrderSource.ADMIN_SALE) {
      return {
        ok: false,
        error: "Pagamento manual só se aplica a vendas avulsas.",
      };
    }
    return { ok: false, error: "Este pedido não pode ser marcado como pago." };
  }

  const paymentMethod = resolvePaymentMethod(
    input.paymentMethod,
    order.paymentMethod
  );
  const paidAt = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      if (isCancelled) {
        const lines = order.items
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

        if (lines.length > 0) {
          await reserveStockForOrderLines(tx, order.id, lines, paidAt);
          await commitStockReservations(tx, order.id);
        }
      } else {
        await commitStockReservations(tx, order.id);
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: ORDER_STATUS.PAID,
          paidAt,
          paidTotal: order.total,
          shippingStatus: "to_pack",
          paymentMethod,
          paymentChannel: PaymentChannel.MANUAL,
          manualPaidByUserId: input.markedByUserId,
          cancellationReason: null,
          cancelledAt: null,
          expiredAt: null,
        },
      });

      await tx.orderItem.updateMany({
        where: { orderId: order.id },
        data: {
          paymentStatus: ORDER_ITEM_PAYMENT_STATUS.PAID,
          paidAt,
        },
      });

      await tx.orderCharge.updateMany({
        where: {
          orderId: order.id,
          status: ORDER_CHARGE_STATUS.PENDING,
        },
        data: { status: ORDER_CHARGE_STATUS.PAID, paidAt },
      });

      await tx.paymentAttempt.updateMany({
        where: {
          orderId: order.id,
          status: {
            in: [
              PAYMENT_ATTEMPT_STATUS.ACTIVE,
              PAYMENT_ATTEMPT_STATUS.CREATED,
            ],
          },
        },
        data: { status: PAYMENT_ATTEMPT_STATUS.SUPERSEDED },
      });

      await appendCashLedgerEntry(tx, {
        direction: "IN",
        kind: "SALE",
        amount: order.total,
        description: isCancelled
          ? `Confirmação de pagamento · pedido #${order.orderNumber ?? order.id.slice(0, 8)}`
          : `Venda avulsa · pedido #${order.orderNumber ?? order.id.slice(0, 8)}`,
        orderId: order.id,
        actorUserId: input.markedByUserId,
      });
    });
  } catch (e) {
    if (e instanceof OrderCreateError && e.code === "INSUFFICIENT_STOCK") {
      return {
        ok: false,
        error:
          "Estoque insuficiente para reativar esta venda. Ajuste o estoque e tente novamente.",
      };
    }
    console.error("[markOrderPaidManually]", e);
    return { ok: false, error: "Não foi possível confirmar o pagamento." };
  }

  await onOrderPaymentConfirmed({
    ...order,
    customerDataStatus:
      order.customerDataStatus ?? CustomerDataStatus.PENDING,
  });

  return { ok: true };
}
