import { NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { ExchangeError } from "@/lib/exchanges/constants";
import { completeExchange } from "@/lib/exchanges/settle-balance";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  try {
    const exchange = await completeExchange({
      exchangeId: id,
      actorUserId: gate.userId,
    });
    return NextResponse.json({ exchange });
  } catch (e) {
    if (e instanceof ExchangeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    console.error("[POST /api/admin/exchanges/:id/complete]", e);
    return NextResponse.json({ error: "Erro ao concluir troca." }, { status: 500 });
  }
}
