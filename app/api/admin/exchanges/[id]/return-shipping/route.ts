import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { ExchangeError } from "@/lib/exchanges/constants";
import {
  getReturnShipping,
  registerManualReturn,
} from "@/lib/exchanges/register-manual-return";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  try {
    const { exchange, shipping } = await getReturnShipping(id);
    return NextResponse.json({
      exchangeNumber: exchange.exchangeNumber,
      kind: exchange.kind,
      customerName: exchange.order.recipientName,
      shipping: shipping
        ? {
            trackingCode: shipping.trackingCode,
            postingLocationName: shipping.postingLocationName,
            postingLocationAddress: shipping.postingLocationAddress,
            postingLocationMapsUrl: shipping.postingLocationMapsUrl,
            labelUrl: shipping.labelUrl,
            manualConfiguredAt: shipping.manualConfiguredAt,
          }
        : null,
    });
  } catch (e) {
    if (e instanceof ExchangeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    console.error("[GET /api/admin/exchanges/:id/return-shipping]", e);
    return NextResponse.json(
      { error: "Erro ao carregar reversa." },
      { status: 500 }
    );
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
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  try {
    const exchange = await registerManualReturn({
      exchangeId: id,
      actorUserId: gate.userId,
      trackingCode: String(b.trackingCode ?? ""),
      postingLocationAddress: String(b.postingLocationAddress ?? ""),
      postingLocationMapsUrl:
        typeof b.postingLocationMapsUrl === "string"
          ? b.postingLocationMapsUrl
          : null,
      labelUrl: typeof b.labelUrl === "string" ? b.labelUrl : null,
      postingLocationName:
        typeof b.postingLocationName === "string"
          ? b.postingLocationName
          : null,
      shippingServiceName:
        typeof b.shippingServiceName === "string"
          ? b.shippingServiceName
          : null,
    });
    return NextResponse.json({ exchange });
  } catch (e) {
    if (e instanceof ExchangeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    console.error("[PATCH /api/admin/exchanges/:id/return-shipping]", e);
    return NextResponse.json(
      { error: "Erro ao salvar reversa manual." },
      { status: 500 }
    );
  }
}
