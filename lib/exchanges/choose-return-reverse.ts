import type { NormalizedShippingOption } from "@/lib/shipping/types";

/** PAC e SEDEX — únicos serviços com reversa oficial no Melhor Envio. */
export const CORREIOS_REVERSE_SERVICE_IDS = new Set([1, 2]);

export function isCorreiosReverseService(
  serviceId: number | null | undefined
): boolean {
  return serviceId != null && CORREIOS_REVERSE_SERVICE_IDS.has(serviceId);
}

export type ReturnReverseChoice = {
  correios: NormalizedShippingOption | null;
  cheapestOther: NormalizedShippingOption | null;
  useReverse: boolean;
};

export function chooseReturnReverse(
  options: NormalizedShippingOption[]
): ReturnReverseChoice {
  const valid = options.filter(
    (o) => o.serviceId != null && Number.isFinite(o.price) && o.price >= 0
  );
  const correiosOptions = valid.filter((o) =>
    isCorreiosReverseService(o.serviceId)
  );
  const otherOptions = valid.filter(
    (o) => !isCorreiosReverseService(o.serviceId)
  );

  const correios =
    correiosOptions.slice().sort((a, b) => a.price - b.price)[0] ?? null;
  const cheapestOther =
    otherOptions.slice().sort((a, b) => a.price - b.price)[0] ?? null;

  const useReverse =
    correios != null &&
    (cheapestOther == null || correios.price <= cheapestOther.price);

  return { correios, cheapestOther, useReverse };
}
