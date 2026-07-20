-- AlterTable Exchange
ALTER TABLE "Exchange" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'EXCHANGE';

-- CreateIndex
CREATE INDEX "Exchange_kind_idx" ON "Exchange"("kind");

-- AlterTable PaymentAttempt
ALTER TABLE "PaymentAttempt" ADD COLUMN "exchangeId" TEXT;
ALTER TABLE "PaymentAttempt" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'order';

-- CreateIndex
CREATE INDEX "PaymentAttempt_exchangeId_status_idx" ON "PaymentAttempt"("exchangeId", "status");

-- CreateTable
-- Nota: FK via ALTER TABLE ADD CONSTRAINT não é suportada no SQLite/Turso.
-- As FKs de CashLedgerEntry ficam inline no CREATE (suportado).
CREATE TABLE "CashLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "orderId" TEXT,
    "exchangeId" TEXT,
    "paymentAttemptId" TEXT,
    "actorUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CashLedgerEntry_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CashLedgerEntry_createdAt_idx" ON "CashLedgerEntry"("createdAt");
CREATE INDEX "CashLedgerEntry_direction_createdAt_idx" ON "CashLedgerEntry"("direction", "createdAt");
CREATE INDEX "CashLedgerEntry_kind_idx" ON "CashLedgerEntry"("kind");
CREATE INDEX "CashLedgerEntry_orderId_idx" ON "CashLedgerEntry"("orderId");
CREATE INDEX "CashLedgerEntry_exchangeId_idx" ON "CashLedgerEntry"("exchangeId");
