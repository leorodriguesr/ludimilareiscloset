-- CreateTable
CREATE TABLE "Exchange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exchangeNumber" INTEGER,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_RETURN',
    "reason" TEXT NOT NULL,
    "reasonNotes" TEXT,
    "notes" TEXT,
    "openedByUserId" TEXT,
    "receivedAt" DATETIME,
    "inspectedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancellationReason" TEXT,
    "returnedItemsTotal" REAL NOT NULL DEFAULT 0,
    "newItemsTotal" REAL NOT NULL DEFAULT 0,
    "productsDelta" REAL NOT NULL DEFAULT 0,
    "shippingCustomerTotal" REAL NOT NULL DEFAULT 0,
    "balanceAmount" REAL NOT NULL DEFAULT 0,
    "balanceStatus" TEXT NOT NULL DEFAULT 'NONE',
    "balancePaidAt" DATETIME,
    "balancePaidByUserId" TEXT,
    "balanceNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Exchange_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Exchange_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exchangeId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "orderItemId" TEXT,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "productImageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    "lineTotal" REAL NOT NULL,
    "pieceSelectionsJson" TEXT,
    "pieceVariantId" TEXT,
    "disposition" TEXT,
    "stockRestored" BOOLEAN NOT NULL DEFAULT false,
    "stockDebited" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ExchangeItem_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeShipping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exchangeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "shippingServiceId" INTEGER,
    "shippingServiceName" TEXT,
    "quotedPrice" REAL,
    "cost" REAL,
    "paidBy" TEXT NOT NULL DEFAULT 'STORE',
    "trackingCode" TEXT,
    "superfreteShipmentId" TEXT,
    "superfreteStatus" TEXT,
    "labelUrl" TEXT,
    "labelGeneratedAt" DATETIME,
    "packageHeightCm" REAL,
    "packageWidthCm" REAL,
    "packageLengthCm" REAL,
    "packageWeightKg" REAL,
    "shippingStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExchangeShipping_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exchangeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorUserId" TEXT,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeEvent_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Exchange_orderId_idx" ON "Exchange"("orderId");

-- CreateIndex
CREATE INDEX "Exchange_status_idx" ON "Exchange"("status");

-- CreateIndex
CREATE INDEX "Exchange_createdAt_idx" ON "Exchange"("createdAt");

-- CreateIndex
CREATE INDEX "ExchangeItem_exchangeId_idx" ON "ExchangeItem"("exchangeId");

-- CreateIndex
CREATE INDEX "ExchangeItem_orderItemId_idx" ON "ExchangeItem"("orderItemId");

-- CreateIndex
CREATE INDEX "ExchangeItem_productId_idx" ON "ExchangeItem"("productId");

-- CreateIndex
CREATE INDEX "ExchangeShipping_exchangeId_idx" ON "ExchangeShipping"("exchangeId");

-- CreateIndex
CREATE INDEX "ExchangeShipping_type_idx" ON "ExchangeShipping"("type");

-- CreateIndex
CREATE INDEX "ExchangeEvent_exchangeId_createdAt_idx" ON "ExchangeEvent"("exchangeId", "createdAt");
