-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN "freeShippingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreSettings" ADD COLUMN "freeShippingType" TEXT NOT NULL DEFAULT 'minimum_value';
ALTER TABLE "StoreSettings" ADD COLUMN "freeShippingMinValue" REAL NOT NULL DEFAULT 0;
