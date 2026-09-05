import type { CartPieceSelection } from "@/lib/cart/types";
import { ExchangeError } from "@/lib/exchanges/constants";
import { roundMoney } from "@/lib/exchanges/product-diff";
import {
  parsePieceSelections,
  serializePieceSelections,
} from "@/lib/exchanges/serialize";
import { OrderCreateError } from "@/lib/orders/create-order";
import { getAvailableStock } from "@/lib/orders/stock/availability";
import { buildStockDemands } from "@/lib/orders/stock/build-demands";
import { prisma } from "@/lib/prisma";

export type CreateExchangeOutboundCatalogLine = {
  kind?: "catalog";
  productId: string;
  quantity: number;
  unitPrice?: number;
  lineRole?: "REPLACEMENT" | "ADDITIONAL_SALE";
  pieceSelections?: CartPieceSelection[];
};

export type CreateExchangeOutboundCustomLine = {
  kind: "custom";
  description: string;
  quantity: number;
  unitPrice: number;
  lineRole?: "REPLACEMENT" | "ADDITIONAL_SALE";
  pieces?: { name: string; size: string; color: string }[];
};

export type CreateExchangeOutboundLine =
  | CreateExchangeOutboundCatalogLine
  | CreateExchangeOutboundCustomLine;

export type OutboundRow = {
  productId: string | null;
  productName: string;
  productImageUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  pieceSelectionsJson: string | null;
  pieceVariantId: string | null;
  lineRole: "REPLACEMENT" | "ADDITIONAL_SALE";
};

export async function resolveOutboundRows(
  lines: CreateExchangeOutboundLine[],
  excludeOrderId: string,
  excludeExchangeId?: string | null
): Promise<OutboundRow[]> {
  const outboundRows: OutboundRow[] = [];

  for (const line of lines) {
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
        lineRole:
          line.lineRole === "ADDITIONAL_SALE" ? "ADDITIONAL_SALE" : "REPLACEMENT",
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
      lineRole:
        line.lineRole === "ADDITIONAL_SALE" ? "ADDITIONAL_SALE" : "REPLACEMENT",
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
        excludeOrderId: excludeExchangeId ? null : excludeOrderId,
        excludeExchangeId,
        now,
      });
      if (available < demand.quantity) {
        throw new ExchangeError(
          "INSUFFICIENT_STOCK",
          "Estoque insuficiente para um dos itens de saída."
        );
      }
    }

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
  } catch (e) {
    if (e instanceof ExchangeError) throw e;
    if (e instanceof OrderCreateError) {
      throw new ExchangeError(e.code, e.message);
    }
    throw e;
  }

  return outboundRows;
}
