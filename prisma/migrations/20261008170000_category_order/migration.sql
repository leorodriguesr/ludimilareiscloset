-- AlterTable
ALTER TABLE "Category" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- Mantém a ordem alfabética atual como posição inicial.
UPDATE "Category"
SET "order" = (
  SELECT COUNT(*)
  FROM "Category" AS earlier
  WHERE earlier.name < "Category".name
     OR (earlier.name = "Category".name AND earlier.id < "Category".id)
);
