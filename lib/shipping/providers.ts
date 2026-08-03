export const SHIPPING_PROVIDERS = {
  SUPERFRETE: "SUPERFRETE",
  MELHOR_ENVIO: "MELHOR_ENVIO",
} as const;

export type ShippingProvider =
  (typeof SHIPPING_PROVIDERS)[keyof typeof SHIPPING_PROVIDERS];

export function isShippingProvider(value: unknown): value is ShippingProvider {
  return value === "SUPERFRETE" || value === "MELHOR_ENVIO";
}

/** True quando Melhor Envio está habilitado por env (ainda exige OAuth). */
export function isMelhorEnvioEnabled(): boolean {
  const flag = process.env.MELHOR_ENVIO_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function optionIdForProvider(
  provider: ShippingProvider,
  serviceId: number
): string {
  return provider === SHIPPING_PROVIDERS.MELHOR_ENVIO
    ? `me:${serviceId}`
    : `sf:${serviceId}`;
}

/** Resolve provedor a partir do optionId e/ou do resultado da cotação. */
export function resolveShippingProviderFromQuote(input: {
  optionId: string;
  quoteProvider?: ShippingProvider | null;
}): ShippingProvider {
  const parsed = parseShippingOptionId(input.optionId);
  return (
    parsed.provider ??
    (input.quoteProvider && isShippingProvider(input.quoteProvider)
      ? input.quoteProvider
      : null) ??
    SHIPPING_PROVIDERS.SUPERFRETE
  );
}

export function parseShippingOptionId(optionId: string): {
  provider: ShippingProvider | null;
  serviceId: number | null;
} {
  const trimmed = optionId.trim();
  const me = trimmed.match(/^me:(\d+)$/i);
  if (me) {
    return {
      provider: SHIPPING_PROVIDERS.MELHOR_ENVIO,
      serviceId: Number(me[1]),
    };
  }
  const sf = trimmed.match(/^sf:(\d+)$/i);
  if (sf) {
    return {
      provider: SHIPPING_PROVIDERS.SUPERFRETE,
      serviceId: Number(sf[1]),
    };
  }
  const n = Number(trimmed);
  if (Number.isFinite(n) && n > 0) {
    return { provider: null, serviceId: Math.floor(n) };
  }
  return { provider: null, serviceId: null };
}
