import { NextRequest, NextResponse } from "next/server";
import type {
  ExchangeShippingMethod,
  ExchangeShippingPaidBy,
  ExchangeShippingType,
} from "@/app/generated/prisma/client";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { addExchangeOutbound } from "@/lib/exchanges/add-outbound";
import { ExchangeError } from "@/lib/exchanges/constants";

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

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  try {
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
            unitPrice: r.unitPrice != null ? Number(r.unitPrice) : undefined,
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

    const s =
      b.shipping && typeof b.shipping === "object"
        ? (b.shipping as Record<string, unknown>)
        : {};
    const methodRaw = s.method;
    const method: ExchangeShippingMethod =
      methodRaw === "STORE_PICKUP" ||
      methodRaw === "LOCAL_COURIER" ||
      methodRaw === "CARRIER"
        ? methodRaw
        : "CARRIER";

    const exchange = await addExchangeOutbound({
      exchangeId: id,
      actorUserId: gate.userId,
      outboundLines,
      adjustmentAmount:
        b.adjustmentAmount != null ? Number(b.adjustmentAmount) : 0,
      adjustmentReason:
        typeof b.adjustmentReason === "string" ? b.adjustmentReason : null,
      shipping: {
        type: "OUTBOUND" as ExchangeShippingType,
        method,
        shippingServiceId:
          s.shippingServiceId != null ? Number(s.shippingServiceId) : null,
        shippingServiceName:
          typeof s.shippingServiceName === "string"
            ? s.shippingServiceName
            : null,
        quotedPrice: s.quotedPrice != null ? Number(s.quotedPrice) : null,
        paidBy: (s.paidBy as ExchangeShippingPaidBy) ?? "CUSTOMER",
        packageHeightCm:
          s.packageHeightCm != null ? Number(s.packageHeightCm) : null,
        packageWidthCm:
          s.packageWidthCm != null ? Number(s.packageWidthCm) : null,
        packageLengthCm:
          s.packageLengthCm != null ? Number(s.packageLengthCm) : null,
        packageWeightKg:
          s.packageWeightKg != null ? Number(s.packageWeightKg) : null,
      },
    });

    return NextResponse.json({ exchange });
  } catch (e) {
    if (e instanceof ExchangeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    console.error("[POST /api/admin/exchanges/:id/outbound]", e);
    return NextResponse.json({ error: "Erro ao definir o envio." }, { status: 500 });
  }
}
