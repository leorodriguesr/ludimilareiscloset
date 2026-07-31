import type { CartPieceSelection } from "@/lib/cart/types";
import {
  parsePieceSelections,
  serializePieceSelections,
} from "@/lib/exchanges/serialize";
import { ORDER_STATUS } from "@/lib/orders/constants";
import { OrderCreateError } from "@/lib/orders/create-order";
import { buildStockDemands } from "@/lib/orders/stock/build-demands";
import { getAvailableStock } from "@/lib/orders/stock/availability";
import {
  debitCommittedStock,
  restoreCommittedStock,
} from "@/lib/orders/stock/restore";
import {
  releaseStockReservations,
  reserveStockForOrderLines,
  type StockReservationLine,
} from "@/lib/orders/stock/reservation";
import { prisma } from "@/lib/prisma";
import { productFullInclude } from "@/lib/product-include";
import {
  buildCartPieceSelections,
  pieceSelectionMapFromCart,
  pieceSelectionsAreComplete,
} from "@/lib/product-piece-selection";
import type { ProductPiece } from "@/lib/types";

export class UpdatePieceSelectionsError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UpdatePieceSelectionsError";
    this.status = status;
  }
}

function selectionKey(row: CartPieceSelection): string {
  return `${row.pieceName}\0${row.color ?? ""}\0${row.size ?? ""}`;
}

function sameSelections(
  a: CartPieceSelection[],
  b: CartPieceSelection[]
): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(selectionKey));
  return b.every((row) => keys.has(selectionKey(row)));
}

function parseIncomingSelections(raw: unknown): CartPieceSelection[] {
  if (!Array.isArray(raw)) {
    throw new UpdatePieceSelectionsError("Informe as seleções de peças.");
  }
  return raw.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new UpdatePieceSelectionsError(`Seleção inválida (#${index + 1}).`);
    }
    const r = row as Record<string, unknown>;
    if (typeof r.pieceName !== "string" || !r.pieceName.trim()) {
      throw new UpdatePieceSelectionsError(`Seleção inválida (#${index + 1}).`);
    }
    const size =
      typeof r.size === "string" && r.size.trim() ? r.size.trim() : null;
    const color =
      typeof r.color === "string" && r.color.trim() ? r.color.trim() : null;
    return {
      pieceName: r.pieceName.trim(),
      size,
      color,
    };
  });
}

function validateCatalogSelections(
  pieces: ProductPiece[],
  incoming: CartPieceSelection[]
): CartPieceSelection[] {
  if (pieces.length === 0) {
    throw new UpdatePieceSelectionsError(
      "Este produto não tem opções de cor ou tamanho."
    );
  }

  const byName = new Map(pieces.map((p) => [p.name, p]));
  if (incoming.length !== pieces.length) {
    throw new UpdatePieceSelectionsError("Seleção de peças inválida.");
  }

  for (const sel of incoming) {
    const piece = byName.get(sel.pieceName);
    if (!piece) {
      throw new UpdatePieceSelectionsError(
        `Peça "${sel.pieceName}" não encontrada no produto.`
      );
    }
    if (sel.size && !piece.sizes.some((s) => s.name === sel.size)) {
      throw new UpdatePieceSelectionsError(
        `Tamanho "${sel.size}" indisponível para ${piece.name}.`
      );
    }
    if (sel.color && !piece.colors.some((c) => c.name === sel.color)) {
      throw new UpdatePieceSelectionsError(
        `Cor "${sel.color}" indisponível para ${piece.name}.`
      );
    }
  }

  const map = pieceSelectionMapFromCart(pieces, incoming);
  if (!pieceSelectionsAreComplete(pieces, map)) {
    throw new UpdatePieceSelectionsError(
      "Selecione cor e tamanho de cada peça."
    );
  }

  return buildCartPieceSelections(pieces, map);
}

/** Itens descritivos da venda avulsa: só cor/tamanho mudam; nomes das peças ficam iguais. */
function validateCustomSelections(
  current: CartPieceSelection[],
  incoming: CartPieceSelection[]
): CartPieceSelection[] {
  if (current.length === 0) {
    throw new UpdatePieceSelectionsError(
      "Este item não tem cor/tamanho para editar."
    );
  }
  if (incoming.length !== current.length) {
    throw new UpdatePieceSelectionsError(
      "Não é possível alterar a quantidade de peças do item."
    );
  }

  return current.map((base, index) => {
    const next = incoming[index]!;
    if (next.pieceName !== base.pieceName) {
      throw new UpdatePieceSelectionsError(
        "Não é possível alterar o nome das peças."
      );
    }
    return {
      pieceName: base.pieceName,
      size: next.size,
      color: next.color,
    };
  });
}

