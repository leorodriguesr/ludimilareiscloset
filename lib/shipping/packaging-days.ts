import { prisma } from "@/lib/prisma";
import type { NormalizedShippingOption } from "@/lib/shipping/types";

/** Soma dias de embalagem ao prazo de cada opção de frete. */
export function applyPackagingDays(
  options: NormalizedShippingOption[],
  packagingDays: number,
): NormalizedShippingOption[] {
  const extra = Math.max(0, Math.floor(packagingDays));
  if (extra === 0) return options;

  return options.map((o) => ({
    ...o,
    deliveryDaysMin: o.deliveryDaysMin > 0 ? o.deliveryDaysMin + extra : o.deliveryDaysMin,
    deliveryDaysMax: o.deliveryDaysMax > 0 ? o.deliveryDaysMax + extra : o.deliveryDaysMax,
  }));
}

/** Lê dias de embalagem configurados no admin. */
export async function getPackagingDays(): Promise<number> {
  const settings = await prisma.storeSettings.findUnique({
    where: { id: "default" },
    select: { packagingDays: true },
  });
  return Math.max(0, Math.floor(settings?.packagingDays ?? 0));
}
