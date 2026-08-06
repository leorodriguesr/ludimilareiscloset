import { getPaymentCallbackBaseUrl } from "@/lib/site-url";

const LINKS_PATH = "/links";
const PAYMENT_CHECK_PATH = "/payment_check";

function apiBase(): string {
  const raw =
    process.env.INFINITEPAY_API_BASE?.trim() ||
    "https://api.checkout.infinitepay.io";
  return raw.replace(/\/$/, "");
}

export function getInfinitePayHandle(): string {
  const h = process.env.INFINITEPAY_HANDLE?.trim().replace(/^\$+/, "");
  if (!h) {
    throw new Error("INFINITEPAY_HANDLE não configurado.");
  }
  return h;
}

export type InfinitePayLinkItem = {
  quantity: number;
  price: number;
  description: string;
};

export type CreateInfinitePayLinkInput = {
  items: InfinitePayLinkItem[];
  orderNsu: string;
  redirectUrl: string;
  webhookUrl: string;
  customer?: {
    name: string;
    email: string;
    phone_number?: string;
  };
  address?: {
    cep: string;
    street?: string;
    neighborhood?: string;
    number?: string;
    complement?: string;
  };
};

export type CreateInfinitePayLinkResult = {
  checkoutUrl: string;
  slug: string | null;
};

function pickCheckoutUrl(data: Record<string, unknown>): string | null {
  const link = data.link;
  if (typeof link === "string" && link.startsWith("http")) return link;
  const checkoutUrl = data.checkout_url;
  if (typeof checkoutUrl === "string" && checkoutUrl.startsWith("http")) {
    return checkoutUrl;
  }
  const url = data.url;
  if (typeof url === "string" && url.startsWith("http")) return url;
  return null;
}

function pickSlug(data: Record<string, unknown>): string | null {
  const slug = data.slug;
  if (typeof slug === "string" && slug.length > 0) return slug;
  return null;
}

function gatewayReferenceFromCheckoutUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Checkout moderno usa `lenc`; `slug` é o código da fatura (payment_check).
    for (const key of ["lenc", "slug"]) {
      const value = parsed.searchParams.get(key)?.trim();
      if (value) return value;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function checkoutUrlUsesLegacySlugOnly(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      Boolean(parsed.searchParams.get("slug")?.trim()) &&
      !parsed.searchParams.get("lenc")?.trim()
    );
  } catch {
    return true;
  }
}

function validateInfinitePayItems(items: InfinitePayLinkItem[]): void {
  if (items.length === 0) {
    throw new Error("O pagamento precisa ter ao menos um item.");
  }
  for (const item of items) {
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      !Number.isInteger(item.price) ||
      item.price < 1 ||
      !item.description.trim()
    ) {
      throw new Error("Há itens inválidos para o checkout da InfinitePay.");
    }
  }
}

/**
 * Referência persistida da tentativa InfinitePay.
 * Preferimos a URL completa do checkout — remontar com `?slug=` gera
 * "Invalid checkout link params" no checkout atual (que espera `lenc`).
 */
