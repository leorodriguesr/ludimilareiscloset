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
  const h = process.env.INFINITEPAY_HANDLE?.trim();
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
    for (const key of ["slug", "lenc"]) {
      const value = parsed.searchParams.get(key)?.trim();
      if (value) return value;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Identificador da fatura (slug legado ou token `lenc` na URL). */
export function extractInfinitePayGatewayReference(input: {
  response: Record<string, unknown>;
  checkoutUrl: string;
}): string | null {
  return (
    pickSlug(input.response) ??
    gatewayReferenceFromCheckoutUrl(input.checkoutUrl)
  );
}

/**
 * Cria link de checkout na InfinitePay (valores em centavos nos itens).
 */
export async function createInfinitePayCheckoutLink(
  input: CreateInfinitePayLinkInput
): Promise<CreateInfinitePayLinkResult> {
  const handle = getInfinitePayHandle();
  /** Documentação alterna `items` e `itens`; variável de ambiente força a chave. */
  const itemsPayloadKey =
    process.env.INFINITEPAY_ITEMS_KEY?.trim().toLowerCase() === "itens"
      ? "itens"
      : "items";

  const body: Record<string, unknown> = {
    handle,
    [itemsPayloadKey]: input.items,
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
  const seen = new Set<string>();
  for (const raw of input.references) {
    const ref = raw?.trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
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

/** Reconstrói URL de checkout a partir do slug ou token lenc salvos na tentativa. */
export function infinitePayCheckoutUrlFromSlug(reference: string): string {
  const handle = getInfinitePayHandle();
  const param = reference.includes(".v1.") ? "lenc" : "slug";
  return `https://checkout.infinitepay.io/${encodeURIComponent(handle)}?${param}=${encodeURIComponent(reference)}`;
}
