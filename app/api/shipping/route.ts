import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  packageToSuperFreteKgCm,
  calculateShippingSuperFreteWithStoreOrigin,
  normalizePostalCode,
} from "@/lib/shipping/superfrete";
import { quoteShippingForCartLines } from "@/lib/shipping/quote-cart";
import { ShippingQuoteError } from "@/lib/shipping/types";

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

type ShippingBody = {
  destinationCep?: string;
  /** Quando informado, usa peso/dimensões do produto (com fallback). */
  productId?: string;
  /** Peso total = peso unitário × quantidade; dimensões permanecem as do cadastro. */
  quantity?: number;
  originCep?: string;
  /** Sobrescreve dimensões (útil para testes sem produto). */
  package?: {
    weightGrams?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
  };
  insuranceValue?: number;
  useInsurance?: boolean;
  /** Várias linhas do carrinho: agrupa peso/dimensões para cotação. */
  lines?: { productId?: string; quantity?: unknown }[];
};

export async function POST(request: NextRequest) {
  let body: ShippingBody;
  try {
    body = (await request.json()) as ShippingBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const destinationCep = normalizePostalCode(body.destinationCep ?? "");
  if (!destinationCep) {
    return NextResponse.json(
      { error: "Informe um CEP de destino válido (8 dígitos)." },
      { status: 400 }
    );
  }

  if (Array.isArray(body.lines) && body.lines.length > 0) {
    const lines = body.lines
      .map((r) => ({
        productId: String(r.productId ?? "").trim(),
        quantity: Math.floor(Number(r.quantity)),
      }))
      .filter((l) => l.productId && l.quantity >= 1);
    if (lines.length === 0) {
      return NextResponse.json(
        { error: "Linhas do carrinho inválidas." },
        { status: 400 }
      );
    }
    try {
      const options = await quoteShippingForCartLines(lines, destinationCep);
      return NextResponse.json({ options });
    } catch (e) {
      if (e instanceof ShippingQuoteError) {
        return NextResponse.json(
          { error: e.message, code: e.code, details: e.details },
          { status: e.status }
        );
      }
      const msg = e instanceof Error ? e.message : "";
      if (msg === "PRODUCT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Produto não encontrado." },
          { status: 404 }
        );
      }
      console.error("[POST /api/shipping] cart lines", e);
      return NextResponse.json(
        { error: "Erro ao calcular frete." },
        { status: 500 }
      );
    }
  }

  let pkg = { ...DEFAULT_PKG };

  const qtyRaw = Number(body.quantity);
  const quantity = Math.min(
    9999,
    Math.max(1, Number.isFinite(qtyRaw) ? Math.floor(qtyRaw) : 1)
  );

  let insuranceDeclared = 0;
  let useInsuranceFlag = false;

  if (body.productId) {
    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      select: {
        weightGrams: true,
        lengthCm: true,
        widthCm: true,
        heightCm: true,
        price: true,
      },
    });
    if (!product) {
      return NextResponse.json(
        { error: "Produto não encontrado." },
        { status: 404 }
      );
    }
    const len = positiveDimCm(product.lengthCm);
    const wid = positiveDimCm(product.widthCm);
    const hgt = positiveDimCm(product.heightCm);
    const unitGrams =
      product.weightGrams != null && product.weightGrams > 0
        ? product.weightGrams
        : DEFAULT_PKG.weightGrams;
    pkg = {
      weightGrams: Math.round(unitGrams * quantity),
      lengthCm: len ?? DEFAULT_PKG.lengthCm,
      widthCm: wid ?? DEFAULT_PKG.widthCm,
      heightCm: hgt ?? DEFAULT_PKG.heightCm,
    };

    const fromBody = body.insuranceValue;
    const declaredRaw =
      fromBody != null ? Number(fromBody) : product.price * quantity;
    const declared = Number.isFinite(declaredRaw)
      ? Math.max(0, Math.round(declaredRaw * 100) / 100)
      : 0;
    useInsuranceFlag = body.useInsurance !== false && declared > 0;
    insuranceDeclared = useInsuranceFlag ? declared : 0;
  } else {
    pkg.weightGrams = Math.round(DEFAULT_PKG.weightGrams * quantity);
    const n = Number(body.insuranceValue ?? 0);
    const declared = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
    useInsuranceFlag = body.useInsurance !== false && declared > 0;
    insuranceDeclared = useInsuranceFlag ? declared : 0;
  }

  if (body.package) {
    const p = body.package;
    if (p.weightGrams != null) pkg.weightGrams = p.weightGrams;
    if (p.lengthCm != null) pkg.lengthCm = p.lengthCm;
    if (p.widthCm != null) pkg.widthCm = p.widthCm;
    if (p.heightCm != null) pkg.heightCm = p.heightCm;
  }

  const dims = packageToSuperFreteKgCm(pkg);

  let originOverride: string | undefined;
  if (body.originCep != null && String(body.originCep).trim() !== "") {
    const o = normalizePostalCode(body.originCep);
    if (!o) {
      return NextResponse.json(
        { error: "CEP de origem inválido." },
        { status: 400 }
      );
    }
    originOverride = o;
  }

  try {
    const options = await calculateShippingSuperFreteWithStoreOrigin({
      destinationPostalCode: destinationCep,
      originPostalCode: originOverride ?? undefined,
      weightKg: dims.weightKg,
      heightCm: dims.heightCm,
      widthCm: dims.widthCm,
      lengthCm: dims.lengthCm,
      insuranceValue: insuranceDeclared,
      useInsurance: useInsuranceFlag,
    });

    return NextResponse.json({ options });
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json(
        { error: e.message, code: e.code, details: e.details },
        { status: e.status }
      );
    }
    console.error("[POST /api/shipping]", e);
    return NextResponse.json(
      { error: "Erro ao calcular frete." },
      { status: 500 }
    );
  }
}
