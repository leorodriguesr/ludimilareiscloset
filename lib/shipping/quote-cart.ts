import {
  calculateShippingSuperFreteWithStoreOrigin,
  normalizePostalCode,
} from "@/lib/shipping/superfrete";
import { buildCartShippingPackage, type CartShippingLine } from "@/lib/shipping/cart-package";
import {
  isShippingMockEnabled,
  mockShippingQuote,
} from "@/lib/shipping/dev-mock-shipping";
import { applyPackagingDays, getPackagingDays } from "@/lib/shipping/packaging-days";
import type { ShippingQuoteResult } from "@/lib/shipping/types";

export async function quoteShippingForCartLines(
  lines: CartShippingLine[],
  destinationCep: string
): Promise<ShippingQuoteResult> {
  const dest = normalizePostalCode(destinationCep);
  if (!dest) throw new Error("INVALID_CEP");

  if (isShippingMockEnabled()) {
    const packagingDays = await getPackagingDays();
    const mock = mockShippingQuote();
    return {
      ...mock,
      options: applyPackagingDays(mock.options, packagingDays),
    };
  }

  const pkg = await buildCartShippingPackage(lines);

  const result = await calculateShippingSuperFreteWithStoreOrigin({
    destinationPostalCode: dest,
    products: pkg.products,
    insuranceValue: pkg.insuranceDeclared,
    useInsurance: pkg.useInsurance,
  });

  const packagingDays = await getPackagingDays();
  return {
    ...result,
    options: applyPackagingDays(result.options, packagingDays),
  };
}
