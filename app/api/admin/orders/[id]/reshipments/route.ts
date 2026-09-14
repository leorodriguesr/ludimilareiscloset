import { NextRequest, NextResponse } from "next/server";
import type { ExchangeShippingMethod } from "@/app/generated/prisma/client";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { defaultExchangeShippingMethodForOrder } from "@/lib/exchanges/shipping-method";
import { ReshipmentError } from "@/lib/reshipments/constants";
import { createOrderReshipment } from "@/lib/reshipments/create-reshipment";
import { loadReshipmentAvailability } from "@/lib/reshipments/load-availability";
import { listOrderReshipments } from "@/lib/reshipments/create-reshipment";
import type { CartPieceSelection } from "@/lib/cart/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.SHIPPING_MANAGE);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const availability = await loadReshipmentAvailability(id);
  if (!availability) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  }

  const reshipments = await listOrderReshipments(id);
  return NextResponse.json({
    cards: availability.cards,
    unavailableKeys: availability.unavailableKeys,
    defaultMethod: defaultExchangeShippingMethodForOrder(availability.order),
    destinationCep: availability.order.destinationCep,
    reshipments,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.SHIPPING_MANAGE);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const method = String(b.method ?? "") as ExchangeShippingMethod;
  if (method !== "CARRIER" && method !== "STORE_PICKUP" && method !== "LOCAL_COURIER") {
    return NextResponse.json({ error: "Tipo de envio inválido." }, { status: 400 });
  }

  const rawItems = Array.isArray(b.items) ? b.items : [];
  const items = rawItems.map((row) => {
    const r = row as Record<string, unknown>;
    const pieceSelections = Array.isArray(r.pieceSelections)
      ? (r.pieceSelections as CartPieceSelection[])
      : undefined;
    return {
      orderItemId: String(r.orderItemId ?? ""),
      quantity: Number(r.quantity ?? 0),
      pieceSelections,
    };
  });

  try {
    const reshipment = await createOrderReshipment({
      orderId: id,
      createdByUserId: gate.userId,
      notes: typeof b.notes === "string" ? b.notes : null,
      method,
      shippingServiceId:
        b.shippingServiceId != null ? Number(b.shippingServiceId) : null,
      shippingServiceName:
        typeof b.shippingServiceName === "string" ? b.shippingServiceName : null,
      quotedPrice: b.quotedPrice != null ? Number(b.quotedPrice) : null,
      packageHeightCm:
        b.packageHeightCm != null ? Number(b.packageHeightCm) : null,
      packageWidthCm: b.packageWidthCm != null ? Number(b.packageWidthCm) : null,
      packageLengthCm:
        b.packageLengthCm != null ? Number(b.packageLengthCm) : null,
      packageWeightKg:
        b.packageWeightKg != null ? Number(b.packageWeightKg) : null,
      items,
    });
    return NextResponse.json({ reshipment });
  } catch (e) {
    if (e instanceof ReshipmentError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error("[POST /api/admin/orders/:id/reshipments]", e);
    return NextResponse.json({ error: "Erro ao criar reenvio." }, { status: 500 });
  }
}
