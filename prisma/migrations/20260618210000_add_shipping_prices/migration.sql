-- Add shipping price columns to Order
ALTER TABLE "Order" ADD COLUMN "shippingQuotedPrice" REAL;
ALTER TABLE "Order" ADD COLUMN "superfreteShippingPrice" REAL;
