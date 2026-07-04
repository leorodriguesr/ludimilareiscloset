import { NextRequest, NextResponse } from "next/server";
import { quoteShippingForOrder } from "@/lib/shipping/quote-order";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { requireAdminApi } from "@/lib/require-admin-api";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        shippingServiceId: true,
        shippingServiceName: true,
        shippingQuotedPrice: true,
        destinationCep: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    const quote = await quoteShippingForOrder(id);
    return NextResponse.json({
      current: {
        shippingServiceId: order.shippingServiceId,
        shippingServiceName: order.shippingServiceName,
        shippingQuotedPrice: order.shippingQuotedPrice,
        destinationCep: order.destinationCep,
      },
      ...quote,
    });
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/admin/orders/:id/shipping/quote]", e);
    return NextResponse.json({ error: "Erro ao cotar frete." }, { status: 500 });
  }
}
