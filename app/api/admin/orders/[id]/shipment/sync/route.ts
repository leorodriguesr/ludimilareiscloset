import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncOrderShipmentFromSuperfrete } from "@/lib/shipping/generate-order-label";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let quick = false;
  try {
    const body = (await request.json()) as { quick?: boolean };
    quick = body.quick === true;
  } catch {
    /* corpo opcional */
  }

  try {
    const info = await syncOrderShipmentFromSuperfrete(id, {
      pollTracking: !quick,
      maxWaitMs: quick ? 0 : 12_000,
    });
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        shippingStatus: true,
        trackingCode: true,
        labelUrl: true,
        superfreteStatus: true,
        superfreteShipmentId: true,
      },
    });
    return NextResponse.json({
      ...info,
      shippingStatus: order?.shippingStatus,
      trackingCode: order?.trackingCode ?? info.tracking,
      labelUrl: order?.labelUrl ?? info.labelUrl,
      superfreteStatus: order?.superfreteStatus ?? info.status,
      superfreteShipmentId: order?.superfreteShipmentId,
    });
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/admin/orders/:id/shipment/sync]", e);
    return NextResponse.json({ error: "Erro ao sincronizar envio." }, { status: 500 });
  }
}
