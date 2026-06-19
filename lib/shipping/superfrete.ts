import {
  NormalizedShippingOption,
  ShippingQuoteError,
  type IdealPackage,
  type ShippingQuoteResult,
} from "@/lib/shipping/types";
import {
  asRecord,
  extractIdealPackage,
  num,
  readSuperFreteClientConfig,
  superfreteRequest,
} from "@/lib/shipping/superfrete-client";
import { superfreteOptionId } from "@/lib/shipping/service-id";
import { normalizeSuperfreteInsurance } from "@/lib/shipping/insurance";

const CALCULATOR_PATH = "/api/v0/calculator";
const DEFAULT_SERVICES = "1,2,3,17,31";

const SERVICE_ID_LABELS: Record<number, { carrier: string; service: string }> = {
  1: { carrier: "Correios", service: "PAC" },
  2: { carrier: "Correios", service: "SEDEX" },
  17: { carrier: "Correios", service: "Mini Envios" },
  3: { carrier: "Jadlog", service: "Package" },
  31: { carrier: "Loggi", service: "Econômico" },
};

export type SuperFreteProductInput = {
  quantity: number;
  weight: number;
  height: number;
  width: number;
  length: number;
};

export type SuperFreteQuoteInput = {
  originPostalCode: string;
  destinationPostalCode: string;
  /** Preferencial: dimensões por produto (SuperFrete calcula caixa ideal). */
  products?: SuperFreteProductInput[];
  /** Fallback quando products não informado. */
  weightKg?: number;
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
  insuranceValue?: number;
  useInsurance?: boolean;
};

export function normalizePostalCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return digits;
}

function clampPositive(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

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

function readServices(): string {
  return process.env.SUPERFRETE_SERVICES?.trim() || DEFAULT_SERVICES;
}

function buildRequestBody(
  cfg: ReturnType<typeof readSuperFreteClientConfig>,
  input: SuperFreteQuoteInput
): Record<string, unknown> {
  const insuranceRaw =
    input.insuranceValue != null && Number.isFinite(Number(input.insuranceValue))
      ? Number(input.insuranceValue)
      : 0;
  const { insuranceValue: insurance, useInsurance } = normalizeSuperfreteInsurance(
    insuranceRaw
  );
  const applyInsurance = useInsurance && input.useInsurance !== false;

  const body: Record<string, unknown> = {
    from: { postal_code: normalizePostalCode(input.originPostalCode) },
    to: { postal_code: normalizePostalCode(input.destinationPostalCode) },
    services: readServices(),
    options: {
      own_hand: false,
      receipt: false,
      insurance_value: applyInsurance ? insurance : null,
      use_insurance_value: applyInsurance,
    },
  };

  if (input.products?.length) {
    body.products = input.products.map((p) => ({
      quantity: Math.max(1, Math.floor(p.quantity)),
      weight: p.weight,
      height: p.height,
      width: p.width,
      length: p.length,
    }));
  } else {
    body.package = {
      weight: input.weightKg ?? 0.3,
      height: input.heightCm ?? 2,
      width: input.widthCm ?? 11,
      length: input.lengthCm ?? 16,
    };
  }

  return body;
}

function extractCarrierAndService(row: Record<string, unknown>): {
  carrier: string;
  service: string;
  serviceId: number | null;
} {
  const company = asRecord(row.company);
  const carrierFromCompany =
    company && typeof company.name === "string" ? company.name.trim() : "";

  const serviceIdRaw = row.service_id ?? row.serviceId ?? row.id;
  let serviceId =
    typeof serviceIdRaw === "number"
      ? serviceIdRaw
      : typeof serviceIdRaw === "string"
        ? Number(serviceIdRaw)
        : null;

  if (serviceId != null && !Number.isFinite(serviceId)) serviceId = null;
  if (serviceId != null && SERVICE_ID_LABELS[serviceId] == null) {
    serviceId = null;
  }

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
    return raw.map((x) => asRecord(x)).filter(Boolean) as Record<string, unknown>[];
  }
  const obj = asRecord(raw);
  if (!obj) return [];

  for (const key of ["quotes", "data", "result", "options", "services", "content"]) {
    const inner = obj[key];
    if (Array.isArray(inner)) {
      return inner.map((x) => asRecord(x)).filter(Boolean) as Record<string, unknown>[];
    }
  }

  if ("price" in obj || "service_id" in obj || "delivery" in obj) {
    return [obj];
  }

  return [];
}

