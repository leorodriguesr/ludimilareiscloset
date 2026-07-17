import {
  calculateShippingSuperFreteWithStoreOrigin,
  normalizePostalCode,
} from "@/lib/shipping/superfrete";
import {
  buildCartShippingPackage,
  buildDefaultShippingPackage,
  type CartShippingLine,
} from "@/lib/shipping/cart-package";
import {
  isShippingMockEnabled,
  mockShippingQuote,
} from "@/lib/shipping/dev-mock-shipping";
import { applyPackagingDays, getPackagingDays } from "@/lib/shipping/packaging-days";
import type { ShippingQuoteResult } from "@/lib/shipping/types";

async function quoteMock(): Promise<ShippingQuoteResult | null> {
  if (!isShippingMockEnabled()) return null;
  const packagingDays = await getPackagingDays();
  const mock = mockShippingQuote();
  return {
    ...mock,
    options: applyPackagingDays(mock.options, packagingDays),
  };
}

async function finalizeLiveQuote(
  dest: string,
  products: Parameters<
    typeof calculateShippingSuperFreteWithStoreOrigin
  >[0]["products"],
  insuranceValue: number,
  useInsurance: boolean
): Promise<ShippingQuoteResult> {
  const result = await calculateShippingSuperFreteWithStoreOrigin({
    destinationPostalCode: dest,
    products,
    insuranceValue,
    useInsurance,
  });

  const packagingDays = await getPackagingDays();
  return {
    ...result,
    options: applyPackagingDays(result.options, packagingDays),
  };
}

export async function quoteShippingForCartLines(
  lines: CartShippingLine[],
  destinationCep: string
): Promise<ShippingQuoteResult> {
  const dest = normalizePostalCode(destinationCep);
  if (!dest) throw new Error("INVALID_CEP");

  const mocked = await quoteMock();
  if (mocked) return mocked;

  const pkg = await buildCartShippingPackage(lines);
  return finalizeLiveQuote(
    dest,
    pkg.products,
    pkg.insuranceDeclared,
    pkg.useInsurance
  );
}

/** Cotação com embalagem padrão (itens sem produto no catálogo). */
export async function quoteShippingForDefaultPackage(
  destinationCep: string,
  input: { quantity: number; insuranceValue: number }
): Promise<ShippingQuoteResult> {
  const dest = normalizePostalCode(destinationCep);
  if (!dest) throw new Error("INVALID_CEP");

  const mocked = await quoteMock();
  if (mocked) return mocked;

  const pkg = buildDefaultShippingPackage(input);
  return finalizeLiveQuote(
    dest,
    pkg.products,
    pkg.insuranceDeclared,
    pkg.useInsurance
  );
}
