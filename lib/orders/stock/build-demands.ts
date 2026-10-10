import { StockType } from "@/app/generated/prisma/client";
import { OrderCreateError } from "@/lib/orders/create-order";
import type { StockReservationLine } from "@/lib/orders/stock/reservation";

export type StockDemand = {
  productId: string;
  pieceVariantId: string | null;
  quantity: number;
};

export type DetailedStockDemand = StockDemand & {
  lineIndex: number;
  productName: string;
  allowBackorder: boolean;
  restockLeadDays: number | null;
  pieceName: string | null;
  colorName: string | null;
  sizeName: string | null;
  unlimited: boolean;
};

type VariantReader = {
  product: {
    findUnique: (args: {
      where: { id: string };
      select: {
        id: true;
        name: true;
        stockType: true;
        stockQuantity: true;
        allowBackorder: true;
        restockLeadDays: true;
        pieces: {
          select: {
            name: true;
            variants: {
              select: {
                id: true;
                quantity: true;
                unlimited: true;
                color: { select: { name: true } };
                size: { select: { name: true } };
              };
            };
          };
        };
      };
    }) => Promise<{
      id: string;
      name: string;
      stockType: StockType;
      stockQuantity: number | null;
      allowBackorder: boolean;
      restockLeadDays: number | null;
      pieces: {
        name: string;
        variants: {
          id: string;
          quantity: number;
          unlimited: boolean;
          color: { name: string };
          size: { name: string };
        }[];
      }[];
    } | null>;
  };
};

function mergeDemand(
  map: Map<string, StockDemand>,
  demand: StockDemand
): void {
  const key = `${demand.productId}:${demand.pieceVariantId ?? ""}`;
  const prev = map.get(key);
  if (prev) {
    prev.quantity += demand.quantity;
  } else {
    map.set(key, { ...demand });
  }
}

function findVariant(
  variants: {
    id: string;
    unlimited: boolean;
    color: { name: string };
    size: { name: string };
  }[],
  colorName: string | null,
  sizeName: string | null
) {
  return (
    variants.find(
      (v) =>
        (colorName == null || v.color.name === colorName) &&
        (sizeName == null || v.size.name === sizeName)
    ) ?? null
  );
}

/** Converte linhas do pedido em unidades de reserva (produto ou variante). */
export async function buildStockDemands(
  lines: StockReservationLine[],
  db: VariantReader
): Promise<StockDemand[]> {
  const map = new Map<string, StockDemand>();
  const detailed = await buildDetailedStockDemands(lines, db);
  for (const demand of detailed) {
    if (demand.unlimited) continue;
    mergeDemand(map, demand);
  }
  return [...map.values()];
}

/** Demandas sem agrupamento, preservando a linha e a variação para registrar reposição. */
export async function buildDetailedStockDemands(
  lines: StockReservationLine[],
  db: VariantReader
): Promise<DetailedStockDemand[]> {
  const out: DetailedStockDemand[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    const product = await db.product.findUnique({
      where: { id: line.productId },
      select: {
        id: true,
        name: true,
        stockType: true,
        stockQuantity: true,
        allowBackorder: true,
        restockLeadDays: true,
        pieces: {
          select: {
            name: true,
            variants: {
              select: {
                id: true,
                quantity: true,
                unlimited: true,
                color: { select: { name: true } },
                size: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new OrderCreateError(
        "PRODUCT_NOT_FOUND",
        "Um dos produtos não está mais disponível."
      );
    }

    if (product.stockType === StockType.UNLIMITED) {
      out.push({
        lineIndex,
        productId: product.id,
        productName: product.name,
        pieceVariantId: null,
        quantity: line.quantity,
        allowBackorder: false,
        restockLeadDays: null,
        pieceName: null,
        colorName: null,
        sizeName: null,
        unlimited: true,
      });
      continue;
    }

    const hasVariantMatrix = product.pieces.some((p) => p.variants.length > 0);

    if (hasVariantMatrix) {
      const selections = line.pieceSelections ?? [];
      if (selections.length === 0) {
        throw new OrderCreateError(
          "VARIANT_REQUIRED",
          "Selecione tamanho e cor para continuar."
        );
      }

      for (const sel of selections) {
        const piece = product.pieces.find((p) => p.name === sel.pieceName);
        if (!piece || piece.variants.length === 0) {
          continue;
        }

        const variant = findVariant(piece.variants, sel.color, sel.size);
        if (!variant) {
          throw new OrderCreateError(
            "VARIANT_NOT_FOUND",
            "Combinação de tamanho/cor indisponível."
          );
        }
        out.push({
          lineIndex,
          productId: product.id,
          productName: product.name,
          pieceVariantId: variant.id,
          quantity: line.quantity,
          allowBackorder: product.allowBackorder,
          restockLeadDays: product.restockLeadDays,
          pieceName: piece.name,
          colorName: variant.color.name,
          sizeName: variant.size.name,
          unlimited: variant.unlimited,
        });
      }
      continue;
    }

    out.push({
      lineIndex,
      productId: product.id,
      productName: product.name,
      pieceVariantId: null,
      quantity: line.quantity,
      allowBackorder: product.allowBackorder,
      restockLeadDays: product.restockLeadDays,
      pieceName: null,
      colorName: null,
      sizeName: null,
      unlimited: false,
    });
  }

  return out;
}
