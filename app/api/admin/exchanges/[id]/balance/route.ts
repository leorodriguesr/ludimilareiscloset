import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { ExchangeError } from "@/lib/exchanges/constants";
import { settleExchangeBalance } from "@/lib/exchanges/settle-balance";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const action = b.action;
  if (
    action !== "mark_paid" &&
    action !== "waive" &&
    action !== "mark_credit_settled"
  ) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  try {
    const exchange = await settleExchangeBalance({
      exchangeId: id,
      actorUserId: gate.userId,
      action,
      notes: typeof b.notes === "string" ? b.notes : null,
    });
    return NextResponse.json({ exchange });
  } catch (e) {
    if (e instanceof ExchangeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    console.error("[POST /api/admin/exchanges/:id/balance]", e);
    return NextResponse.json({ error: "Erro ao atualizar saldo." }, { status: 500 });
  }
}
