-- AlterTable
ALTER TABLE "Order" ADD COLUMN "shippingStatus" TEXT NOT NULL DEFAULT 'to_pack';
ALTER TABLE "Order" ADD COLUMN "superfreteShipmentId" TEXT;
ALTER TABLE "Order" ADD COLUMN "labelUrl" TEXT;
