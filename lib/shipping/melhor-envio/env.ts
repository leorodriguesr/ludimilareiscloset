import {
  isSuperfreteProductionHost,
  type SuperfreteTarget,
} from "@/lib/shipping/superfrete-env";

export type MelhorEnvioTarget = SuperfreteTarget;

const API_ORIGINS: Record<MelhorEnvioTarget, string> = {
  sandbox: "https://sandbox.melhorenvio.com.br",
  production: "https://melhorenvio.com.br",
};

const WALLET_URLS: Record<MelhorEnvioTarget, string> = {
  sandbox: "https://sandbox.melhorenvio.com.br/painel/carteira",
  production: "https://melhorenvio.com.br/painel/carteira",
};

/**
 * Ambiente Melhor Envio ativo.
 * Local/staging → sandbox. Produção → MELHOR_ENVIO_TARGET ou production.
 */
export function resolveMelhorEnvioTarget(): MelhorEnvioTarget {
  if (!isSuperfreteProductionHost()) {
    return "sandbox";
  }
  const explicit = process.env.MELHOR_ENVIO_TARGET?.trim().toLowerCase();
  if (explicit === "sandbox" || explicit === "production") return explicit;
  return "production";
}

export function melhorEnvioApiOrigin(target = resolveMelhorEnvioTarget()): string {
  const override = process.env.MELHOR_ENVIO_API_ORIGIN?.trim();
  if (override) return override.replace(/\/$/, "");
  return API_ORIGINS[target];
}

export function melhorEnvioWalletUrl(target = resolveMelhorEnvioTarget()): string {
  const custom = process.env.MELHOR_ENVIO_WALLET_URL?.trim();
  if (custom) return custom;
  return WALLET_URLS[target];
}

export function melhorEnvioUserAgent(): string {
  return (
    process.env.MELHOR_ENVIO_USER_AGENT?.trim() ||
    "LudimilaReisCloset/1.0 (configure MELHOR_ENVIO_USER_AGENT)"
  );
}

export function readMelhorEnvioAppConfig() {
  const clientId = process.env.MELHOR_ENVIO_CLIENT_ID?.trim();
  const clientSecret = process.env.MELHOR_ENVIO_CLIENT_SECRET?.trim();
  const redirectUri = process.env.MELHOR_ENVIO_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    target: resolveMelhorEnvioTarget(),
    apiOrigin: melhorEnvioApiOrigin(),
    userAgent: melhorEnvioUserAgent(),
  };
}

export function melhorEnvioTargetLabel(target: MelhorEnvioTarget): string {
  return target === "sandbox" ? "Sandbox (testes)" : "Produção";
}

/** Scopes mínimos para cotação + etiqueta + rastreio + cancelamento. */
export const MELHOR_ENVIO_SCOPES = [
  "shipping-calculate",
  "cart-read",
  "cart-write",
  "shipping-checkout",
  "shipping-generate",
  "shipping-print",
  "shipping-tracking",
  "shipping-cancel",
  "shipping-companies",
  "shipping-preview",
].join(" ");
