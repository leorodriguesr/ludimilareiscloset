-- AlterTable
ALTER TABLE "Exchange" ADD COLUMN "balanceAdjustmentAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Exchange" ADD COLUMN "balanceAdjustmentReason" TEXT;

-- AlterTable
ALTER TABLE "ExchangeShipping" ADD COLUMN "postingLocationName" TEXT;
ALTER TABLE "ExchangeShipping" ADD COLUMN "postingLocationAddress" TEXT;
ALTER TABLE "ExchangeShipping" ADD COLUMN "manualConfiguredAt" DATETIME;
