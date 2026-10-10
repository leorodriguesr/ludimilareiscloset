-- AlterTable
ALTER TABLE "Product" ADD COLUMN "allowBackorder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "restockLeadDays" INTEGER;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "stockAllocatedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "backorderQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "restockLeadDaysSnapshot" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "stockAllocationJson" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "backorderReplenishedAt" DATETIME;
