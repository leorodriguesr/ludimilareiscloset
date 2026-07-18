import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { ExchangeError } from "@/lib/exchanges/constants";
import { cancelExchange } from "@/lib/exchanges/settle-balance";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* optional body */
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  try {
    const exchange = await cancelExchange({
      exchangeId: id,
      actorUserId: gate.userId,
      reason: typeof b.reason === "string" ? b.reason : null,
    });
    return NextResponse.json({ exchange });
  } catch (e) {
    if (e instanceof ExchangeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    console.error("[POST /api/admin/exchanges/:id/cancel]", e);
    return NextResponse.json({ error: "Erro ao cancelar troca." }, { status: 500 });
  }
}
