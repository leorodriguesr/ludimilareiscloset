-- AlterTable
ALTER TABLE "Product" ADD COLUMN "visibleOnSite" BOOLEAN NOT NULL DEFAULT true;

-- Cadastros rápidos (sem foto) ficam ocultos na vitrine
UPDATE "Product"
SET "visibleOnSite" = false
WHERE NOT EXISTS (
  SELECT 1 FROM "ProductImage" WHERE "ProductImage"."productId" = "Product"."id"
);
