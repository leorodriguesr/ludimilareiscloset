-- Colunas de cotação (podem já existir em dev)
ALTER TABLE "Order" ADD COLUMN "shippingDeliveryDaysMin" INTEGER;
ALTER TABLE "Order" ADD COLUMN "shippingDeliveryDaysMax" INTEGER;
