import { NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { exchangeDetailInclude } from "@/lib/exchanges/include";
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
