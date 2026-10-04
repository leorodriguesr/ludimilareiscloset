import { randomUUID } from "node:crypto";

/** Cliente com `$executeRaw` (PrismaClient ou cliente de transação interativa). */
type SqlClient = {
  $executeRaw(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
};

export function insertPieceVariantRow(
  tx: SqlClient,
  args: {
    pieceId: string;
    colorId: string;
    sizeId: string;
    quantity: number;
    unlimited?: boolean;
  }
): Promise<number> {
  const id = randomUUID();
  const unlimited = args.unlimited ? 1 : 0;
  return tx.$executeRaw`
    INSERT INTO "PieceVariant" ("id", "quantity", "unlimited", "pieceId", "colorId", "sizeId")
    VALUES (${id}, ${args.quantity}, ${unlimited}, ${args.pieceId}, ${args.colorId}, ${args.sizeId})
  `;
}

export async function deletePieceVariantsForPiece(
  tx: SqlClient,
  pieceId: string
): Promise<void> {
  await tx.$executeRaw`
    DELETE FROM "PieceVariant" WHERE "pieceId" = ${pieceId}
  `;
}
