import {
  isShippingProvider,
  SHIPPING_PROVIDERS,
  type ShippingProvider,
} from "@/lib/shipping/providers";

function resolveProvider(
  provider?: string | null
): ShippingProvider {
  if (isShippingProvider(provider)) return provider;
  return SHIPPING_PROVIDERS.SUPERFRETE;
}

/** URL pública de rastreio conforme o provedor do pedido. */
export function shippingTrackingUrl(
  code: string,
  provider?: string | null
): string {
  const trimmed = code.trim();
  if (!trimmed) return "#";

  if (resolveProvider(provider) === SHIPPING_PROVIDERS.MELHOR_ENVIO) {
    return `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(trimmed)}`;
  }

  return `https://rastreamento.superfrete.com/#${encodeURIComponent(trimmed)}`;
}
