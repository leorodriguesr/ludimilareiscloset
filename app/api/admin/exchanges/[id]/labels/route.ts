import { NextRequest, NextResponse } from "next/server";
import type { ExchangeShippingType } from "@/app/generated/prisma/client";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { ExchangeError } from "@/lib/exchanges/constants";
import { generateExchangeLabel } from "@/lib/exchanges/generate-exchange-label";

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
  const type = b.type as ExchangeShippingType;
  if (type !== "RETURN" && type !== "OUTBOUND") {
    return NextResponse.json(
      { error: "Tipo de etiqueta inválido (RETURN | OUTBOUND)." },
      { status: 400 }
    );
  }

  try {
    const exchange = await generateExchangeLabel({
      exchangeId: id,
      type,
      actorUserId: gate.userId,
      serviceId: b.serviceId != null ? Number(b.serviceId) : null,
    });
    return NextResponse.json({ exchange });
  } catch (e) {
    if (e instanceof ExchangeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    console.error("[POST /api/admin/exchanges/:id/labels]", e);
    return NextResponse.json({ error: "Erro ao gerar etiqueta." }, { status: 500 });
  }
}
