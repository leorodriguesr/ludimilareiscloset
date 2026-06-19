import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadLabelPdfForShipment } from "@/lib/shipping/fetch-label-pdf";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      orderNumber: true,
      superfreteShipmentId: true,
      labelUrl: true,
    },
  });

  if (!order?.superfreteShipmentId) {
    return NextResponse.json(
      { error: "Pedido não possui etiqueta gerada." },
      { status: 404 }
    );
  }

  try {
    const { pdf, labelUrl, refreshed } = await downloadLabelPdfForShipment(
      order.superfreteShipmentId,
      order.labelUrl
    );

    if (refreshed) {
      await prisma.order.update({
        where: { id },
        data: { labelUrl },
      });
    }

    const filename =
      order.orderNumber != null
        ? `etiqueta-pedido-${order.orderNumber}.pdf`
        : `etiqueta-${order.superfreteShipmentId}.pdf`;

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/admin/orders/:id/label/pdf]", e);
    return NextResponse.json({ error: "Erro ao baixar etiqueta." }, { status: 500 });
  }
}
