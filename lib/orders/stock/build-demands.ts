import { StockType } from "@/app/generated/prisma/client";
import type { CartPieceSelection } from "@/lib/cart/types";
import { OrderCreateError } from "@/lib/orders/create-order";
import type { ResolvedOrderLine } from "@/lib/orders/recalculate-order";

export type StockDemand = {
  productId: string;
  pieceVariantId: string | null;
  quantity: number;
};

type VariantReader = {
  product: {
    findUnique: (args: {
      where: { id: string };
      select: {
        id: true;
        stockType: true;
        stockQuantity: true;
        pieces: {
          select: {
            name: true;
            variants: {
              select: {
                id: true;
                quantity: true;
                color: { select: { name: true } };
                size: { select: { name: true } };
              };
            };
          };
        };
      };
    }) => Promise<{
      id: string;
      stockType: StockType;
      stockQuantity: number | null;
      pieces: {
        name: string;
        variants: {
          id: string;
          quantity: number;
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

function findVariantId(
  variants: {
    id: string;
    color: { name: string };
    size: { name: string };
  }[],
  colorName: string | null,
  sizeName: string | null
): string | null {
  const match = variants.find(
    (v) =>
      (colorName == null || v.color.name === colorName) &&
      (sizeName == null || v.size.name === sizeName)
  );
  return match?.id ?? null;
}

/** Converte linhas do pedido em unidades de reserva (produto ou variante). */
export async function buildStockDemands(
  lines: ResolvedOrderLine[],
  db: VariantReader
): Promise<StockDemand[]> {
  const map = new Map<string, StockDemand>();

  for (const line of lines) {
    const product = await db.product.findUnique({
      where: { id: line.productId },
      select: {
        id: true,
        stockType: true,
        stockQuantity: true,
        pieces: {
          select: {
            name: true,
            variants: {
              select: {
                id: true,
                quantity: true,
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

        const variantId = findVariantId(
          piece.variants,
          sel.color,
          sel.size
        );
        if (!variantId) {
          throw new OrderCreateError(
            "VARIANT_NOT_FOUND",
            "Combinação de tamanho/cor indisponível."
          );
        }

        mergeDemand(map, {
          productId: product.id,
          pieceVariantId: variantId,
          quantity: line.quantity,
        });
      }
      continue;
    }

    mergeDemand(map, {
      productId: product.id,
      pieceVariantId: null,
      quantity: line.quantity,
    });
  }

  return [...map.values()];
}
