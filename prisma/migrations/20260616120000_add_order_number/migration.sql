-- AlterTable: adiciona número sequencial de pedido
ALTER TABLE "Order" ADD COLUMN "orderNumber" INTEGER;

-- Retroativamente preenche os pedidos existentes em ordem crescente de criação
UPDATE "Order"
SET "orderNumber" = (
  SELECT COUNT(*)
  FROM "Order" o2
  WHERE o2."createdAt" < "Order"."createdAt"
     OR (o2."createdAt" = "Order"."createdAt" AND o2."id" <= "Order"."id")
);
