/**
 * Integração SuperFrete — cotação em POST /api/v0/calculator.
 *
 * Variáveis de ambiente:
 * - SUPERFRETE_TOKEN (obrigatório): Bearer token (sandbox ou produção).
 * - SUPERFRETE_API_ORIGIN (opcional): ex. https://sandbox.superfrete.com ou https://api.superfrete.com
 * - SUPERFRETE_USER_AGENT (recomendado): ex. "MinhaLoja/1.0 (contato@email.com)"
 * - SHIPPING_ORIGIN_POSTAL_CODE: CEP de origem da loja (somente dígitos ou com hífen).
 * - SUPERFRETE_SERVICES (opcional): padrão "1,2,17" (PAC, SEDEX, Mini Envios).
 */
import {
  NormalizedShippingOption,
  ShippingQuoteError,
} from "@/lib/shipping/types";

const CALCULATOR_PATH = "/api/v0/calculator";

const DEFAULT_API_ORIGIN = "https://api.superfrete.com";
const DEFAULT_SERVICES = "1,2,3,17,31";

/** Mapeamento auxiliar quando a API não envia nome legível. */
const SERVICE_ID_LABELS: Record<number, { carrier: string; service: string }> =
  {
    1: { carrier: "Correios", service: "PAC" },
    2: { carrier: "Correios", service: "SEDEX" },
    17: { carrier: "Correios", service: "Mini Envios" },
    3: { carrier: "Jadlog", service: "Package" },
    31: { carrier: "Loggi", service: "Econômico" },
  };

export type SuperFreteQuoteInput = {
  originPostalCode: string;
  destinationPostalCode: string;
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  /** Valor declarado opcional (seguro). */
  insuranceValue?: number;
  useInsurance?: boolean;
};

type SuperFreteConfig = {
  token: string;
  apiOrigin: string;
  userAgent: string;
  originPostalCode: string;
  services: string;
};

function readConfig(): SuperFreteConfig {
  const token = process.env.SUPERFRETE_TOKEN?.trim();
  if (!token) {
    throw new ShippingQuoteError(
      "CONFIG",
      "SUPERFRETE_TOKEN não configurado.",
      503
    );
  }

  const userAgent =
    process.env.SUPERFRETE_USER_AGENT?.trim() ||
    "LudimilaReisCloset/1.0 (configure SUPERFRETE_USER_AGENT)";

  const originPostalCode = normalizePostalCode(
    process.env.SHIPPING_ORIGIN_POSTAL_CODE ?? ""
  );
  if (!originPostalCode) {
    throw new ShippingQuoteError(
      "CONFIG",
      "SHIPPING_ORIGIN_POSTAL_CODE não configurado ou CEP inválido.",
      503
    );
  }

  const apiOrigin = (
    process.env.SUPERFRETE_API_ORIGIN?.trim() || DEFAULT_API_ORIGIN
  ).replace(/\/$/, "");

  const services =
    process.env.SUPERFRETE_SERVICES?.trim() || DEFAULT_SERVICES;

  return {
    token,
    apiOrigin,
    userAgent,
    originPostalCode,
    services,
  };
}

export function normalizePostalCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return digits;
}

