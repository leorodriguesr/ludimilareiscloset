-- AlterTable
ALTER TABLE "ProductSection" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ProductSection_sectionId_order_idx" ON "ProductSection"("sectionId", "order");
