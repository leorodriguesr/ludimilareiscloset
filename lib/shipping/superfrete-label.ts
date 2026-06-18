/**
 * Geração de etiqueta via SuperFrete.
 *
 * Fluxo: POST /api/v0/cart  →  POST /api/v0/checkout  →  URL de impressão
 *
 * Variáveis de ambiente adicionais necessárias para emissão de etiqueta:
 *   STORE_NAME, STORE_DOCUMENT, STORE_PHONE, STORE_EMAIL
 *   STORE_ADDRESS, STORE_NUMBER, STORE_COMPLEMENT, STORE_DISTRICT
 *   STORE_CITY, STORE_STATE   (usará SHIPPING_ORIGIN_POSTAL_CODE já existente)
 */

import { ShippingQuoteError } from "@/lib/shipping/types";
export { ShippingQuoteError } from "@/lib/shipping/types";

const DEFAULT_API_ORIGIN = "https://api.superfrete.com";

function readConfig() {
  const token = process.env.SUPERFRETE_TOKEN?.trim();
  if (!token) throw new ShippingQuoteError("CONFIG", "SUPERFRETE_TOKEN não configurado.", 503);

  const apiOrigin = (process.env.SUPERFRETE_API_ORIGIN?.trim() || DEFAULT_API_ORIGIN).replace(/\/$/, "");
  const userAgent =
    process.env.SUPERFRETE_USER_AGENT?.trim() || "LudimilaReisCloset/1.0";

  const originPostalCode = (process.env.SHIPPING_ORIGIN_POSTAL_CODE ?? "").replace(/\D/g, "");
  if (originPostalCode.length !== 8)
    throw new ShippingQuoteError("CONFIG", "SHIPPING_ORIGIN_POSTAL_CODE inválido.", 503);

  const storeName = process.env.STORE_NAME?.trim() || "Ludimila Reis Closet";
  const storeDocument = process.env.STORE_DOCUMENT?.trim() || "";
  const storePhone = (process.env.STORE_PHONE ?? "").replace(/\D/g, "");
  const storeEmail = process.env.STORE_EMAIL?.trim() || "";
  const storeAddress = process.env.STORE_ADDRESS?.trim() || "";
  const storeNumber = process.env.STORE_NUMBER?.trim() || "S/N";
  const storeComplement = process.env.STORE_COMPLEMENT?.trim() || "";
  const storeDistrict = process.env.STORE_DISTRICT?.trim() || "";
  const storeCity = process.env.STORE_CITY?.trim() || "";
  const storeState = process.env.STORE_STATE?.trim() || "";

  return {
    token,
    apiOrigin,
    userAgent,
    originPostalCode,
    store: {
      name: storeName,
      document: storeDocument,
      phone: storePhone,
      email: storeEmail,
      address: storeAddress,
      number: storeNumber,
      complement: storeComplement,
      district: storeDistrict,
      city: storeCity,
      state_abbr: storeState,
      postal_code: originPostalCode,
      country_id: "BR",
    },
  };
}

export type LabelInput = {
  /** ID do serviço SuperFrete (1=PAC, 2=SEDEX, 17=Mini Envios, etc.) */
  serviceId: number;
  /** Destinatário */
  to: {
    name: string;
    phone?: string;
    email?: string;
    document?: string;
    address: string;
    number?: string;
    complement?: string;
    district?: string;
    city: string;
    state_abbr: string;
    postal_code: string;
  };
  /** Produtos para declaração */
  products: { name: string; quantity: number; unitary_value: number; weight: number }[];
  /** Volume do pacote */
  volume: { height: number; width: number; length: number; weight: number };
  /** Valor declarado para seguro */
  insuranceValue?: number;
  /** Tag para rastreio (ex.: ID do pedido da loja) */
  tag?: string;
};

export type LabelResult = {
  /** ID do pedido na SuperFrete */
  shipmentId: string;
  /** URL para impressão/download da etiqueta */
  labelUrl: string;
};

async function sfFetch(
  apiOrigin: string,
  token: string,
  userAgent: string,
  path: string,
  body: unknown
): Promise<unknown> {
  const res = await fetch(`${apiOrigin}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": userAgent,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }

  if (!res.ok) {
    const msg = typeof json === "object" && json !== null
      ? ((json as Record<string, unknown>).message ?? (json as Record<string, unknown>).error ?? text)
      : text;
    console.error(`[SuperFrete label] ${path} HTTP ${res.status}:`, msg);
    throw new ShippingQuoteError("UPSTREAM", String(msg || "Erro na SuperFrete."), res.status);
  }

  return json;
}

/**
 * Cria um envio na SuperFrete (cart + checkout) e retorna o ID e a URL da etiqueta.
 */
export async function createSuperfreteLabelForOrder(input: LabelInput): Promise<LabelResult> {
  const cfg = readConfig();

  const cartBody = {
    service: input.serviceId,
    agency: 0,
    from: cfg.store,
    to: {
      name: input.to.name,
      phone: (input.to.phone ?? "").replace(/\D/g, "") || undefined,
      email: input.to.email || undefined,
      document: input.to.document || undefined,
      address: input.to.address,
      complement: input.to.complement || "",
      number: input.to.number || "S/N",
      district: input.to.district || "",
      city: input.to.city,
      state_abbr: input.to.state_abbr,
      postal_code: input.to.postal_code.replace(/\D/g, ""),
      country_id: "BR",
    },
    products: input.products,
    volumes: [input.volume],
    options: {
      insurance_value: input.insuranceValue ?? 0,
      receipt: false,
      own_hand: false,
      collect: false,
      reverse: false,
      non_commercial: false,
    },
    tag: input.tag || undefined,
  };

  console.debug("[SuperFrete label] POST /api/v0/cart", JSON.stringify(cartBody));
  const cartRaw = await sfFetch(
    cfg.apiOrigin,
    cfg.token,
    cfg.userAgent,
    "/api/v0/cart",
    cartBody
  );

  // A SuperFrete pode retornar array ou objeto com o item de carrinho
  const cartItem = Array.isArray(cartRaw) ? cartRaw[0] : cartRaw;
  const cartObj = cartItem as Record<string, unknown>;
  const shipmentId =
    (typeof cartObj?.id === "string" ? cartObj.id : null) ??
    (typeof cartObj?.shipment_id === "string" ? cartObj.shipment_id : null);

  if (!shipmentId) {
    console.error("[SuperFrete label] ID do envio não encontrado na resposta do cart:", cartRaw);
    throw new ShippingQuoteError("PARSE", "ID do envio não retornado pela SuperFrete.", 502);
  }

  // Checkout (paga com saldo da conta SuperFrete)
  const checkoutBody = { orders: [shipmentId] };
  console.debug("[SuperFrete label] POST /api/v0/checkout", JSON.stringify(checkoutBody));
  const checkoutRaw = await sfFetch(
    cfg.apiOrigin,
    cfg.token,
    cfg.userAgent,
    "/api/v0/checkout",
    checkoutBody
  );

  console.debug("[SuperFrete label] checkout response:", JSON.stringify(checkoutRaw));

  // URL de impressão da etiqueta
  const labelUrl = `${cfg.apiOrigin}/api/v0/print?orders[]=${shipmentId}&type=pdf`;

  return { shipmentId, labelUrl };
}
