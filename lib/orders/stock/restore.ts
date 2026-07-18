import { StockType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type RestoreTx = Pick<
  typeof prisma,
  "product" | "pieceVariant" | "$executeRawUnsafe"
>;

export type StockRestoreLine = {
  productId: string;
  pieceVariantId: string | null;
  quantity: number;
};

async function syncProductStockQuantityFromVariants(
  tx: RestoreTx,
  productId: string
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: {
      stockType: true,
      pieces: {
        select: {
          variants: { select: { quantity: true } },
        },
      },
    },
  });

  if (!product || product.stockType !== StockType.LIMITED) return;

  const hasVariants = product.pieces.some((p) => p.variants.length > 0);
  if (!hasVariants) return;

  const sum = product.pieces.reduce(
    (acc, p) => acc + p.variants.reduce((a, v) => a + v.quantity, 0),
    0
  );

  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: sum },
  });
}

/** Devolve quantidade ao estoque físico (espelho do commit). */
export async function restoreCommittedStock(
  tx: RestoreTx,
  lines: StockRestoreLine[]
): Promise<void> {
  if (lines.length === 0) return;

  const productIds = new Set<string>();

  for (const line of lines) {
    if (line.quantity <= 0) continue;
    productIds.add(line.productId);

    if (line.pieceVariantId) {
      await tx.$executeRawUnsafe(
        `UPDATE "PieceVariant"
         SET "quantity" = "quantity" + ?
         WHERE "id" = ?`,
        line.quantity,
        line.pieceVariantId
      );
    } else {
      await tx.$executeRawUnsafe(
        `UPDATE "Product"
         SET "stockQuantity" = COALESCE("stockQuantity", 0) + ?,
             "updatedAt" = datetime('now')
         WHERE "id" = ? AND "stockType" = ?`,
        line.quantity,
        line.productId,
        StockType.LIMITED
      );
    }
  }

  for (const productId of productIds) {
    await syncProductStockQuantityFromVariants(tx, productId);
  }
}

/** Debita estoque físico diretamente (sem reserva). */
export async function debitCommittedStock(
  tx: RestoreTx,
  lines: StockRestoreLine[]
): Promise<void> {
  if (lines.length === 0) return;

  const productIds = new Set<string>();

  for (const line of lines) {
    if (line.quantity <= 0) continue;
    productIds.add(line.productId);

    if (line.pieceVariantId) {
      await tx.$executeRawUnsafe(
        `UPDATE "PieceVariant"
         SET "quantity" = MAX(0, "quantity" - ?)
         WHERE "id" = ?`,
        line.quantity,
        line.pieceVariantId
      );
    } else {
      await tx.$executeRawUnsafe(
        `UPDATE "Product"
         SET "stockQuantity" = MAX(0, COALESCE("stockQuantity", 0) - ?),
             "updatedAt" = datetime('now')
         WHERE "id" = ? AND "stockType" = ?`,
        line.quantity,
        line.productId,
        StockType.LIMITED
      );
    }
  }

  for (const productId of productIds) {
    await syncProductStockQuantityFromVariants(tx, productId);
  }
}
