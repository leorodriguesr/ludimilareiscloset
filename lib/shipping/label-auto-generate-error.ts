import { ShippingQuoteError } from "@/lib/shipping/types";
import { prisma } from "@/lib/prisma";

/** Grava detalhe técnico para tooltip no admin (sem mensagem longa na UI). */
export function formatLabelAutoGenerateError(error: unknown): string {
  if (error instanceof ShippingQuoteError) return error.message;
  if (error instanceof Error) return error.message;
  return "Erro ao gerar etiqueta automaticamente.";
}

export async function setLabelAutoGenerateError(
  orderId: string,
  message: string
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "Order" SET "labelAutoGenerateError" = ?, "updatedAt" = datetime('now') WHERE id = ?`,
    message.slice(0, 500),
    orderId
  );
}

export async function clearLabelAutoGenerateError(orderId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "Order" SET "labelAutoGenerateError" = NULL, "updatedAt" = datetime('now') WHERE id = ?`,
    orderId
  );
}
