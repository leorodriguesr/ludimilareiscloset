import { prisma } from "@/lib/prisma";

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
};

/**
 * Agrega peso e dimensões das linhas do carrinho para cotação (um volume).
 * Peso soma; cada dimensão usa o máximo entre os itens (heurística simples).
 */
export async function buildCartShippingPackage(
  lines: CartShippingLine[]
): Promise<BuiltCartPackage> {
  const merged = new Map<string, number>();
  for (const l of lines) {
    const id = l.productId.trim();
    const q = Math.floor(Number(l.quantity));
    if (!id || q < 1) {
      throw new Error("INVALID_LINE");
    }
    merged.set(id, (merged.get(id) ?? 0) + q);
  }

  if (merged.size === 0) {
    throw new Error("EMPTY");
  }

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

  if (products.length !== merged.size) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  let weightGrams = 0;
  let lengthCm = DEFAULT_PKG.lengthCm;
  let widthCm = DEFAULT_PKG.widthCm;
  let heightCm = DEFAULT_PKG.heightCm;
  let insuranceDeclared = 0;

  for (const p of products) {
    const qty = merged.get(p.id) ?? 0;
    const unitGrams =
      p.weightGrams != null && p.weightGrams > 0
        ? p.weightGrams
        : DEFAULT_PKG.weightGrams;
    weightGrams += Math.round(unitGrams * qty);

    const len = positiveDimCm(p.lengthCm);
    const wid = positiveDimCm(p.widthCm);
    const hgt = positiveDimCm(p.heightCm);
    if (len != null) lengthCm = Math.max(lengthCm, len);
    if (wid != null) widthCm = Math.max(widthCm, wid);
    if (hgt != null) heightCm = Math.max(heightCm, hgt);

    insuranceDeclared += Math.max(0, Math.round(p.price * qty * 100) / 100);
  }

  const useInsurance = insuranceDeclared > 0;

  return {
    weightGrams,
    lengthCm,
    widthCm,
    heightCm,
    insuranceDeclared,
    useInsurance,
  };
}
