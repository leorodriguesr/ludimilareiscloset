import { NextRequest, NextResponse } from "next/server";
import { syncOrderShipmentFromSuperfrete } from "@/lib/shipping/generate-order-label";
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
    const info = await syncOrderShipmentFromSuperfrete(id);
    return NextResponse.json(info);
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/admin/orders/:id/shipment/sync]", e);
    return NextResponse.json({ error: "Erro ao sincronizar envio." }, { status: 500 });
  }
}
