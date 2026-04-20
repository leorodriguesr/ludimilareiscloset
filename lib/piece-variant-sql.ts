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
  }
): Promise<number> {
  const id = randomUUID();
  return tx.$executeRaw`
    INSERT INTO "PieceVariant" ("id", "quantity", "pieceId", "colorId", "sizeId")
    VALUES (${id}, ${args.quantity}, ${args.pieceId}, ${args.colorId}, ${args.sizeId})
  `;
}

export function deletePieceVariantsForPiece(
  tx: SqlClient,
  pieceId: string
): Promise<number> {
  return tx.$executeRaw`
    DELETE FROM "PieceVariant" WHERE "pieceId" = ${pieceId}
  `;
}
