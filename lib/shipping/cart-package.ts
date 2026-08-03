import { prisma } from "@/lib/prisma";
import type { SuperFreteProductInput } from "@/lib/shipping/superfrete";
import { normalizeSuperfreteInsurance } from "@/lib/shipping/insurance";
import { packageToSuperFreteKgCm } from "@/lib/shipping/superfrete";

const DEFAULT_PKG = {
  weightGrams: 300,
  lengthCm: 16,
  widthCm: 11,
  heightCm: 2,
};

function positiveDimCm(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type CartShippingLine = { productId: string; quantity: number };

export type BuiltCartPackage = {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  insuranceDeclared: number;
  useInsurance: boolean;
  products: SuperFreteProductInput[];
};

/**
 * Monta linhas de produto para cotação SuperFrete (modo products[]).
 */
export async function buildCartShippingPackage(
  lines: CartShippingLine[]
): Promise<BuiltCartPackage> {
  const merged = new Map<string, number>();
  for (const l of lines) {
    const id = l.productId.trim();
    const q = Math.floor(Number(l.quantity));
    if (!id || q < 1) throw new Error("INVALID_LINE");
    merged.set(id, (merged.get(id) ?? 0) + q);
  }

  if (merged.size === 0) throw new Error("EMPTY");

  const products = await prisma.product.findMany({
    where: { id: { in: [...merged.keys()] } },
    select: {
      id: true,
      price: true,
      weightGrams: true,
      lengthCm: true,
      widthCm: true,
      heightCm: true,
    },
  });

  if (products.length !== merged.size) throw new Error("PRODUCT_NOT_FOUND");

  let weightGrams = 0;
  let lengthCm = DEFAULT_PKG.lengthCm;
  let widthCm = DEFAULT_PKG.widthCm;
  let heightCm = DEFAULT_PKG.heightCm;
  let insuranceDeclaredRaw = 0;
  const sfProducts: SuperFreteProductInput[] = [];

  for (const p of products) {
    const qty = merged.get(p.id) ?? 0;
    const unitGrams =
      p.weightGrams != null && p.weightGrams > 0
        ? p.weightGrams
        : DEFAULT_PKG.weightGrams;

    const dims = packageToSuperFreteKgCm({
      weightGrams: unitGrams,
      lengthCm: positiveDimCm(p.lengthCm) ?? DEFAULT_PKG.lengthCm,
      widthCm: positiveDimCm(p.widthCm) ?? DEFAULT_PKG.widthCm,
      heightCm: positiveDimCm(p.heightCm) ?? DEFAULT_PKG.heightCm,
    });

    weightGrams += Math.round(unitGrams * qty);
    if (dims.lengthCm > lengthCm) lengthCm = dims.lengthCm;
    if (dims.widthCm > widthCm) widthCm = dims.widthCm;
    if (dims.heightCm > heightCm) heightCm = dims.heightCm;

    insuranceDeclaredRaw += Math.max(0, Math.round(p.price * qty * 100) / 100);

    const lineInsurance = Math.max(0, Math.round(p.price * qty * 100) / 100);
    sfProducts.push({
      id: p.id,
      quantity: qty,
      weight: dims.weightKg,
      height: dims.heightCm,
      width: dims.widthCm,
      length: dims.lengthCm,
      insurance_value: Math.round((lineInsurance / qty) * 100) / 100,
    });
  }

  const { insuranceValue, useInsurance } =
    normalizeSuperfreteInsurance(insuranceDeclaredRaw);

  return {
    weightGrams,
    lengthCm,
    widthCm,
    heightCm,
    insuranceDeclared: insuranceValue ?? 0,
    useInsurance,
    products: sfProducts,
  };
}

/** Embalagem padrão para itens sem produto no catálogo (venda avulsa descritiva). */
export function buildDefaultShippingPackage(input: {
  quantity: number;
  insuranceValue: number;
}): BuiltCartPackage {
  const qty = Math.max(1, Math.floor(Number(input.quantity)) || 1);
  const dims = packageToSuperFreteKgCm({
    weightGrams: DEFAULT_PKG.weightGrams,
    lengthCm: DEFAULT_PKG.lengthCm,
    widthCm: DEFAULT_PKG.widthCm,
    heightCm: DEFAULT_PKG.heightCm,
  });
  const { insuranceValue, useInsurance } = normalizeSuperfreteInsurance(
    Math.max(0, Number(input.insuranceValue) || 0)
  );

  return {
    weightGrams: Math.round(DEFAULT_PKG.weightGrams * qty),
    lengthCm: dims.lengthCm,
    widthCm: dims.widthCm,
    heightCm: dims.heightCm,
    insuranceDeclared: insuranceValue ?? 0,
    useInsurance,
    products: [
      {
        id: "default",
        quantity: qty,
        weight: dims.weightKg,
        height: dims.heightCm,
        width: dims.widthCm,
        length: dims.lengthCm,
        insurance_value:
          Math.round(((insuranceValue ?? 0) / qty) * 100) / 100,
      },
    ],
  };
}
