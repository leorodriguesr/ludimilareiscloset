import { prisma } from "@/lib/prisma";
import { normalizePostalCode } from "@/lib/shipping/superfrete";
import type { NormalizedShippingOption } from "@/lib/shipping/types";

export const LOCAL_DELIVERY_OPTION_ID = "local:store_delivery";
export const LOCAL_PICKUP_OPTION_ID = "local:pickup";

const LOCAL_IBGE_CODES = new Set(["5208707", "5201405"]);
const cache = new Map<string, { local: boolean; expiresAt: number }>();

type ViaCepResponse = {
  erro?: boolean;
  uf?: string;
  localidade?: string;
  ibge?: string;
};

export function isLocalViaCepResponse(data: ViaCepResponse): boolean {
  const city = (data.localidade ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return (
    !data.erro &&
    data.uf?.toUpperCase() === "GO" &&
    (LOCAL_IBGE_CODES.has(data.ibge ?? "") ||
      city === "goiania" ||
      city === "aparecida de goiania")
  );
}

export function isLocalShippingOption(optionId: string): boolean {
  return (
    optionId === LOCAL_DELIVERY_OPTION_ID ||
    optionId === LOCAL_PICKUP_OPTION_ID
  );
}

export async function isLocalDeliveryCep(rawCep: string): Promise<boolean> {
  const cep = normalizePostalCode(rawCep);
  if (!cep) return false;

  const cached = cache.get(cep);
  if (cached && cached.expiresAt > Date.now()) return cached.local;

  let local = false;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: 86_400 },
    });
    if (response.ok) {
      const data = (await response.json()) as ViaCepResponse;
      local = isLocalViaCepResponse(data);
    }
  } catch {
    local = false;
  }

  cache.set(cep, { local, expiresAt: Date.now() + 60 * 60 * 1_000 });
  return local;
}

export async function localShippingOptions(
  rawCep: string
): Promise<NormalizedShippingOption[]> {
  if (!(await isLocalDeliveryCep(rawCep))) return [];

  const settings = await prisma.storeSettings.findUnique({
    where: { id: "default" },
    select: { storeDeliveryFee: true },
  });
  const fee = Math.max(0, settings?.storeDeliveryFee ?? 0);

  return [
    {
      id: LOCAL_DELIVERY_OPTION_ID,
      serviceId: null,
      carrierName: "Loja",
      serviceName: "Entregador da loja",
      price: fee,
      deliveryDaysMin: 0,
      deliveryDaysMax: 0,
      fulfillmentType: "ARRANGED",
      localMethod: "STORE_DELIVERY",
      description: "A loja entrará em contato para agendar a entrega.",
    },
    {
      id: LOCAL_PICKUP_OPTION_ID,
      serviceId: null,
      carrierName: "Loja",
      serviceName: "Retirada na loja",
      price: 0,
      deliveryDaysMin: 0,
      deliveryDaysMax: 0,
      fulfillmentType: "ARRANGED",
      localMethod: "PICKUP",
      description: "A loja entrará em contato para agendar a retirada.",
    },
  ];
}
