-- AlterTable: adiciona CPF do destinatário ao pedido
ALTER TABLE "Order" ADD COLUMN "cpf" TEXT;
