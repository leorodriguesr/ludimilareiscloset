import { NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { listExchangeOutboundShipments } from "@/lib/exchanges/list-outbound-shipments";

export async function GET() {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  try {
    const shipments = await listExchangeOutboundShipments();
    return NextResponse.json({ shipments });
  } catch (e) {
    console.error("[GET /api/admin/exchange-shipments]", e);
    return NextResponse.json(
      { error: "Erro ao listar reenvios de troca." },
      { status: 500 }
    );
  }
}
