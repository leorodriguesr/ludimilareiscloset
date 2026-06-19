import crypto from "crypto";

const MP_API_BASE = "https://api.mercadopago.com";

export function getMpAccessToken(): string {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (
    !token ||
    token ===
      "TEST-0000000000000000-000000-00000000000000000000000000000000-000000000"
  ) {
    throw new Error(
      "MERCADO_PAGO_ACCESS_TOKEN não configurado. Defina a variável de ambiente com o token de produção ou teste do Mercado Pago."
    );
  }
  return token;
}

type MpFetchOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  idempotencyKey?: string;
};

/**
 * Wrapper de fetch para a API do Mercado Pago, usando a Orders API (/v1/orders),
 * que funciona tanto com credenciais de teste quanto de produção
 * (diferente de /v1/payments, que rejeita credenciais de teste).
 */
export async function mpFetch<T = unknown>(
  path: string,
  options: MpFetchOptions = {}
): Promise<T> {
  const token = getMpAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (options.method === "POST" || options.method === "PUT") {
    headers["X-Idempotency-Key"] = options.idempotencyKey ?? crypto.randomUUID();
  }

  const res = await fetch(`${MP_API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    const message =
      (json && typeof json === "object" && "message" in json
        ? String((json as Record<string, unknown>).message)
        : null) ?? `Mercado Pago retornou ${res.status}`;
    const err = new Error(message);
    (err as Error & { mpResponse?: unknown }).mpResponse = json;
    throw err;
  }

  return json as T;
}
