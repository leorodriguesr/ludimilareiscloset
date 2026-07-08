import { insertPieceVariantRow } from "@/lib/piece-variant-sql";
import { prisma } from "@/lib/prisma";

export type SyncPieceInput = {
  name: string;
  colors: { name: string; hex: string | null }[];
  sizes: { name: string }[];
  variants: { colorName: string; sizeName: string; quantity: number }[];
};

type PieceSyncTx = Pick<
  typeof prisma,
  | "productPiece"
  | "pieceColor"
  | "pieceSize"
  | "pieceVariant"
  | "stockReservation"
> & {
  $executeRaw: typeof prisma.$executeRaw;
};

type ExistingPiece = {
  id: string;
  name: string;
  colors: { id: string; name: string; hex: string | null }[];
  sizes: { id: string; name: string }[];
  variants: {
    id: string;
    quantity: number;
    colorId: string;
    sizeId: string;
    color: { name: string };
    size: { name: string };
  }[];
};

export function parsePiecesPayload(raw: unknown): SyncPieceInput[] {
  if (!Array.isArray(raw)) return [];

  const parsed: SyncPieceInput[] = [];

  for (const piece of raw) {
    const row = piece as {
      name?: unknown;
      colors?: unknown;
      sizes?: unknown;
      variants?: unknown;
    };
    const pieceName = typeof row?.name === "string" ? row.name.trim() : "";
    if (!pieceName) continue;

    const colorsIn = Array.isArray(row.colors) ? row.colors : [];
    const sizesIn = Array.isArray(row.sizes) ? row.sizes : [];
    const variantsRaw = Array.isArray(row.variants) ? row.variants : [];

    const colors: { name: string; hex: string | null }[] = [];
    for (const c of colorsIn) {
      const color = c as { name?: unknown; hex?: unknown };
      const name = typeof color?.name === "string" ? color.name.trim() : "";
      if (!name) continue;
      const hex =
        typeof color?.hex === "string" && color.hex.trim()
          ? color.hex.trim()
          : null;
      colors.push({ name, hex });
    }

    const sizes: { name: string }[] = [];
    for (const s of sizesIn) {
      const size = s as { name?: unknown };
      const name = typeof size?.name === "string" ? size.name.trim() : "";
      if (!name) continue;
      sizes.push({ name });
    }

    const variants: SyncPieceInput["variants"] = [];
    for (const vr of variantsRaw) {
      const variant = vr as {
        colorName?: unknown;
        sizeName?: unknown;
        quantity?: unknown;
      };
      const colorName =
        typeof variant.colorName === "string" ? variant.colorName.trim() : "";
      const sizeName =
        typeof variant.sizeName === "string" ? variant.sizeName.trim() : "";
      if (!colorName || !sizeName) continue;
      const q = Number(variant.quantity);
      variants.push({
        colorName,
        sizeName,
        quantity: Number.isFinite(q) && q >= 0 ? Math.floor(q) : 0,
      });
    }

    parsed.push({ name: pieceName, colors, sizes, variants });
  }

  return parsed;
}

function variantKey(colorName: string, sizeName: string): string {
  return `${colorName}\u0001${sizeName}`;
}

