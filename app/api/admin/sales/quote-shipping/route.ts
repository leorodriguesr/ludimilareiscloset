import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { quoteShippingForCartLines } from "@/lib/shipping/quote-cart";

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
    const result = await quoteShippingForCartLines(
      lines.map((l) => {
        const row = l as Record<string, unknown>;
        return {
          productId: String(row.productId ?? ""),
          quantity: Number(row.quantity ?? 1),
        };
      }),
      destinationCep
    );
    return NextResponse.json(result);
  } catch (e) {
    console.error("[admin/sales/quote-shipping]", e);
    return NextResponse.json(
      { error: "Não foi possível calcular o frete." },
      { status: 400 }
    );
  }
}
