import {
  calculateShippingSuperFreteWithStoreOrigin,
  normalizePostalCode,
} from "@/lib/shipping/superfrete";
import { buildCartShippingPackage, type CartShippingLine } from "@/lib/shipping/cart-package";
import type { ShippingQuoteResult } from "@/lib/shipping/types";

export async function quoteShippingForCartLines(
  lines: CartShippingLine[],
  destinationCep: string
): Promise<ShippingQuoteResult> {
  const dest = normalizePostalCode(destinationCep);
  if (!dest) throw new Error("INVALID_CEP");

  const pkg = await buildCartShippingPackage(lines);

  return calculateShippingSuperFreteWithStoreOrigin({
    destinationPostalCode: dest,
    products: pkg.products,
    insuranceValue: pkg.insuranceDeclared,
    useInsurance: pkg.useInsurance,
  });
}
