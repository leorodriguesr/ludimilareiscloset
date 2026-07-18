import { NextRequest, NextResponse } from "next/server";
import type { ExchangeItemDisposition } from "@/app/generated/prisma/client";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { ExchangeError } from "@/lib/exchanges/constants";
import { inspectExchange } from "@/lib/exchanges/inspect-exchange";

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
  const lines = Array.isArray(b.lines)
    ? b.lines.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          exchangeItemId: String(r.exchangeItemId ?? ""),
          disposition: r.disposition as ExchangeItemDisposition,
        };
      })
    : [];

  try {
    const exchange = await inspectExchange({
      exchangeId: id,
      actorUserId: gate.userId,
      lines,
    });
    return NextResponse.json({ exchange });
  } catch (e) {
    if (e instanceof ExchangeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    console.error("[POST /api/admin/exchanges/:id/inspect]", e);
    return NextResponse.json({ error: "Erro ao conferir troca." }, { status: 500 });
  }
}
