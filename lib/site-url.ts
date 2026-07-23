/**
 * URL base pública da app (OAuth, absolutos, marketing).
 * Em dev sem variáveis, cai em localhost — não acessível pela internet.
 */
export function getAppBaseUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.PAYMENT_CALLBACK_BASE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ];

  for (const raw of candidates) {
    const normalized = normalizePublicBaseUrl(raw);
    if (!normalized) continue;
    // Em produção, nunca aceite localhost vindo de env de build local.
    if (process.env.NODE_ENV === "production" && isLocalhostUrl(normalized)) {
      continue;
    }
    return normalized;
  }

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[getAppBaseUrl] NEXT_PUBLIC_SITE_URL / VERCEL_URL ausentes em produção."
    );
  }
  return "http://localhost:3000";
}

function isLocalhostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0"
    );
  } catch {
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
  }
}

function normalizePublicBaseUrl(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return normalizeLocalhostProtocol(withProtocol);
}

/**
 * Localhost sem TLS: evita `https://localhost` (ERR_SSL_PROTOCOL_ERROR).
 */
export function normalizeLocalhostProtocol(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "0.0.0.0")
    ) {
      parsed.protocol = "http:";
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  return url.replace(/\/$/, "");
}

const LOCAL_RE = /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i;

/**
 * Base URL para `redirect_url` e `webhook_url` no checkout (InfinitePay e similares).
 * A InfinitePay chama o webhook por HTTP a partir da internet: **localhost nunca recebe** o POST.
 * Para testar local, use túnel (ex.: ngrok) e aponte `PAYMENT_CALLBACK_BASE_URL` (ou
 * `NEXT_PUBLIC_SITE_URL`) para a origem pública (https), para dev e produção o mesmo ajuste
 * basta a URL pública.
 *
 * Ordem: `PAYMENT_CALLBACK_BASE_URL` → `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → localhost
 */
export function getPaymentCallbackBaseUrl(): string {
  const onlyPayment = normalizePublicBaseUrl(
    process.env.PAYMENT_CALLBACK_BASE_URL
  );
  if (
    onlyPayment &&
    !(process.env.NODE_ENV === "production" && isLocalhostUrl(onlyPayment))
  ) {
    return onlyPayment;
  }
  return getAppBaseUrl();
}

/** True quando a origem de callback ainda aponta para host local (webhook inacessível). */
export function isLocalPaymentCallbackBaseUrl(): boolean {
  return LOCAL_RE.test(getPaymentCallbackBaseUrl());
}

/** Em dev local, webhook da InfinitePay não é entregue — confirmação via retorno em /pedido/[id]. */
export function shouldOmitInfinitePayWebhookOnLocalhost(): boolean {
  if (!isLocalPaymentCallbackBaseUrl()) return false;
  if (process.env.NODE_ENV === "production") return false;
  const flag = process.env.INFINITEPAY_SKIP_WEBHOOK_ON_LOCALHOST?.trim();
  if (flag === "0" || flag?.toLowerCase() === "false") return false;
  return true;
}

export function localPaymentDevNotice(): string | null {
  if (!isLocalPaymentCallbackBaseUrl() || process.env.NODE_ENV === "production") {
    return null;
  }
  return "Ambiente local: o pagamento será confirmado ao voltar para a loja (webhook não chega em localhost).";
}
