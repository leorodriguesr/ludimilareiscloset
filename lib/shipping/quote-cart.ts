import {
  buildCartShippingPackage,
  type CartShippingLine,
} from "@/lib/shipping/cart-package";
import {
  calculateShippingSuperFreteWithStoreOrigin,
  normalizePostalCode,
  packageToSuperFreteKgCm,
} from "@/lib/shipping/superfrete";
import type { NormalizedShippingOption } from "@/lib/shipping/types";

export async function quoteShippingForCartLines(
  lines: CartShippingLine[],
  destinationCep: string
): Promise<NormalizedShippingOption[]> {
  const dest = normalizePostalCode(destinationCep);
  if (!dest) {
    throw new Error("INVALID_CEP");
  }

  const pkg = await buildCartShippingPackage(lines);
  const dims = packageToSuperFreteKgCm({
    weightGrams: pkg.weightGrams,
    lengthCm: pkg.lengthCm,
    widthCm: pkg.widthCm,
    heightCm: pkg.heightCm,
  });

  return calculateShippingSuperFreteWithStoreOrigin({
    destinationPostalCode: dest,
    weightKg: dims.weightKg,
    heightCm: dims.heightCm,
    widthCm: dims.widthCm,
    lengthCm: dims.lengthCm,
    insuranceValue: pkg.insuranceDeclared,
    useInsurance: pkg.useInsurance,
  });
}
