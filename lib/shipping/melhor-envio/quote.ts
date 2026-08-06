import {
  melhorEnvioRequest,
  meAsRecord,
  meNum,
} from "@/lib/shipping/melhor-envio/client";
import { optionIdForProvider, SHIPPING_PROVIDERS } from "@/lib/shipping/providers";
import {
  ShippingQuoteError,
  type IdealPackage,
  type NormalizedShippingOption,
  type ShippingQuoteResult,
} from "@/lib/shipping/types";
import { normalizePostalCode } from "@/lib/shipping/superfrete";

export type MelhorEnvioQuoteProduct = {
  id: string;
  quantity: number;
  weight: number;
  height: number;
  width: number;
  length: number;
  insurance_value?: number;
};

export type MelhorEnvioQuotePackage = {
  price?: string | number;
  discount?: string | number;
  format?: string;
  dimensions: { height: number; width: number; length: number };
  weight: string | number;
  insurance_value?: string | number;
  products?: { id: string; quantity: number }[];
};

export type MelhorEnvioQuoteOption = NormalizedShippingOption & {
  packages: MelhorEnvioQuotePackage[];
};

export type MelhorEnvioQuoteResult = ShippingQuoteResult & {
  provider: typeof SHIPPING_PROVIDERS.MELHOR_ENVIO;
  options: MelhorEnvioQuoteOption[];
};

function extractIdealFromPackages(
  packages: MelhorEnvioQuotePackage[]
): IdealPackage | null {
  const first = packages[0];
  if (!first) return null;
  const weightKg = meNum(first.weight);
  const heightCm = meNum(first.dimensions?.height);
  const widthCm = meNum(first.dimensions?.width);
  const lengthCm = meNum(first.dimensions?.length);
  if (
    weightKg == null ||
    heightCm == null ||
    widthCm == null ||
    lengthCm == null
  ) {
    return null;
  }
  return { weightKg, heightCm, widthCm, lengthCm };
}

/** Transportadoras ocultas na cotação (não oferecer ao cliente). */
function isExcludedMelhorEnvioCarrier(
  carrierName: string,
  serviceName: string
): boolean {
  const haystack = `${carrierName} ${serviceName}`.toLowerCase();
  return haystack.includes("latam");
}

function parsePackages(row: Record<string, unknown>): MelhorEnvioQuotePackage[] {
  if (!Array.isArray(row.packages)) return [];
  const out: MelhorEnvioQuotePackage[] = [];
  for (const p of row.packages) {
    const pkg = meAsRecord(p);
    if (!pkg) continue;
    const dimensions = meAsRecord(pkg.dimensions) ?? {};
    const height = meNum(dimensions.height);
    const width = meNum(dimensions.width);
    const length = meNum(dimensions.length);
    const weight = meNum(pkg.weight);
    if (height == null || width == null || length == null || weight == null) {
      continue;
    }
    out.push({
      price: (pkg.price as string | number | undefined) ?? undefined,
      discount: (pkg.discount as string | number | undefined) ?? undefined,
      format: typeof pkg.format === "string" ? pkg.format : "box",
      dimensions: { height, width, length },
      weight,
      insurance_value:
        (pkg.insurance_value as string | number | undefined) ?? undefined,
      products: Array.isArray(pkg.products)
        ? (pkg.products as { id: string; quantity: number }[])
        : undefined,
    });
  }
  return out;
}

function normalizeRows(raw: unknown): MelhorEnvioQuoteOption[] {
  if (!Array.isArray(raw)) {
    throw new ShippingQuoteError(
      "PARSE",
      "Nenhuma opção de frete retornada pelo Melhor Envio.",
      422,
      raw
    );
  }

  const out: MelhorEnvioQuoteOption[] = [];
  raw.forEach((item, index) => {
    const row = meAsRecord(item);
    if (!row) return;
    if (row.error) {
      console.warn("[MelhorEnvio] serviço filtrado:", row.error, row.name ?? row.id);
      return;
    }

    const serviceId = meNum(row.id);
    const price =
      meNum(row.custom_price) ?? meNum(row.price) ?? meNum(row.final_price);
    if (serviceId == null || price == null || price < 0) return;

    const company = meAsRecord(row.company);
    const carrierName =
      (typeof company?.name === "string" && company.name.trim()) ||
      "Transportadora";
    const serviceName =
      (typeof row.name === "string" && row.name.trim()) ||
      `Serviço ${serviceId}`;

    if (isExcludedMelhorEnvioCarrier(carrierName, serviceName)) {
      return;
    }

    const customRange = meAsRecord(row.custom_delivery_range);
    const range = meAsRecord(row.delivery_range);
    const min =
      meNum(customRange?.min) ??
      meNum(range?.min) ??
      meNum(row.custom_delivery_time) ??
      meNum(row.delivery_time) ??
      0;
    const max =
      meNum(customRange?.max) ??
      meNum(range?.max) ??
      meNum(row.custom_delivery_time) ??
      meNum(row.delivery_time) ??
      min;

    const packages = parsePackages(row);

    out.push({
      id: optionIdForProvider(SHIPPING_PROVIDERS.MELHOR_ENVIO, serviceId),
      serviceId,
      carrierName,
      serviceName,
      price: Math.round(price * 100) / 100,
      deliveryDaysMin: Math.max(0, Math.round(min)),
      deliveryDaysMax: Math.max(0, Math.round(max)),
      packages,
    });

    if (index === 0 && packages.length === 0) {
      // ok — volume será montado localmente na etiqueta
    }
  });

  return out.sort((a, b) => a.price - b.price);
}

export async function calculateShippingMelhorEnvio(input: {
  originPostalCode: string;
  destinationPostalCode: string;
  products: MelhorEnvioQuoteProduct[];
  insuranceValue?: number;
}): Promise<MelhorEnvioQuoteResult> {
  const from = normalizePostalCode(input.originPostalCode);
  const to = normalizePostalCode(input.destinationPostalCode);
  if (!from || !to) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "CEP de origem ou destino inválido.",
      400
    );
  }
  if (!input.products.length) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Informe os produtos para cotar o frete.",
      400
    );
  }

  const body: Record<string, unknown> = {
    from: { postal_code: from },
    to: { postal_code: to },
    products: input.products.map((p) => ({
      id: p.id,
      width: p.width,
      height: p.height,
      length: p.length,
      weight: p.weight,
      insurance_value: p.insurance_value ?? 0,
      quantity: Math.max(1, Math.floor(p.quantity)),
    })),
  };

  if (input.insuranceValue != null && input.insuranceValue > 0) {
    body.options = {
      insurance_value: input.insuranceValue,
      receipt: false,
      own_hand: false,
    };
  }

  const raw = await melhorEnvioRequest(
    "POST",
    "/api/v2/me/shipment/calculate",
    body
  );
  const options = normalizeRows(raw);
  if (!options.length) {
    throw new ShippingQuoteError(
      "PARSE",
      "Nenhuma cotação de frete válida no Melhor Envio.",
      422,
      raw
    );
  }

  const idealPackage =
    extractIdealFromPackages(options[0]!.packages) ??
    ({
      weightKg: input.products.reduce((acc, p) => acc + p.weight * p.quantity, 0),
      heightCm: Math.max(...input.products.map((p) => p.height)),
      widthCm: Math.max(...input.products.map((p) => p.width)),
      lengthCm: Math.max(...input.products.map((p) => p.length)),
    } satisfies IdealPackage);

  return {
    provider: SHIPPING_PROVIDERS.MELHOR_ENVIO,
    options,
    idealPackage,
  };
}
