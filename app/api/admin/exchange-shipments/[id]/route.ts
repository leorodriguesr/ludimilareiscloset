import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { updateExchangeOutboundPacking } from "@/lib/exchanges/list-outbound-shipments";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;
  if (gate.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const shippingStatus = b.shippingStatus;
  if (shippingStatus !== "packed" && shippingStatus !== "delivered") {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  try {
    const shipments = await updateExchangeOutboundPacking({
      shippingId: id,
      shippingStatus,
    });
    if (!shipments) {
      return NextResponse.json({ error: "Reenvio não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ shipments });
  } catch (e) {
    console.error("[PATCH /api/admin/exchange-shipments/:id]", e);
    return NextResponse.json(
      { error: "Erro ao atualizar reenvio." },
      { status: 500 }
    );
  }
}