function clampPositive(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/** Garante dimensões mínimas plausíveis para a API não rejeitar. */
export function packageToSuperFreteKgCm(pkg: {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}): {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
} {
  const weightKg = clampPositive(pkg.weightGrams / 1000, 0.3);
  return {
    weightKg,
    lengthCm: clampPositive(pkg.lengthCm, 16),
    widthCm: clampPositive(pkg.widthCm, 11),
    heightCm: clampPositive(pkg.heightCm, 2),
  };
}

function buildRequestBody(
  cfg: SuperFreteConfig,
  input: SuperFreteQuoteInput
): Record<string, unknown> {
  const insuranceRaw =
    input.insuranceValue != null && Number.isFinite(Number(input.insuranceValue))
      ? Number(input.insuranceValue)
      : 0;
  const insurance = Math.max(0, Math.round(insuranceRaw * 100) / 100);
  /** Com valor declarado > 0, inclui seguro salvo `useInsurance === false`. */
  const useInsurance = insurance > 0 && input.useInsurance !== false;
  return {
    from: { postal_code: normalizePostalCode(input.originPostalCode) },
    to: { postal_code: normalizePostalCode(input.destinationPostalCode) },
    services: cfg.services,
    options: {
      own_hand: false,
      receipt: false,
      insurance_value: insurance,
      use_insurance_value: useInsurance,
    },
    package: {
      weight: input.weightKg,
      height: input.heightCm,
      width: input.widthCm,
      length: input.lengthCm,
    },
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractCarrierAndService(row: Record<string, unknown>): {
  carrier: string;
  service: string;
  serviceId: number | null;
} {
  const company = asRecord(row.company);
  const carrierFromCompany =
    company && typeof company.name === "string" ? company.name.trim() : "";

  const serviceIdRaw = row.service_id ?? row.serviceId;
  const serviceId =
    typeof serviceIdRaw === "number"
      ? serviceIdRaw
      : typeof serviceIdRaw === "string"
        ? Number(serviceIdRaw)
        : null;

  const mapped =
    serviceId != null && Number.isFinite(serviceId)
      ? SERVICE_ID_LABELS[serviceId]
      : undefined;

  const nameRaw =
    typeof row.name === "string"
      ? row.name.trim()
      : typeof row.service_name === "string"
        ? row.service_name.trim()
        : "";

  const carrier =
    carrierFromCompany ||
    (typeof row.carrier === "string" ? row.carrier.trim() : "") ||
    mapped?.carrier ||
    "Transportadora";

  const service = nameRaw || mapped?.service || `Serviço ${serviceId ?? ""}`;

  return {
    carrier,
    service,
    serviceId: serviceId != null && Number.isFinite(serviceId) ? serviceId : null,
  };
}

function extractPrice(row: Record<string, unknown>): number | null {
  return (
    num(row.price) ??
    num(row.custom_price) ??
    num(row.final_price) ??
    num(row.total)
  );
}

function extractDeliveryRange(row: Record<string, unknown>): {
  min: number;
  max: number;
} {
  const dMin =
    num(row.delivery_min) ??
    num(row.delivery_time_min) ??
    num(row.delivery_time) ??
    num(row.delivery);
  const dMax =
    num(row.delivery_max) ??
    num(row.delivery_time_max) ??
    num(row.delivery_time) ??
    num(row.delivery);

  let min = dMin ?? dMax ?? null;
  let max = dMax ?? dMin ?? null;

  if (min == null && max == null) {
    const range = asRecord(row.delivery_range);
    if (range) {
      min = num(range.min) ?? num(range.minimum);
      max = num(range.max) ?? num(range.maximum);
    }
  }

  if (min == null && max == null) return { min: 0, max: 0 };
  if (min == null) min = max!;
  if (max == null) max = min;
  if (min > max) [min, max] = [max, min];
  return { min: Math.max(0, Math.round(min)), max: Math.max(0, Math.round(max)) };
}

function coerceRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => asRecord(x)).filter(Boolean) as Record<
      string,
      unknown
    >[];
  }
  const obj = asRecord(raw);
  if (!obj) return [];

  const candidates = [
    "quotes",
    "data",
    "result",
    "options",
    "services",
    "content",
  ];
  for (const key of candidates) {
    const inner = obj[key];
    if (Array.isArray(inner)) {
      return inner.map((x) => asRecord(x)).filter(Boolean) as Record<
        string,
        unknown
      >[];
    }
  }

  if (
    "price" in obj ||
    "service_id" in obj ||
    "delivery" in obj
  ) {
    return [obj];
  }

  return [];
}

