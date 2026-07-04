import { NextRequest, NextResponse } from "next/server";
import { cancelOrder } from "@/lib/orders/cancel-order";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let reason = "";
  try {
    const body = (await request.json()) as { reason?: string };
    reason = body.reason?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  try {
    const result = await cancelOrder(id, reason);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/admin/orders/:id/cancel]", e);
    return NextResponse.json({ error: "Erro ao cancelar venda." }, { status: 500 });
  }
}
