import type {
  ExchangeShippingMethod,
  Prisma,
} from "@/app/generated/prisma/client";
import { ARRANGED_DELIVERY_LABELS } from "@/lib/admin-sale/arranged-delivery";
import type { CartPieceSelection } from "@/lib/cart/types";
import { isLocalExchangeShippingMethod } from "@/lib/exchanges/shipping-method";
import { returnUnitCount } from "@/lib/exchanges/return-units";
import {
  parsePieceSelections,
  serializePieceSelections,
} from "@/lib/exchanges/serialize";
import { ORDER_STATUS } from "@/lib/orders/constants";
import { prisma } from "@/lib/prisma";
import { consumeReshipLinesIntoMap } from "@/lib/reshipments/availability";
import { ACTIVE_RESHIPMENT_STATUSES, ReshipmentError } from "@/lib/reshipments/constants";
import { appendReshipmentEvent } from "@/lib/reshipments/events";

export type CreateReshipmentLine = {
  orderItemId: string;
  quantity: number;
  pieceSelections?: CartPieceSelection[];
};

export type CreateReshipmentInput = {
  orderId: string;
  createdByUserId: string;
  notes?: string | null;
  method: ExchangeShippingMethod;
  shippingServiceId?: number | null;
  shippingServiceName?: string | null;
  quotedPrice?: number | null;
  packageHeightCm?: number | null;
  packageWidthCm?: number | null;
  packageLengthCm?: number | null;
  packageWeightKg?: number | null;
  items: CreateReshipmentLine[];
};

const RESHIP_INCLUDE = {
  items: true,
  events: { orderBy: { createdAt: "asc" as const } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      recipientName: true,
      email: true,
    },
  },
} satisfies Prisma.OrderReshipmentInclude;

export type OrderReshipmentWithDetails = Prisma.OrderReshipmentGetPayload<{
  include: typeof RESHIP_INCLUDE;
}>;

