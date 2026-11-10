-- CreateTable
CREATE TABLE "WhatsAppAdClick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phoneKey" TEXT NOT NULL,
    "phoneKeyAlt" TEXT,
    "waId" TEXT NOT NULL,
    "ctwaClid" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "clickedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "usedAt" DATETIME,
    "orderId" TEXT,
    "sentAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppAdClick_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAdClick_ctwaClid_key" ON "WhatsAppAdClick"("ctwaClid");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAdClick_orderId_key" ON "WhatsAppAdClick"("orderId");

-- CreateIndex
CREATE INDEX "WhatsAppAdClick_phoneKey_status_clickedAt_idx" ON "WhatsAppAdClick"("phoneKey", "status", "clickedAt");

-- CreateIndex
CREATE INDEX "WhatsAppAdClick_phoneKeyAlt_status_clickedAt_idx" ON "WhatsAppAdClick"("phoneKeyAlt", "status", "clickedAt");