function normalizeRows(rows: Record<string, unknown>[]): NormalizedShippingOption[] {
  const out: NormalizedShippingOption[] = [];
  rows.forEach((row, index) => {
    if (row.error) {
      const { carrier, service, serviceId } = extractCarrierAndService(row);
      console.warn(
        `[SuperFrete] serviço filtrado — ${carrier} ${service} (id=${serviceId}):`,
        row.error
      );
      return;
    }

    const price = extractPrice(row);
    if (price == null || price < 0) return;

    const { min, max } = extractDeliveryRange(row);
    const { carrier, service, serviceId } = extractCarrierAndService(row);

    const id =
      serviceId != null
        ? superfreteOptionId(serviceId)
        : typeof row.id === "string" && row.id
          ? row.id
          : `sf:idx:${index}`;

    out.push({
      id,
      serviceId,
      carrierName: carrier,
      serviceName: service,
      price: Math.round(price * 100) / 100,
      deliveryDaysMin: min,
      deliveryDaysMax: max,
    });
  });

  return out.sort((a, b) => a.price - b.price);
}

export async function calculateShippingSuperFrete(
  input: SuperFreteQuoteInput
): Promise<ShippingQuoteResult> {
  const cfg = readSuperFreteClientConfig();

  const origin = normalizePostalCode(input.originPostalCode);
  const dest = normalizePostalCode(input.destinationPostalCode);
  if (!origin || !dest) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "CEP de origem ou destino inválido.",
      400
    );
  }

  const body = buildRequestBody(cfg, {
    ...input,
    originPostalCode: origin,
    destinationPostalCode: dest,
  });

  console.debug("[SuperFrete] POST", `${cfg.apiOrigin}${CALCULATOR_PATH}`, JSON.stringify(body));

  let raw: unknown;
  try {
    raw = await superfreteRequest("POST", CALCULATOR_PATH, body);
  } catch (e) {
    if (e instanceof ShippingQuoteError) throw e;
    console.error("[SuperFrete] fetch", e);
    throw new ShippingQuoteError(
      "UPSTREAM",
      "Não foi possível contatar o serviço de frete.",
      502,
      e
    );
  }

  console.debug("[SuperFrete] resposta bruta:", JSON.stringify(raw));

  const idealPackage = extractIdealPackage(raw);
  const rows = coerceRows(raw);
  if (rows.length === 0) {
    throw new ShippingQuoteError(
      "PARSE",
      "Nenhuma opção de frete retornada.",
      422,
      raw
    );
  }

  const options = normalizeRows(rows);
  if (options.length === 0) {
    throw new ShippingQuoteError(
      "PARSE",
      "Nenhuma cotação de frete válida.",
      422,
      raw
    );
  }

  return { options, idealPackage };
}

export async function calculateShippingSuperFreteWithStoreOrigin(
  input: Omit<SuperFreteQuoteInput, "originPostalCode"> & {
    originPostalCode?: string;
  }
): Promise<ShippingQuoteResult> {
  const cfg = readSuperFreteClientConfig();
  const origin =
    input.originPostalCode != null
      ? normalizePostalCode(input.originPostalCode)
      : cfg.originPostalCode;
  if (!origin) {
    throw new ShippingQuoteError("VALIDATION", "CEP de origem inválido.", 400);
  }
  return calculateShippingSuperFrete({
    ...input,
    originPostalCode: origin,
  });
}

/** @deprecated Use ShippingQuoteResult.options — mantido para compatibilidade interna. */
export type { IdealPackage };
