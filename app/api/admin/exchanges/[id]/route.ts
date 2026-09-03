import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { createExchange } from "@/lib/exchanges/create-exchange";
import { ExchangeError } from "@/lib/exchanges/constants";
import { canBypassExchangeWindow } from "@/lib/exchanges/eligibility";
import { exchangeDetailInclude } from "@/lib/exchanges/include";
import { parseExchangeWriteBody } from "@/lib/exchanges/parse-write-body";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  try {
    const exchange = await prisma.exchange.findUnique({
      where: { id },
      include: exchangeDetailInclude,
    });

    if (!exchange) {
      return NextResponse.json({ error: "Troca não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ exchange });
  } catch (e) {
    console.error("[GET /api/admin/exchanges/:id]", e);
    return NextResponse.json({ error: "Erro ao carregar troca." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  try {
    const parsed = parseExchangeWriteBody(body as Record<string, unknown>);
    const exchange = await createExchange({
      ...parsed,
      openedByUserId: gate.userId,
      bypassExchangeWindow: canBypassExchangeWindow(gate.role),
      replaceExchangeId: id,
    });
    const full = await prisma.exchange.findUnique({
      where: { id: exchange.id },
      include: exchangeDetailInclude,
    });
    return NextResponse.json({ exchange: full });
  } catch (e) {
    if (e instanceof ExchangeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    console.error("[PATCH /api/admin/exchanges/:id]", e);
    return NextResponse.json({ error: "Erro ao atualizar troca." }, { status: 500 });
  }
}
