import { NextRequest, NextResponse } from "next/server";
import { ExchangeStatus } from "@/app/generated/prisma/client";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { createExchange } from "@/lib/exchanges/create-exchange";
import { canBypassExchangeWindow } from "@/lib/exchanges/eligibility";
import { parseExchangeWriteBody } from "@/lib/exchanges/parse-write-body";
import { ExchangeError } from "@/lib/exchanges/constants";
import { exchangeDetailInclude } from "@/lib/exchanges/include";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const status = request.nextUrl.searchParams.get("status");
  const where =
    status && status !== "all"
      ? { status: status as ExchangeStatus }
      : {};

  try {
    const exchanges = await prisma.exchange.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            recipientName: true,
            email: true,
            destinationCep: true,
            fulfillmentType: true,
            shippingServiceName: true,
            deliveryNotes: true,
            items: {
              select: {
                id: true,
                productName: true,
                productImageUrl: true,
                pieceSelectionsJson: true,
                quantity: true,
              },
            },
          },
        },
        items: true,
        shippings: true,
        openedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ exchanges });
  } catch (e) {
    console.error("[GET /api/admin/exchanges]", e);
    return NextResponse.json({ error: "Erro ao listar trocas." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  try {
    const parsed = parseExchangeWriteBody(b);

    const exchange = await createExchange({
      ...parsed,
      openedByUserId: gate.userId,
      bypassExchangeWindow: canBypassExchangeWindow(gate.role),
    });

    const full = await prisma.exchange.findUnique({
      where: { id: exchange.id },
      include: exchangeDetailInclude,
    });

    return NextResponse.json({ exchange: full }, { status: 201 });
  } catch (e) {
    if (e instanceof ExchangeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    console.error("[POST /api/admin/exchanges]", e);
    return NextResponse.json({ error: "Erro ao criar troca." }, { status: 500 });
  }
}
