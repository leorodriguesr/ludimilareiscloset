-- Trava atômica para uma única definição de outbound.
ALTER TABLE "Exchange" ADD COLUMN "outboundDefinedAt" DATETIME;

UPDATE "Exchange"
SET "outboundDefinedAt" = COALESCE("inspectedAt", "updatedAt", CURRENT_TIMESTAMP)
WHERE EXISTS (
  SELECT 1
  FROM "ExchangeItem"
  WHERE "ExchangeItem"."exchangeId" = "Exchange"."id"
    AND "ExchangeItem"."direction" = 'OUTBOUND'
);

-- SQLite exige recriar a tabela para adicionar a FK de exchangeId.
PRAGMA foreign_keys=OFF;
PRAGMA defer_foreign_keys=ON;
BEGIN IMMEDIATE;

DROP TABLE IF EXISTS "new_StockReservation";
CREATE TABLE "new_StockReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "exchangeId" TEXT,
    "productId" TEXT NOT NULL,
    "pieceVariantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockReservation_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockReservation_pieceVariantId_fkey" FOREIGN KEY ("pieceVariantId") REFERENCES "PieceVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_StockReservation" (
  "id",
  "orderId",
  "exchangeId",
  "productId",
  "pieceVariantId",
  "quantity",
  "createdAt"
)
SELECT
  "id",
  "orderId",
  CASE
    WHEN "exchangeId" IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM "Exchange" WHERE "Exchange"."id" = "StockReservation"."exchangeId"
    ) THEN "exchangeId"
    ELSE NULL
  END,
  "productId",
  "pieceVariantId",
  "quantity",
  "createdAt"
FROM "StockReservation";

DROP TABLE "StockReservation";
ALTER TABLE "new_StockReservation" RENAME TO "StockReservation";

CREATE INDEX "StockReservation_orderId_idx" ON "StockReservation"("orderId");
CREATE INDEX "StockReservation_exchangeId_idx" ON "StockReservation"("exchangeId");
CREATE INDEX "StockReservation_productId_idx" ON "StockReservation"("productId");
CREATE INDEX "StockReservation_pieceVariantId_idx" ON "StockReservation"("pieceVariantId");

COMMIT;
PRAGMA foreign_keys=ON;