function arrangedServiceName(method: ExchangeShippingMethod): string {
  if (method === "STORE_PICKUP") return ARRANGED_DELIVERY_LABELS.pickup;
  if (method === "LOCAL_COURIER") return ARRANGED_DELIVERY_LABELS.store_delivery;
  return "Transportadora";
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function createOrderReshipment(
  input: CreateReshipmentInput
): Promise<OrderReshipmentWithDetails> {
  if (!input.items.length) {
    throw new ReshipmentError("NO_ITEMS", "Selecione ao menos uma peça.");
  }

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      items: true,
      reshipments: {
        where: { status: { in: [...ACTIVE_RESHIPMENT_STATUSES] } },
        include: { items: true },
      },
    },
  });

  if (!order) {
    throw new ReshipmentError("NOT_FOUND", "Pedido não encontrado.");
  }
  if (
    order.status === ORDER_STATUS.CANCELLED ||
    order.status === ORDER_STATUS.EXPIRED
  ) {
    throw new ReshipmentError(
      "ORDER_INACTIVE",
      "Pedido cancelado ou expirado não aceita reenvio."
    );
  }
  if (!order.paidAt) {
    throw new ReshipmentError(
      "NOT_PAID",
      "Só é possível reenviar peças de um pedido pago."
    );
  }

  const purchased = new Map<string, number>();
  const itemById = new Map(order.items.map((item) => [item.id, item]));
  for (const item of order.items) {
    purchased.set(
      item.id,
      returnUnitCount(item.quantity, parsePieceSelections(item.pieceSelectionsJson))
    );
  }

  const reserved = consumeReshipLinesIntoMap(
    order.reshipments.flatMap((row) =>
      row.items.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
        pieceSelectionsJson: item.pieceSelectionsJson,
      }))
    )
  );

  const local = isLocalExchangeShippingMethod(input.method);
  if (!local) {
    if (
      !order.recipientName?.trim() ||
      !order.addressStreet?.trim() ||
      !order.addressCity?.trim() ||
      !order.addressState?.trim() ||
      !order.destinationCep?.replace(/\D/g, "")
    ) {
      throw new ReshipmentError(
        "ADDRESS_INCOMPLETE",
        "Complete o endereço do pedido antes de reenviar pela transportadora."
      );
    }
    if (input.shippingServiceId == null || input.shippingServiceId <= 0) {
      throw new ReshipmentError(
        "SERVICE_REQUIRED",
        "Selecione o serviço de frete."
      );
    }
  }

  const itemRows: Prisma.OrderReshipmentItemCreateWithoutReshipmentInput[] = [];

  for (const line of input.items) {
    const qty = Math.floor(Number(line.quantity));
    if (!Number.isFinite(qty) || qty < 1) {
      throw new ReshipmentError("INVALID_QTY", "Quantidade inválida.");
    }
    const orderItem = itemById.get(line.orderItemId);
    if (!orderItem) {
      throw new ReshipmentError(
        "ITEM_NOT_IN_ORDER",
        "A peça selecionada não pertence a este pedido."
      );
    }

    const originalPieces = parsePieceSelections(orderItem.pieceSelectionsJson);
    const pieces = line.pieceSelections?.length
      ? line.pieceSelections
      : originalPieces;
    if (originalPieces.length > 0 && pieces.length === 0) {
      throw new ReshipmentError(
        "PIECE_REQUIRED",
        "Informe cor e tamanho da peça."
      );
    }
    const originalNames = new Set(originalPieces.map((piece) => piece.pieceName));
    for (const piece of pieces) {
      if (originalNames.size > 0 && !originalNames.has(piece.pieceName)) {
        throw new ReshipmentError(
          "PIECE_MISMATCH",
          "Só é possível alterar cor e tamanho da peça original, não o produto."
        );
      }
    }
    const incoming = returnUnitCount(qty, pieces);
    const bought = purchased.get(orderItem.id) ?? 0;
    const used = reserved.get(orderItem.id) ?? 0;
    if (used + incoming > bought) {
      throw new ReshipmentError(
        "QTY_EXCEEDED",
        "Quantidade maior do que a comprada (ou já em outro reenvio ativo)."
      );
    }
    reserved.set(orderItem.id, used + incoming);

    itemRows.push({
      orderItem: { connect: { id: orderItem.id } },
      productId: orderItem.productId,
      productName: orderItem.productName,
      productImageUrl: orderItem.productImageUrl,
      quantity: qty,
      unitPrice: roundMoney(orderItem.price),
      pieceSelectionsJson: serializePieceSelections(
        pieces.length > 0 ? pieces : null
      ),
    });
  }

  /**
   * Estoque: nenhum débito. As unidades já saíram no pagamento original.
   * Cancelar o reenvio também não devolve estoque.
   */
  return prisma.$transaction(async (tx) => {
    const reshipment = await tx.orderReshipment.create({
      data: {
        orderId: order.id,
        createdByUserId: input.createdByUserId,
        notes: input.notes?.trim() || null,
        method: input.method,
        paidBy: "STORE",
        shippingServiceId: local ? null : input.shippingServiceId ?? null,
        shippingServiceName: local
          ? arrangedServiceName(input.method)
          : input.shippingServiceName?.trim() || null,
        quotedPrice: local ? 0 : input.quotedPrice ?? null,
        packageHeightCm: input.packageHeightCm ?? null,
        packageWidthCm: input.packageWidthCm ?? null,
        packageLengthCm: input.packageLengthCm ?? null,
        packageWeightKg: input.packageWeightKg ?? null,
        shippingStatus: "to_pack",
        status: "TO_PACK",
        recipientName: order.recipientName,
        phone: order.phone,
        email: order.email,
        cpf: order.cpf,
        destinationCep: order.destinationCep,
        addressStreet: order.addressStreet,
        addressNumber: order.addressNumber,
        addressComplement: order.addressComplement,
        addressNeighborhood: order.addressNeighborhood,
        addressCity: order.addressCity,
        addressState: order.addressState,
        items: { create: itemRows },
      },
      include: RESHIP_INCLUDE,
    });

    await appendReshipmentEvent(tx, {
      reshipmentId: reshipment.id,
      type: "CREATED",
      actorUserId: input.createdByUserId,
      payload: { method: input.method, itemCount: itemRows.length },
    });

    return reshipment;
  });
}

export async function getOrderReshipment(id: string) {
  return prisma.orderReshipment.findUnique({
    where: { id },
    include: RESHIP_INCLUDE,
  });
}

export async function listOrderReshipments(orderId: string) {
  return prisma.orderReshipment.findMany({
    where: { orderId },
    include: RESHIP_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function cancelOrderReshipment(input: {
  reshipmentId: string;
  actorUserId: string;
  reason?: string | null;
}) {
  const row = await prisma.orderReshipment.findUnique({
    where: { id: input.reshipmentId },
  });
  if (!row) {
    throw new ReshipmentError("NOT_FOUND", "Reenvio não encontrado.");
  }
  if (row.status === "CANCELLED") {
    throw new ReshipmentError("CANCELLED", "Reenvio já cancelado.");
  }
  if (row.status === "SHIPPED" || row.status === "DELIVERED") {
    throw new ReshipmentError(
      "ALREADY_SENT",
      "Não é possível cancelar um reenvio já despachado."
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.orderReshipment.update({
      where: { id: row.id },
      data: {
        status: "CANCELLED",
        shippingStatus: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: input.reason?.trim() || null,
      },
      include: RESHIP_INCLUDE,
    });
    await appendReshipmentEvent(tx, {
      reshipmentId: row.id,
      type: "CANCELLED",
      actorUserId: input.actorUserId,
      payload: { reason: input.reason ?? null },
    });
    return next;
  });

  return updated;
}
