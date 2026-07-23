-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentToken" TEXT;
ALTER TABLE "Order" ADD COLUMN "paymentTokenExpiresAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentToken_key" ON "Order"("paymentToken");
