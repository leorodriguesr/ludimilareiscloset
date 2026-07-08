-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- CreateTable OrderEvent
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorUserId" TEXT,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable User: GESTOR role (enum stored as TEXT)
-- SQLite: no ALTER for enum, new values work automatically

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "orderSource" TEXT NOT NULL DEFAULT 'CHECKOUT';
ALTER TABLE "Order" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "Order" ADD COLUMN "fulfillmentType" TEXT NOT NULL DEFAULT 'CARRIER';
ALTER TABLE "Order" ADD COLUMN "customerDataStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "customerDataToken" TEXT;
ALTER TABLE "Order" ADD COLUMN "customerDataTokenExpiresAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "paymentChannel" TEXT;
ALTER TABLE "Order" ADD COLUMN "manualPaidByUserId" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryNotes" TEXT;
ALTER TABLE "Order" ADD COLUMN "internalNotes" TEXT;
ALTER TABLE "Order" ADD COLUMN "arrangedShippedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "arrangedShippedByUserId" TEXT;
ALTER TABLE "Order" ADD COLUMN "subtotalOriginal" REAL;
ALTER TABLE "Order" ADD COLUMN "itemsDiscountTotal" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "orderDiscountMode" TEXT;
ALTER TABLE "Order" ADD COLUMN "orderDiscountValue" REAL;
ALTER TABLE "Order" ADD COLUMN "orderDiscountAmount" REAL NOT NULL DEFAULT 0;

-- AlterTable OrderItem
ALTER TABLE "OrderItem" ADD COLUMN "catalogListPrice" REAL;
ALTER TABLE "OrderItem" ADD COLUMN "catalogPromoPrice" REAL;
ALTER TABLE "OrderItem" ADD COLUMN "catalogUnitPrice" REAL;
ALTER TABLE "OrderItem" ADD COLUMN "itemDiscountMode" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "itemDiscountValue" REAL;
ALTER TABLE "OrderItem" ADD COLUMN "itemDiscountAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "lineSubtotalOriginal" REAL;
ALTER TABLE "OrderItem" ADD COLUMN "lineSubtotalFinal" REAL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_customerDataToken_key" ON "Order"("customerDataToken");
CREATE INDEX "Order_orderSource_idx" ON "Order"("orderSource");
CREATE INDEX "Order_fulfillmentType_idx" ON "Order"("fulfillmentType");
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
