import { NextRequest, NextResponse } from "next/server";
import {
  ExchangeKind,
  ExchangeReason,
  ExchangeShippingMethod,
  ExchangeShippingPaidBy,
  ExchangeShippingType,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { createExchange } from "@/lib/exchanges/create-exchange";
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
            fulfillmentType: true,
            shippingServiceName: true,
            deliveryNotes: true,
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
    const returnLines = Array.isArray(b.returnLines)
      ? b.returnLines.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            orderItemId: String(r.orderItemId ?? ""),
            quantity: Math.floor(Number(r.quantity)),
          };
        })
      : [];

    const outboundLines = Array.isArray(b.outboundLines)
      ? b.outboundLines.map((row) => {
          const r = row as Record<string, unknown>;
          const quantity = Math.floor(Number(r.quantity));
          if (r.kind === "custom") {
            return {
              kind: "custom" as const,
              description: String(r.description ?? ""),
              quantity,
              unitPrice: Number(r.unitPrice ?? 0),
              pieces: Array.isArray(r.pieces)
                ? (r.pieces as {
                    name: string;
                    size: string;
                    color: string;
                  }[])
                : undefined,
            };
          }
          return {
            kind: "catalog" as const,
            productId: String(r.productId ?? ""),
            quantity,
            unitPrice:
              r.unitPrice != null ? Number(r.unitPrice) : undefined,
            pieceSelections: Array.isArray(r.pieceSelections)
              ? (r.pieceSelections as {
                  pieceName: string;
                  size: string | null;
                  color: string | null;
                }[])
              : undefined,
          };
        })
      : [];

    const shippings = Array.isArray(b.shippings)
      ? b.shippings.map((row) => {
          const r = row as Record<string, unknown>;
          const methodRaw = r.method;
          const method: ExchangeShippingMethod =
            methodRaw === "STORE_PICKUP" ||
            methodRaw === "LOCAL_COURIER" ||
            methodRaw === "CARRIER"
              ? methodRaw
              : "CARRIER";
          return {
            type: r.type as ExchangeShippingType,
            method,
            shippingServiceId:
              r.shippingServiceId != null
                ? Number(r.shippingServiceId)
                : null,
            shippingServiceName:
              typeof r.shippingServiceName === "string"
                ? r.shippingServiceName
                : null,
            quotedPrice:
              r.quotedPrice != null ? Number(r.quotedPrice) : null,
            paidBy: (r.paidBy as ExchangeShippingPaidBy) ?? "STORE",
            packageHeightCm:
              r.packageHeightCm != null ? Number(r.packageHeightCm) : null,
            packageWidthCm:
              r.packageWidthCm != null ? Number(r.packageWidthCm) : null,
            packageLengthCm:
              r.packageLengthCm != null ? Number(r.packageLengthCm) : null,
            packageWeightKg:
              r.packageWeightKg != null ? Number(r.packageWeightKg) : null,
          };
        })
      : [];

    const kind: ExchangeKind =
      b.kind === "RETURN" ? "RETURN" : "EXCHANGE";

    const exchange = await createExchange({
      orderId: String(b.orderId ?? ""),
      kind,
      reason: b.reason as ExchangeReason,
      reasonNotes: typeof b.reasonNotes === "string" ? b.reasonNotes : null,
      notes: typeof b.notes === "string" ? b.notes : null,
      openedByUserId: gate.userId,
      returnLines,
      outboundLines: kind === "RETURN" ? [] : outboundLines,
      shippings,
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
