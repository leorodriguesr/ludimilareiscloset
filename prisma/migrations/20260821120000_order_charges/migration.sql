-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "paidTotal" REAL NOT NULL DEFAULT 0;

-- AlterTable OrderItem
ALTER TABLE "OrderItem" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "OrderItem" ADD COLUMN "paidAt" DATETIME;
ALTER TABLE "OrderItem" ADD COLUMN "chargeId" TEXT;

-- AlterTable PaymentAttempt
ALTER TABLE "PaymentAttempt" ADD COLUMN "chargeId" TEXT;

-- CreateTable OrderCharge
CREATE TABLE "OrderCharge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL DEFAULT 'initial',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    CONSTRAINT "OrderCharge_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrderCharge_orderId_sequence_key" ON "OrderCharge"("orderId", "sequence");
CREATE INDEX "OrderCharge_orderId_status_idx" ON "OrderCharge"("orderId", "status");
CREATE INDEX "OrderItem_chargeId_idx" ON "OrderItem"("chargeId");
CREATE INDEX "PaymentAttempt_chargeId_idx" ON "PaymentAttempt"("chargeId");

-- Backfill
UPDATE "Order"
SET "paidTotal" = "total"
WHERE "status" = 'paid' OR "paidAt" IS NOT NULL;

INSERT INTO "OrderCharge" ("id", "orderId", "sequence", "amount", "status", "reason", "createdAt", "paidAt")
SELECT
  'chg_' || "id",
  "id",
  1,
  "total",
  CASE WHEN "status" = 'paid' OR "paidAt" IS NOT NULL THEN 'paid' ELSE 'pending' END,
  'initial',
  "createdAt",
  "paidAt"
FROM "Order";

UPDATE "OrderItem"
SET
  "chargeId" = 'chg_' || "orderId",
  "paymentStatus" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "Order" o
      WHERE o."id" = "OrderItem"."orderId"
        AND (o."status" = 'paid' OR o."paidAt" IS NOT NULL)
    ) THEN 'paid'
    ELSE 'pending'
  END,
  "paidAt" = (
    SELECT o."paidAt" FROM "Order" o WHERE o."id" = "OrderItem"."orderId"
  )
WHERE EXISTS (
  SELECT 1 FROM "Order" o WHERE o."id" = "OrderItem"."orderId"
);

UPDATE "PaymentAttempt"
SET "chargeId" = 'chg_' || "orderId"
WHERE "purpose" = 'order';
