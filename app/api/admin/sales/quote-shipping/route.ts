import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  quoteShippingForCartLines,
  quoteShippingForDefaultPackage,
} from "@/lib/shipping/quote-cart";

export async function POST(request: NextRequest) {
  const gate = await requirePermission(PERMISSION.ADMIN_SALE_CREATE);
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
    let customQuantity = 0;
    let customInsurance = 0;

    for (const l of lines) {
      const row = l as Record<string, unknown>;
      const qty = Math.max(1, Math.floor(Number(row.quantity ?? 1)) || 1);
      const productId = String(row.productId ?? "").trim();
      const isCustom =
        row.kind === "custom" ||
        (!productId &&
          (row.description != null || row.unitPrice != null));

      if (isCustom) {
        customQuantity += qty;
        customInsurance += Math.max(0, Number(row.unitPrice ?? 0)) * qty;
        continue;
      }

      if (!productId) continue;
      catalogLines.push({ productId, quantity: qty });
    }

    const result =
      catalogLines.length > 0
        ? await quoteShippingForCartLines(catalogLines, destinationCep)
        : await quoteShippingForDefaultPackage(destinationCep, {
            quantity: customQuantity || 1,
            insuranceValue: customInsurance,
          });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[admin/sales/quote-shipping]", e);
    return NextResponse.json(
      { error: "Não foi possível calcular o frete." },
      { status: 400 }
    );
  }
}