function normalizeRows(rows: Record<string, unknown>[]): NormalizedShippingOption[] {
  const out: NormalizedShippingOption[] = [];
  rows.forEach((row, index) => {
    // Pula itens que a API retornou com erro (ex.: CEP não atendido, peso excedido)
    if (row.error) {
      const { carrier, service, serviceId } = extractCarrierAndService(row);
      console.warn(
        `[SuperFrete] serviço filtrado por erro — ${carrier} ${service} (id=${serviceId}):`,
        row.error
      );
      return;
    }

    const price = extractPrice(row);
    if (price == null || price < 0) return;

    const { min, max } = extractDeliveryRange(row);
    const { carrier, service, serviceId } = extractCarrierAndService(row);

    const id =
      typeof row.id === "string" && row.id
        ? row.id
        : serviceId != null
          ? `sf:${serviceId}`
          : `sf:idx:${index}`;

    out.push({
      id,
      carrierName: carrier,
      serviceName: service,
      price: Math.round(price * 100) / 100,
      deliveryDaysMin: min,
      deliveryDaysMax: max,
    });
  });

  return out.sort((a, b) => a.price - b.price);
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText || "Erro na API SuperFrete.";
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      const msg =
        (typeof j.message === "string" && j.message) ||
        (typeof j.error === "string" && j.error) ||
        (typeof j.msg === "string" && j.msg);
      if (msg) return msg;
    } catch {
      /* not JSON */
    }
    return text.slice(0, 500);
  } catch {
    return res.statusText || "Erro na API SuperFrete.";
  }
}

/**
 * Consulta cotações na SuperFrete e devolve lista normalizada.
 * Não expõe o payload bruto da API.
 */
export async function calculateShippingSuperFrete(
  input: SuperFreteQuoteInput
): Promise<NormalizedShippingOption[]> {
  const cfg = readConfig();

  const origin = normalizePostalCode(input.originPostalCode);
  const dest = normalizePostalCode(input.destinationPostalCode);
  if (!origin || !dest) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "CEP de origem ou destino inválido.",
      400
    );
  }

  const url = `${cfg.apiOrigin}${CALCULATOR_PATH}`;
  const body = buildRequestBody(cfg, {
    ...input,
    originPostalCode: origin,
    destinationPostalCode: dest,
  });

  console.debug("[SuperFrete] POST", url, JSON.stringify(body));

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "User-Agent": cfg.userAgent,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (e) {
    console.error("[SuperFrete] fetch", e);
    throw new ShippingQuoteError(
      "UPSTREAM",
      "Não foi possível contatar o serviço de frete.",
      502,
      e
    );
  }

  if (!res.ok) {
    const msg = await readErrorMessage(res);
    console.error("[SuperFrete] HTTP", res.status, msg);
    throw new ShippingQuoteError(
      "UPSTREAM",
      msg || "Falha ao calcular frete.",
      res.status >= 400 && res.status < 600 ? res.status : 502
    );
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (e) {
    throw new ShippingQuoteError(
      "PARSE",
      "Resposta inválida do serviço de frete.",
      502,
      e
    );
  }

  console.debug("[SuperFrete] resposta bruta:", JSON.stringify(raw));

  const rows = coerceRows(raw);
  if (rows.length === 0) {
    throw new ShippingQuoteError(
      "PARSE",
      "Nenhuma opção de frete retornada.",
      422,
      raw
    );
  }

  const normalized = normalizeRows(rows);
  if (normalized.length === 0) {
    throw new ShippingQuoteError(
      "PARSE",
      "Nenhuma cotação de frete válida.",
      422,
      raw
    );
  }
  return normalized;
}

/**
 * Usa CEP de origem do .env, a menos que `overrideOrigin` seja informado (8 dígitos).
 */
export async function calculateShippingSuperFreteWithStoreOrigin(
  input: Omit<SuperFreteQuoteInput, "originPostalCode"> & {
    originPostalCode?: string;
  }
): Promise<NormalizedShippingOption[]> {
  const cfg = readConfig();
  const origin =
    input.originPostalCode != null
      ? normalizePostalCode(input.originPostalCode)
      : cfg.originPostalCode;
  if (!origin) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "CEP de origem inválido.",
      400
    );
  }
  return calculateShippingSuperFrete({
    ...input,
    originPostalCode: origin,
  });
}
