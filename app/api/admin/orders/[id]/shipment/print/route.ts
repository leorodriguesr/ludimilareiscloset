import { NextRequest, NextResponse } from "next/server";
import { reprintOrderLabel } from "@/lib/shipping/generate-order-label";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  try {
    const labelUrl = await reprintOrderLabel(id);
    return NextResponse.json({ labelUrl });
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/admin/orders/:id/shipment/print]", e);
    return NextResponse.json({ error: "Erro ao imprimir etiqueta." }, { status: 500 });
  }
}
