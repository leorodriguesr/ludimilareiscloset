/**
 * URL base pública da app (OAuth, absolutos, marketing).
 * Em dev sem variáveis, cai em localhost — não acessível pela internet.
 */
export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
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
  const onlyPayment =
    process.env.PAYMENT_CALLBACK_BASE_URL?.trim().replace(/\/$/, "");
  if (onlyPayment) return onlyPayment;
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
