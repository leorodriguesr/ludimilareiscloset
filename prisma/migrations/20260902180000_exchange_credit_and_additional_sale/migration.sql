-- AlterTable
ALTER TABLE "Exchange" ADD COLUMN "additionalSaleItemsTotal" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Exchange" ADD COLUMN "additionalSaleItemCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Exchange" ADD COLUMN "additionalSaleRecognizedAt" DATETIME;

-- AlterTable
ALTER TABLE "ExchangeItem" ADD COLUMN "lineRole" TEXT NOT NULL DEFAULT 'REPLACEMENT';