async function getReservedQuantity(
  tx: PieceSyncTx,
  variantId: string
): Promise<number> {
  const agg = await tx.stockReservation.aggregate({
    where: { pieceVariantId: variantId },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

async function assertVariantDeletable(
  tx: PieceSyncTx,
  variantId: string
): Promise<void> {
  const reserved = await getReservedQuantity(tx, variantId);
  if (reserved > 0) {
    throw new Error("ACTIVE_STOCK_RESERVATION");
  }
}

async function deleteProductPiece(
  tx: PieceSyncTx,
  pieceId: string
): Promise<void> {
  const variants = await tx.pieceVariant.findMany({
    where: { pieceId },
    select: { id: true },
  });

  for (const variant of variants) {
    await assertVariantDeletable(tx, variant.id);
  }

  await tx.pieceVariant.deleteMany({ where: { pieceId } });
  await tx.pieceColor.deleteMany({ where: { pieceId } });
  await tx.pieceSize.deleteMany({ where: { pieceId } });
  await tx.productPiece.delete({ where: { id: pieceId } });
}

async function createProductPiece(
  tx: PieceSyncTx,
  productId: string,
  input: SyncPieceInput
): Promise<void> {
  const created = await tx.productPiece.create({
    data: {
      name: input.name,
      productId,
      ...(input.colors.length > 0
        ? {
            colors: {
              create: input.colors.map((c) => ({
                name: c.name,
                hex: c.hex,
              })),
            },
          }
        : {}),
      ...(input.sizes.length > 0
        ? {
            sizes: {
              create: input.sizes.map((s) => ({ name: s.name })),
            },
          }
        : {}),
    },
    include: { colors: true, sizes: true },
  });

  const colorByName = new Map(created.colors.map((c) => [c.name, c]));
  const sizeByName = new Map(created.sizes.map((s) => [s.name, s]));

  for (const variant of input.variants) {
    const color = colorByName.get(variant.colorName);
    const size = sizeByName.get(variant.sizeName);
    if (!color || !size) continue;

    await insertPieceVariantRow(tx, {
      pieceId: created.id,
      colorId: color.id,
      sizeId: size.id,
      quantity: variant.quantity,
    });
  }
}

async function syncPieceVariants(
  tx: PieceSyncTx,
  piece: ExistingPiece,
  input: Pick<SyncPieceInput, "colors" | "sizes" | "variants">
): Promise<void> {
  const inputColorNames = new Set(input.colors.map((c) => c.name));
  const inputSizeNames = new Set(input.sizes.map((s) => s.name));

  const quantityByKey = new Map(
    input.variants.map((v) => [
      variantKey(v.colorName, v.sizeName),
      v.quantity,
    ])
  );

  const existingByKey = new Map(
    piece.variants.map((v) => [
      variantKey(v.color.name, v.size.name),
      v,
    ])
  );

  for (const variant of piece.variants) {
    const colorKept = inputColorNames.has(variant.color.name);
    const sizeKept = inputSizeNames.has(variant.size.name);
    if (colorKept && sizeKept) continue;

    await assertVariantDeletable(tx, variant.id);
    await tx.pieceVariant.delete({ where: { id: variant.id } });
    existingByKey.delete(variantKey(variant.color.name, variant.size.name));
  }

  const colorByName = new Map(piece.colors.map((c) => [c.name, c]));
  const sizeByName = new Map(piece.sizes.map((s) => [s.name, s]));

  for (const color of input.colors) {
    for (const size of input.sizes) {
      const key = variantKey(color.name, size.name);
      const dbColor = colorByName.get(color.name);
      const dbSize = sizeByName.get(size.name);
      if (!dbColor || !dbSize) continue;

      const existing = existingByKey.get(key);
      const nextQuantity = quantityByKey.has(key)
        ? quantityByKey.get(key)!
        : existing?.quantity ?? 0;

      if (existing) {
        if (nextQuantity !== existing.quantity) {
          const reserved = await getReservedQuantity(tx, existing.id);
          if (nextQuantity < reserved) {
            throw new Error("INSUFFICIENT_STOCK_FOR_RESERVATIONS");
          }
          await tx.pieceVariant.update({
            where: { id: existing.id },
            data: { quantity: nextQuantity },
          });
        }
        continue;
      }

      await insertPieceVariantRow(tx, {
        pieceId: piece.id,
        colorId: dbColor.id,
        sizeId: dbSize.id,
        quantity: nextQuantity,
      });
    }
  }
}

async function syncExistingPiece(
  tx: PieceSyncTx,
  existing: ExistingPiece,
  input: SyncPieceInput
): Promise<void> {
  const inputColorNames = new Set(input.colors.map((c) => c.name));
  const inputSizeNames = new Set(input.sizes.map((s) => s.name));
  const colorByName = new Map(existing.colors.map((c) => [c.name, c]));

  for (const color of input.colors) {
    const found = colorByName.get(color.name);
    if (found) {
      if (found.hex !== color.hex) {
        await tx.pieceColor.update({
          where: { id: found.id },
          data: { hex: color.hex },
        });
      }
      continue;
    }
    await tx.pieceColor.create({
      data: {
        name: color.name,
        hex: color.hex,
        pieceId: existing.id,
      },
    });
  }

  const sizeByName = new Map(existing.sizes.map((s) => [s.name, s]));
  for (const size of input.sizes) {
    if (sizeByName.has(size.name)) continue;
    await tx.pieceSize.create({
      data: {
        name: size.name,
        pieceId: existing.id,
      },
    });
  }

  let refreshed = await tx.productPiece.findUniqueOrThrow({
    where: { id: existing.id },
    include: {
      colors: true,
      sizes: true,
      variants: {
        include: { color: true, size: true },
      },
    },
  });

  await syncPieceVariants(tx, refreshed, input);

  refreshed = await tx.productPiece.findUniqueOrThrow({
    where: { id: existing.id },
    include: {
      colors: true,
      sizes: true,
      variants: {
        include: { color: true, size: true },
      },
    },
  });

  for (const color of refreshed.colors) {
    if (inputColorNames.has(color.name)) continue;
    const variants = refreshed.variants.filter((v) => v.colorId === color.id);
    if (variants.length > 0) {
      throw new Error("ACTIVE_STOCK_RESERVATION");
    }
    await tx.pieceColor.delete({ where: { id: color.id } });
  }

  for (const size of refreshed.sizes) {
    if (inputSizeNames.has(size.name)) continue;
    const variants = refreshed.variants.filter((v) => v.sizeId === size.id);
    if (variants.length > 0) {
      throw new Error("ACTIVE_STOCK_RESERVATION");
    }
    await tx.pieceSize.delete({ where: { id: size.id } });
  }
}

/**
 * Sincroniza peças/variantes incrementalmente, preservando IDs existentes.
 * Remove apenas o que saiu do payload e bloqueia se houver reserva ativa.
 */
export async function syncProductPieces(
  tx: PieceSyncTx,
  productId: string,
  rawPieces: unknown
): Promise<void> {
  const pieces = parsePiecesPayload(rawPieces);

  const existingPieces = await tx.productPiece.findMany({
    where: { productId },
    include: {
      colors: true,
      sizes: true,
      variants: {
        include: { color: true, size: true },
      },
    },
  });

  const payloadNames = new Set(pieces.map((p) => p.name));
  const existingByName = new Map(existingPieces.map((p) => [p.name, p]));

  for (const existing of existingPieces) {
    if (!payloadNames.has(existing.name)) {
      await deleteProductPiece(tx, existing.id);
    }
  }

  for (const piece of pieces) {
    const existing = existingByName.get(piece.name);
    if (existing) {
      await syncExistingPiece(tx, existing, piece);
    } else {
      await createProductPiece(tx, productId, piece);
    }
  }
}
