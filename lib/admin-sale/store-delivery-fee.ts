import { prisma } from "@/lib/prisma";

/** Valor (R$) da entrega pelo entregador da loja nas vendas avulsas. */
export async function getStoreDeliveryFee(): Promise<number> {
  const settings = await prisma.storeSettings.findUnique({
    where: { id: "default" },
    select: { storeDeliveryFee: true },
  });
  const fee = settings?.storeDeliveryFee ?? 0;
  return Math.max(0, Math.round(fee * 100) / 100);
}
