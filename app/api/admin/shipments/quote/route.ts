import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  isShippingMockEnabled,
  mockShippingQuote,
} from "@/lib/shipping/dev-mock-shipping";
import { applyPackagingDays, getPackagingDays } from "@/lib/shipping/packaging-days";
import {
  calculateShippingSuperFreteWithStoreOrigin,
  normalizePostalCode,
} from "@/lib/shipping/superfrete";
import { ShippingQuoteError } from "@/lib/shipping/types";

/** Embalagem fixa para cotação rápida no admin de Envios. */
const QUICK_QUOTE_PACKAGE = {
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
  weightKg: 1,
} as const;

/** Valor de seguro padrão da cotação rápida. */
const QUICK_QUOTE_INSURANCE_VALUE = 200;

/**
 * Cotação rápida por CEP com embalagem padrão:
 * 30 × 20 × 10 cm · 1 kg.
 */
export async function POST(request: NextRequest) {
  const gate = await requirePermission(PERMISSION.SHIPPING_MANAGE);
  if (gate instanceof NextResponse) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const destinationCep = String(
    (body as Record<string, unknown>).destinationCep ?? ""
  ).trim();
  const dest = normalizePostalCode(destinationCep);
  if (!dest) {
    return NextResponse.json({ error: "Informe um CEP válido." }, { status: 400 });
  }

  try {
    const packagingDays = await getPackagingDays();

    if (isShippingMockEnabled()) {
      const mock = mockShippingQuote();
      return NextResponse.json({
        options: applyPackagingDays(mock.options, packagingDays),
        idealPackage: mock.idealPackage,
        package: QUICK_QUOTE_PACKAGE,
        insuranceValue: QUICK_QUOTE_INSURANCE_VALUE,
      });
    }

    const result = await calculateShippingSuperFreteWithStoreOrigin({
      destinationPostalCode: dest,
      lengthCm: QUICK_QUOTE_PACKAGE.lengthCm,
      widthCm: QUICK_QUOTE_PACKAGE.widthCm,
      heightCm: QUICK_QUOTE_PACKAGE.heightCm,
      weightKg: QUICK_QUOTE_PACKAGE.weightKg,
      insuranceValue: QUICK_QUOTE_INSURANCE_VALUE,
      useInsurance: true,
    });

    return NextResponse.json({
      options: applyPackagingDays(result.options, packagingDays),
      idealPackage: result.idealPackage,
      package: QUICK_QUOTE_PACKAGE,
      insuranceValue: QUICK_QUOTE_INSURANCE_VALUE,
    });
  } catch (e) {
    console.error("[POST /api/admin/shipments/quote]", e);
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Não foi possível calcular o frete." },
      { status: 400 }
    );
  }
}
