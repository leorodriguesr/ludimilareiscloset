-- AlterTable
ALTER TABLE "StockReservation" ADD COLUMN "exchangeId" TEXT;

-- CreateIndex
CREATE INDEX "StockReservation_exchangeId_idx" ON "StockReservation"("exchangeId");

-- AlterTable
ALTER TABLE "CashLedgerEntry" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CashLedgerEntry_idempotencyKey_key" ON "CashLedgerEntry"("idempotencyKey");
