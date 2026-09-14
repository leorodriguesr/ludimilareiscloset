-- CreateTable
CREATE TABLE "OrderReshipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TO_PACK',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'CARRIER',
    "paidBy" TEXT NOT NULL DEFAULT 'STORE',
    "shippingServiceId" INTEGER,
    "shippingServiceName" TEXT,
    "quotedPrice" REAL,
    "cost" REAL,
    "trackingCode" TEXT,
    "superfreteShipmentId" TEXT,
    "superfreteStatus" TEXT,
    "labelUrl" TEXT,
    "labelGeneratedAt" DATETIME,
    "packageHeightCm" REAL,
    "packageWidthCm" REAL,
    "packageLengthCm" REAL,
    "packageWeightKg" REAL,
    "shippingStatus" TEXT NOT NULL DEFAULT 'to_pack',
    "recipientName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "cpf" TEXT,
    "destinationCep" TEXT,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressComplement" TEXT,
    "addressNeighborhood" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "packedAt" DATETIME,
    "shippedAt" DATETIME,
    "deliveredAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancellationReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderReshipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderReshipment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderReshipmentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reshipmentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "productImageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    "pieceSelectionsJson" TEXT,
    CONSTRAINT "OrderReshipmentItem_reshipmentId_fkey" FOREIGN KEY ("reshipmentId") REFERENCES "OrderReshipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderReshipmentItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderReshipmentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reshipmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorUserId" TEXT,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderReshipmentEvent_reshipmentId_fkey" FOREIGN KEY ("reshipmentId") REFERENCES "OrderReshipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OrderReshipment_orderId_idx" ON "OrderReshipment"("orderId");

-- CreateIndex
CREATE INDEX "OrderReshipment_status_idx" ON "OrderReshipment"("status");

-- CreateIndex
CREATE INDEX "OrderReshipment_createdAt_idx" ON "OrderReshipment"("createdAt");

-- CreateIndex
CREATE INDEX "OrderReshipment_superfreteShipmentId_idx" ON "OrderReshipment"("superfreteShipmentId");

-- CreateIndex
CREATE INDEX "OrderReshipmentItem_reshipmentId_idx" ON "OrderReshipmentItem"("reshipmentId");

-- CreateIndex
CREATE INDEX "OrderReshipmentItem_orderItemId_idx" ON "OrderReshipmentItem"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderReshipmentEvent_reshipmentId_createdAt_idx" ON "OrderReshipmentEvent"("reshipmentId", "createdAt");
