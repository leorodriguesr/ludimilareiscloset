-- Checkout refactor Fase 1: PaymentAttempt, StockReservation, Order expiry/audit fields

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "expiredAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "lastRecalculatedAt" DATETIME;

CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");
CREATE INDEX "Order_email_status_idx" ON "Order"("email", "status");
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");

-- CreateTable PaymentAttempt
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "gatewayReference" TEXT,
    "gatewayTransactionId" TEXT,
    "failureReason" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PaymentAttempt_orderId_attemptNumber_key" ON "PaymentAttempt"("orderId", "attemptNumber");
CREATE UNIQUE INDEX "PaymentAttempt_gateway_gatewayReference_key" ON "PaymentAttempt"("gateway", "gatewayReference");
CREATE INDEX "PaymentAttempt_orderId_status_idx" ON "PaymentAttempt"("orderId", "status");
CREATE INDEX "PaymentAttempt_gatewayReference_idx" ON "PaymentAttempt"("gatewayReference");

-- CreateTable StockReservation
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "pieceVariantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockReservation_pieceVariantId_fkey" FOREIGN KEY ("pieceVariantId") REFERENCES "PieceVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StockReservation_orderId_idx" ON "StockReservation"("orderId");
CREATE INDEX "StockReservation_productId_idx" ON "StockReservation"("productId");
CREATE INDEX "StockReservation_pieceVariantId_idx" ON "StockReservation"("pieceVariantId");
