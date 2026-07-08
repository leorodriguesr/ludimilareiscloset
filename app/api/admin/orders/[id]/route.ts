import { NextRequest, NextResponse } from "next/server";
import { FulfillmentType } from "@/app/generated/prisma/client";
import { isCarrierShippingStatusLocked } from "@/lib/fulfillment/shipping-status-policy";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/require-admin-api";

const VALID_SHIPPING_STATUSES = [
  "to_pack",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if ("shippingStatus" in b) {
    const s = b.shippingStatus;
    if (!VALID_SHIPPING_STATUSES.includes(s as (typeof VALID_SHIPPING_STATUSES)[number])) {
      return NextResponse.json(
        { error: `shippingStatus inválido. Use: ${VALID_SHIPPING_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const order = await prisma.order.findUnique({
      where: { id },
      select: { fulfillmentType: true, shippingStatus: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    if (isCarrierShippingStatusLocked(order)) {
      return NextResponse.json(
        {
          error:
            "Status de envio bloqueado: enviado/recebido são atualizados automaticamente pela SuperFrete.",
        },
        { status: 400 }
      );
    }

    if (
      order.fulfillmentType === FulfillmentType.CARRIER &&
      (s === "shipped" || s === "delivered")
    ) {
      return NextResponse.json(
        {
          error:
            "Pedidos com transportadora só avançam para enviado/recebido via SuperFrete.",
        },
        { status: 400 }
      );
    }

    updates.shippingStatus = s;
  }

  if ("labelUrl" in b && typeof b.labelUrl === "string") {
    updates.labelUrl = b.labelUrl.trim() || null;
  }

  if ("superfreteShipmentId" in b && typeof b.superfreteShipmentId === "string") {
    updates.superfreteShipmentId = b.superfreteShipmentId.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar." }, { status: 400 });
  }

  try {
    const order = await prisma.order.update({
      where: { id },
      data: updates,
    });
    return NextResponse.json(order);
  } catch (e) {
    console.error("[PATCH /api/admin/orders/:id]", e);
    return NextResponse.json({ error: "Pedido não encontrado ou erro ao atualizar." }, { status: 404 });
  }
}
