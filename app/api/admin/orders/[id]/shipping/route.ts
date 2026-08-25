import { NextRequest, NextResponse } from "next/server";
import {
  parseArrangedModeInput,
  updateAdminSaleArrangedDelivery,
} from "@/lib/admin-sale/update-delivery-type";
import { updateOrderShippingOption } from "@/lib/orders/update-order-shipping";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let body: { optionId?: string; arrangedMode?: unknown };
  try {
    body = (await request.json()) as {
      optionId?: string;
      arrangedMode?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  try {
    if ("arrangedMode" in body) {
      const updated = await updateAdminSaleArrangedDelivery({
        orderId: id,
        arrangedMode: parseArrangedModeInput(body.arrangedMode),
        actorUserId: gate.userId,
      });
      return NextResponse.json(updated);
    }

    const updated = await updateOrderShippingOption(id, body.optionId ?? "", {
      actorUserId: gate.userId,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[PATCH /api/admin/orders/:id/shipping]", e);
    return NextResponse.json({ error: "Erro ao alterar frete." }, { status: 500 });
  }
}
