import { NextRequest, NextResponse } from "next/server";
import { cancelOrderLabel } from "@/lib/shipping/generate-order-label";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  let reason = "Cancelado pelo administrador";
  try {
    const body = (await request.json()) as { reason?: string };
    if (body.reason?.trim()) reason = body.reason.trim();
  } catch {
    /* corpo opcional */
  }

  try {
    await cancelOrderLabel(id, reason);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/admin/orders/:id/shipment/cancel]", e);
    return NextResponse.json({ error: "Erro ao cancelar etiqueta." }, { status: 500 });
  }
}
