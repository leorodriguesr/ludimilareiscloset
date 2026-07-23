import { NextRequest, NextResponse } from "next/server";
import type { CartPieceSelection } from "@/lib/cart/types";
import { validatePaymentToken } from "@/lib/admin-sale/payment-page";
import { formatPrice } from "@/lib/format";
import { continueOrderPayment } from "@/lib/orders/continue-order-payment";
import {
  orderItemDisplayDescription,
  orderItemDisplayImageUrl,
  orderItemDisplayName,
} from "@/lib/orders/order-item-display";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ token: string }> };

function parsePieces(json: string | null): CartPieceSelection[] {
  try {
    return json ? (JSON.parse(json) as CartPieceSelection[]) : [];
  } catch {
    return [];
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const validation = await validatePaymentToken(token);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: validation.orderId },
    select: {
      orderNumber: true,
      total: true,
      shippingAmount: true,
      status: true,
      paidAt: true,
      items: {
        select: {
          id: true,
          quantity: true,
          price: true,
          productName: true,
          productDescription: true,
          productImageUrl: true,
          pieceSelectionsJson: true,
          product: {
            select: {
              name: true,
              description: true,
              images: {
                orderBy: { order: "asc" },
                take: 1,
                select: { url: true },
              },
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
  }

  const items = order.items.map((item) => ({
    id: item.id,
    name: orderItemDisplayName(item),
    description: orderItemDisplayDescription(item),
    quantity: item.quantity,
    price: item.price,
    imageUrl: orderItemDisplayImageUrl(item),
    pieces: parsePieces(item.pieceSelectionsJson).map((p) => ({
      pieceName: p.pieceName ?? "",
      color: p.color ?? null,
      size: p.size ?? null,
    })),
  }));

  const summary = {
    orderNumber: order.orderNumber,
    total: order.total,
    totalFormatted: formatPrice(order.total),
    shippingAmount: order.shippingAmount,
    items,
  };

  if (validation.paid) {
    return NextResponse.json({
      status: "paid",
      ...summary,
    });
  }

  const pay = await continueOrderPayment({
    orderId: validation.orderId,
    userId: "",
    userEmail: "",
    staffBypass: true,
  });

  if (!pay.ok) {
    return NextResponse.json({ error: pay.error }, { status: 400 });
  }

  if (pay.type === "paid") {
    return NextResponse.json({
      status: "paid",
      ...summary,
    });
  }

  if (pay.type !== "pix") {
    return NextResponse.json(
      { error: "Pagamento Pix indisponível para esta venda." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    status: "pending",
    ...summary,
    pixCode: pay.pixCode,
    pixQrBase64: pay.pixQrBase64,
    expiresAt: pay.expiresAt,
    amount: pay.amount,
  });
}
