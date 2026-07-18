import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  quoteShippingForCartLines,
  quoteShippingForDefaultPackage,
} from "@/lib/shipping/quote-cart";

export async function POST(request: NextRequest) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const destinationCep = String(b.destinationCep ?? "").trim();
  const lines = Array.isArray(b.lines) ? b.lines : [];

  if (!destinationCep || lines.length === 0) {
    return NextResponse.json(
      { error: "Informe CEP e produtos." },
      { status: 400 }
    );
  }

  try {
    const catalogLines: { productId: string; quantity: number }[] = [];
    for (const l of lines) {
      const row = l as Record<string, unknown>;
      const productId = String(row.productId ?? "").trim();
      const qty = Math.max(1, Math.floor(Number(row.quantity ?? 1)) || 1);
      if (!productId) continue;
      catalogLines.push({ productId, quantity: qty });
    }

    const result =
      catalogLines.length > 0
        ? await quoteShippingForCartLines(catalogLines, destinationCep)
        : await quoteShippingForDefaultPackage(destinationCep, {
            quantity: 1,
            insuranceValue: 0,
          });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[admin/exchanges/quote-shipping]", e);
    return NextResponse.json(
      { error: "Não foi possível calcular o frete." },
      { status: 400 }
    );
  }
}