export function extractInfinitePayGatewayReference(input: {
  response: Record<string, unknown>;
  checkoutUrl: string;
}): string | null {
  const checkoutUrl = input.checkoutUrl.trim();
  if (/^https?:\/\//i.test(checkoutUrl)) return checkoutUrl;
  return (
    gatewayReferenceFromCheckoutUrl(checkoutUrl) ?? pickSlug(input.response)
  );
}

/** Extrai `lenc` / `slug` de uma URL ou devolve a própria referência. */
export function expandInfinitePayPaymentReferences(
  references: Array<string | null | undefined>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of references) {
    const ref = raw?.trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    out.push(ref);
    if (!/^https?:\/\//i.test(ref)) continue;
    try {
      const parsed = new URL(ref);
      for (const key of ["lenc", "slug"]) {
        const value = parsed.searchParams.get(key)?.trim();
        if (!value || seen.has(value)) continue;
        seen.add(value);
        out.push(value);
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * Cria link de checkout na InfinitePay (valores em centavos nos itens).
 */
export async function createInfinitePayCheckoutLink(
  input: CreateInfinitePayLinkInput
): Promise<CreateInfinitePayLinkResult> {
  const handle = getInfinitePayHandle();
  validateInfinitePayItems(input.items);

  const body: Record<string, unknown> = {
    handle,
    items: input.items,
    order_nsu: input.orderNsu,
    redirect_url: input.redirectUrl,
    webhook_url: input.webhookUrl,
  };
  if (input.customer) body.customer = input.customer;
  if (input.address) body.address = input.address;

  const res = await fetch(`${apiBase()}${LINKS_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    console.error("[InfinitePay] links HTTP", res.status, data);
    throw new Error(
      typeof data === "object" &&
        data &&
        "message" in data &&
        typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : "Falha ao criar link de pagamento."
    );
  }

  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const checkoutUrl = pickCheckoutUrl(rec);
  if (!checkoutUrl) {
    console.error("[InfinitePay] resposta sem URL", data);
    throw new Error("Resposta inválida da InfinitePay.");
  }
  if (checkoutUrlUsesLegacySlugOnly(checkoutUrl)) {
    console.error("[InfinitePay] checkout retornado apenas com slug", checkoutUrl);
    throw new Error(
      "A InfinitePay retornou um link de pagamento inválido. Tente novamente."
    );
  }

  return {
    checkoutUrl,
    slug: extractInfinitePayGatewayReference({ response: rec, checkoutUrl }),
  };
}

export type PaymentCheckInput = {
  orderNsu: string;
  transactionNsu: string;
  /** Slug curto da fatura ou token `lenc` retornado na criação do link. */
  slug: string;
};

export type PaymentCheckResult = {
  success: boolean;
  paid: boolean;
  amount?: number;
  paidAmount?: number;
  installments?: number;
  captureMethod?: string;
};

function isInfinitePayLencToken(reference: string): boolean {
  return reference.includes(".v1.");
}

export { isInfinitePayLencToken };

/** True quando a referência ainda abre o checkout (URL ou token lenc). */
export function isReusableInfinitePayCheckoutReference(
  reference: string | null | undefined
): boolean {
  const trimmed = reference?.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    return !checkoutUrlUsesLegacySlugOnly(trimmed);
  }
  // Token lenc (checkout). Slug curto de fatura NÃO abre o checkout.
  return isInfinitePayLencToken(trimmed);
}

function paymentCheckRequestBody(
  handle: string,
  input: PaymentCheckInput
): Record<string, unknown> {
  const ref = input.slug.trim();
  const body: Record<string, unknown> = {
    handle,
    order_nsu: input.orderNsu,
    transaction_nsu: input.transactionNsu,
  };
  if (isInfinitePayLencToken(ref)) {
    body.lenc = ref;
  } else {
    body.slug = ref;
  }
  return body;
}

export async function infinitePayPaymentCheck(
  input: PaymentCheckInput
): Promise<PaymentCheckResult> {
  const handle = getInfinitePayHandle();
  const res = await fetch(`${apiBase()}${PAYMENT_CHECK_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(paymentCheckRequestBody(handle, input)),
    cache: "no-store",
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    console.error("[InfinitePay] payment_check HTTP", res.status, data);
    return { success: false, paid: false };
  }

  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    success: Boolean(rec.success),
    paid: Boolean(rec.paid),
    amount: typeof rec.amount === "number" ? rec.amount : undefined,
    paidAmount: typeof rec.paid_amount === "number" ? rec.paid_amount : undefined,
    installments:
      typeof rec.installments === "number" ? rec.installments : undefined,
    captureMethod:
      typeof rec.capture_method === "string" ? rec.capture_method : undefined,
  };
}

/** Tenta payment_check com slug da URL, lenc salvo na tentativa, etc. */
export async function infinitePayPaymentCheckWithFallback(input: {
  orderNsu: string;
  transactionNsu: string;
  references: Array<string | null | undefined>;
}): Promise<{ check: PaymentCheckResult; reference: string } | null> {
  for (const ref of expandInfinitePayPaymentReferences(input.references)) {
    // payment_check não aceita URL completa — só lenc/slug.
    if (/^https?:\/\//i.test(ref)) continue;
    const check = await infinitePayPaymentCheck({
      orderNsu: input.orderNsu,
      transactionNsu: input.transactionNsu,
      slug: ref,
    });
    if (check.success && check.paid) {
      return { check, reference: ref };
    }
  }
  return null;
}

export function infinitePayWebhookUrl(): string {
  /** Precisa ser HTTPS acessível pela internet (não localhost). Mesmo host do Link Integrado no app InfinitePay ajuda na entrega. */
  return `${getPaymentCallbackBaseUrl()}/api/webhooks/infinitepay`;
}

export function infinitePayOrderRedirectUrl(orderId: string): string {
  return `${getPaymentCallbackBaseUrl()}/pedido/${orderId}`;
}

/**
 * NSU enviado à InfinitePay. Inclui o número da tentativa para cada
 * regeneração gerar um checkout novo (mesmo `order.id` reutiliza a fatura).
 */
export function buildInfinitePayOrderNsu(
  orderId: string,
  attemptNumber: number
): string {
  return `${orderId}-att-${attemptNumber}`;
}

/** Extrai orderId (e tentativa, se houver) do `order_nsu` da InfinitePay. */
export function parseInfinitePayOrderNsu(orderNsu: string): {
  orderId: string;
  attemptNumber: number | null;
} {
  const trimmed = orderNsu.trim();
  const att = trimmed.match(/^(.*)-att-(\d+)$/);
  if (att?.[1] && att[2]) {
    return { orderId: att[1], attemptNumber: Number(att[2]) };
  }
  if (trimmed.includes("-ex-")) {
    return { orderId: trimmed.split("-ex-")[0]!, attemptNumber: null };
  }
  return { orderId: trimmed, attemptNumber: null };
}

/**
 * Resolve URL de checkout a partir do que foi salvo na tentativa.
 * Se já for URL completa, devolve como está (caso preferido).
 */
export function infinitePayCheckoutUrlFromSlug(reference: string): string {
  const trimmed = reference.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const handle = getInfinitePayHandle();
  const param = isInfinitePayLencToken(trimmed) ? "lenc" : "slug";
  return `https://checkout.infinitepay.io/${encodeURIComponent(handle)}?${param}=${encodeURIComponent(trimmed)}`;
}
