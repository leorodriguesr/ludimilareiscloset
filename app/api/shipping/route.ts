import { NextRequest, NextResponse } from "next/server";
import { quoteShippingForCartLines } from "@/lib/shipping/quote-cart";
import { normalizePostalCode } from "@/lib/shipping/superfrete";
import { ShippingQuoteError } from "@/lib/shipping/types";

type ShippingBody = {
  destinationCep?: string;
  productId?: string;
  quantity?: number;
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

  const qtyRaw = Number(body.quantity);
  const quantity = Math.min(
    9999,
    Math.max(1, Number.isFinite(qtyRaw) ? Math.floor(qtyRaw) : 1)
  );

  let lines: { productId: string; quantity: number }[] = [];

  if (Array.isArray(body.lines) && body.lines.length > 0) {
    lines = body.lines
      .map((r) => ({
        productId: String(r.productId ?? "").trim(),
        quantity: Math.floor(Number(r.quantity)),
      }))
      .filter((l) => l.productId && l.quantity >= 1);
  } else if (body.productId?.trim()) {
    lines = [{ productId: body.productId.trim(), quantity }];
  }

  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Informe productId ou lines para calcular o frete." },
      { status: 400 }
    );
  }

  try {
    const quote = await quoteShippingForCartLines(lines, destinationCep);
    return NextResponse.json(quote);
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json(
        { error: e.message, code: e.code, details: e.details },
        { status: e.status }
      );
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
    }
    console.error("[POST /api/shipping]", e);
    return NextResponse.json({ error: "Erro ao calcular frete." }, { status: 500 });
  }
}
