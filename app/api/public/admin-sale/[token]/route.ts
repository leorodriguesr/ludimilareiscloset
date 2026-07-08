import { NextRequest, NextResponse } from "next/server";
import { validateCustomerDataToken } from "@/lib/admin-sale/complete-customer-data";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const validation = await validateCustomerDataToken(token);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: validation.orderId },
    select: {
      orderNumber: true,
      total: true,
      items: {
        select: {
          quantity: true,
          price: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    orderNumber: order.orderNumber,
    total: order.total,
    totalFormatted: formatPrice(order.total),
    items: order.items.map((i) => ({
      name: i.product.name,
      quantity: i.quantity,
      price: i.price,
    })),
  });
}
