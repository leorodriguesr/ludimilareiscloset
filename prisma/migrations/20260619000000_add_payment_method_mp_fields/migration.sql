-- Add paymentMethod and mercadoPagoPaymentId to Order
ALTER TABLE "Order" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Order" ADD COLUMN "mercadoPagoPaymentId" TEXT;
