import { getMelhorEnvioConnectionStatus } from "@/lib/shipping/melhor-envio/auth";
import {
  isMelhorEnvioEnabled,
  SHIPPING_PROVIDERS,
  type ShippingProvider,
} from "@/lib/shipping/providers";
import { ShippingQuoteError } from "@/lib/shipping/types";

/**
 * Provedor usado em novas cotações.
 * Melhor Envio só entra se a flag estiver ligada e a conta autorizada.
 * Com MELHOR_ENVIO_ENABLED=true e conta desconectada, não faz fallback silencioso.
 */
export async function resolveActiveShippingProvider(): Promise<ShippingProvider> {
  if (!isMelhorEnvioEnabled()) {
    return SHIPPING_PROVIDERS.SUPERFRETE;
  }

  try {
    const status = await getMelhorEnvioConnectionStatus();
    if (!status.configured) {
      throw new ShippingQuoteError(
        "CONFIG",
        "Melhor Envio habilitado, mas CLIENT_ID/SECRET/REDIRECT_URI não estão configurados.",
        503
      );
    }
    if (!status.connected) {
      throw new ShippingQuoteError(
        "CONFIG",
        "Melhor Envio habilitado, mas a conta ainda não foi autorizada. Vá em Admin → Envios → Conectar.",
        503
      );
    }
    return SHIPPING_PROVIDERS.MELHOR_ENVIO;
  } catch (e) {
    if (e instanceof ShippingQuoteError) throw e;
    console.error("[shipping] falha ao checar Melhor Envio:", e);
    throw new ShippingQuoteError(
      "CONFIG",
      "Não foi possível usar o Melhor Envio. Verifique a conexão em Admin → Envios.",
      503,
      e
    );
  }
}