export async function updateOrderItemPieceSelections(input: {
  orderId: string;
  itemId: string;
  pieceSelections: unknown;
}): Promise<{ pieceSelectionsJson: string | null }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      status: true,
      labelUrl: true,
      superfreteShipmentId: true,
      shippingStatus: true,
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          price: true,
          pieceSelectionsJson: true,
        },
      },
    },
  });

  if (!order) {
    throw new UpdatePieceSelectionsError("Pedido não encontrado.", 404);
  }

  if (
    order.status === ORDER_STATUS.CANCELLED ||
    order.status === ORDER_STATUS.EXPIRED
  ) {
    throw new UpdatePieceSelectionsError(
      "Não é possível editar itens de um pedido cancelado ou expirado."
    );
  }

  if (order.labelUrl || order.superfreteShipmentId) {
    throw new UpdatePieceSelectionsError(
      "Não é possível alterar cor/tamanho após gerar a etiqueta. Cancele a etiqueta primeiro."
    );
  }

  if (
    order.shippingStatus === "shipped" ||
    order.shippingStatus === "delivered"
  ) {
    throw new UpdatePieceSelectionsError(
      "Não é possível alterar cor/tamanho de um pedido já enviado."
    );
  }

  const item = order.items.find((i) => i.id === input.itemId);
  if (!item) {
    throw new UpdatePieceSelectionsError("Item não encontrado.", 404);
  }

  const incoming = parseIncomingSelections(input.pieceSelections);
  const currentSelections = parsePieceSelections(item.pieceSelectionsJson);
  const isCustomItem = !item.productId;

  let nextSelections: CartPieceSelection[];

  if (isCustomItem) {
    nextSelections = validateCustomSelections(currentSelections, incoming);
  } else {
    const product = await prisma.product.findUnique({
      where: { id: item.productId! },
      include: productFullInclude,
    });
    if (!product) {
      throw new UpdatePieceSelectionsError(
        "Produto do item não está mais disponível."
      );
    }
    nextSelections = validateCatalogSelections(
      product.pieces as ProductPiece[],
      incoming
    );
  }

  if (sameSelections(currentSelections, nextSelections)) {
    return { pieceSelectionsJson: item.pieceSelectionsJson };
  }

  const nextJson = serializePieceSelections(nextSelections);

  // Item descritivo da venda avulsa: sem estoque vinculado.
  if (isCustomItem) {
    await prisma.orderItem.update({
      where: { id: item.id },
      data: { pieceSelectionsJson: nextJson },
    });
    return { pieceSelectionsJson: nextJson };
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (order.status === ORDER_STATUS.PENDING_PAYMENT) {
        await releaseStockReservations(tx, order.id);

        await tx.orderItem.update({
          where: { id: item.id },
          data: { pieceSelectionsJson: nextJson },
        });

        const stockLines: StockReservationLine[] = order.items
          .filter(
            (line): line is typeof line & { productId: string } =>
              typeof line.productId === "string" && line.productId.length > 0
          )
          .map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            price: line.price,
            pieceSelections:
              line.id === item.id
                ? nextSelections
                : parsePieceSelections(line.pieceSelectionsJson),
          }));

        await reserveStockForOrderLines(tx, order.id, stockLines);
        return;
      }

      if (order.status === ORDER_STATUS.PAID) {
        const oldDemands = await buildStockDemands(
          [
            {
              productId: item.productId!,
              quantity: item.quantity,
              price: item.price,
              pieceSelections: currentSelections,
            },
          ],
          tx
        );
        const newDemands = await buildStockDemands(
          [
            {
              productId: item.productId!,
              quantity: item.quantity,
              price: item.price,
              pieceSelections: nextSelections,
            },
          ],
          tx
        );

        await restoreCommittedStock(tx, oldDemands);

        for (const demand of newDemands) {
          const available = await getAvailableStock(tx, {
            productId: demand.productId,
            pieceVariantId: demand.pieceVariantId,
            excludeOrderId: order.id,
          });
          if (available < demand.quantity) {
            throw new OrderCreateError(
              "INSUFFICIENT_STOCK",
              "Estoque insuficiente para a combinação selecionada."
            );
          }
        }

        await debitCommittedStock(tx, newDemands);

        await tx.orderItem.update({
          where: { id: item.id },
          data: { pieceSelectionsJson: nextJson },
        });
        return;
      }

      throw new UpdatePieceSelectionsError(
        "Não é possível editar itens neste status do pedido."
      );
    });
  } catch (e) {
    if (e instanceof UpdatePieceSelectionsError) throw e;
    if (e instanceof OrderCreateError) {
      throw new UpdatePieceSelectionsError(e.message);
    }
    throw e;
  }

  return { pieceSelectionsJson: nextJson };
}
