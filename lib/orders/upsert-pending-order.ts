import {
  ORDER_PENDING_TTL_MS,
  ORDER_STATUS,
  type PaymentMethod,
} from "@/lib/orders/constants";
import {
  OrderCreateError,
  type CheckoutLineInput,
  type OrderAddressInput,
  type OrderContactInput,
  type OrderShippingInput,
} from "@/lib/orders/create-order";
import { findPendingOrder } from "@/lib/orders/find-pending-order";
import {
  persistRecalculatedOrder,
  prepareOrderRecalculation,
  resolveOrderLinesAndTotals,
  toStoredShippingSnapshot,
} from "@/lib/orders/recalculate-order";
import { prisma } from "@/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UpsertPendingOrderInput = {
  email: string;
  userId: string | null;
  lines: CheckoutLineInput[];
  shipping: OrderShippingInput;
  contact?: OrderContactInput;
  address?: OrderAddressInput;
  cpf?: string;
  paymentMethod: PaymentMethod;
};

export type UpsertPendingOrderResult = {
  orderId: string;
  total: number;
  shippingAmount: number;
  created: boolean;
  previousTotal: number | null;
  priceUpdated: boolean;
};

export async function upsertPendingOrderFromCheckout(
  input: UpsertPendingOrderInput
): Promise<UpsertPendingOrderResult> {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) {
    throw new OrderCreateError("INVALID_EMAIL", "E-mail inválido.");
  }

  const existingPending = await findPendingOrder({
    userId: input.userId,
    email: normalizedEmail,
  });

  const previousTotal = existingPending?.total ?? null;
  const prepared = await prepareOrderRecalculation({
    lines: input.lines,
    shipping: input.shipping,
    storedOrder: existingPending
      ? toStoredShippingSnapshot(existingPending)
      : null,
  });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ORDER_PENDING_TTL_MS);

  return prisma.$transaction(async (tx) => {
    let orderId: string;
    let created = false;

    if (existingPending) {
      const locked = await tx.order.findUnique({
        where: { id: existingPending.id },
        select: { id: true, status: true, expiresAt: true },
      });
      if (
        !locked ||
        locked.status !== ORDER_STATUS.PENDING_PAYMENT ||
        !locked.expiresAt ||
        locked.expiresAt <= now
      ) {
        throw new OrderCreateError(
          "ORDER_NOT_PENDING",
          "Seu pedido pendente expirou. Atualize a página e tente novamente."
        );
      }
      orderId = locked.id;
    } else {
      const maxRows = await tx.$queryRawUnsafe<{ max: number | null }[]>(
        `SELECT MAX("orderNumber") as max FROM "Order"`
      );
      const nextOrderNumber = (maxRows[0]?.max ?? 0) + 1;

      const createdOrder = await tx.order.create({
        data: {
          email: normalizedEmail,
          orderNumber: nextOrderNumber,
          ...(input.userId
            ? { user: { connect: { id: input.userId } } }
            : {}),
          status: ORDER_STATUS.PENDING_PAYMENT,
          total: 0,
          expiresAt,
          paymentMethod: input.paymentMethod,
        },
        select: { id: true },
      });
      orderId = createdOrder.id;
      created = true;
    }

    const totals = await resolveOrderLinesAndTotals(
      {
        mergedLines: prepared.mergedLines,
        paymentMethod: input.paymentMethod,
        shippingAmount: prepared.shippingAmount,
      },
      tx
    );

    await persistRecalculatedOrder(tx, {
      orderId,
      prepared,
      contact: input.contact,
      address: input.address,
      cpf: input.cpf,
      totals,
      paymentMethod: input.paymentMethod,
      lastRecalculatedAt: now,
    });

    return {
      orderId,
      total: totals.total,
      shippingAmount: totals.shippingAmount,
      created,
      previousTotal,
      priceUpdated:
        previousTotal != null && previousTotal !== totals.total,
    };
  });
}
