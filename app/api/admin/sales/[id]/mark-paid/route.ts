import { NextRequest, NextResponse } from "next/server";
import { markOrderItemPaidManually, markOrderPaidManually } from "@/lib/order/payment/manual-payment";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { PAYMENT_METHOD, type PaymentMethod } from "@/lib/orders/constants";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const gate = await requirePermission(PERMISSION.ADMIN_SALE_MARK_PAID);
  if (gate instanceof NextResponse) return gate;

  let paymentMethod: PaymentMethod | undefined;
  let itemId: string | undefined;
  try {
    const body = (await request.json()) as {
      paymentMethod?: unknown;
      itemId?: unknown;
    };
    if (body.paymentMethod === PAYMENT_METHOD.CARD) {
      paymentMethod = PAYMENT_METHOD.CARD;
    } else if (body.paymentMethod === PAYMENT_METHOD.PIX) {
      paymentMethod = PAYMENT_METHOD.PIX;
    }
    if (typeof body.itemId === "string" && body.itemId.trim()) {
      itemId = body.itemId.trim();
    }
  } catch {
    /* body opcional */
  }

  const { id } = await context.params;
  const result = itemId
    ? await markOrderItemPaidManually({
        orderId: id,
        itemId,
        markedByUserId: gate.userId,
      })
    : await markOrderPaidManually({
        orderId: id,
        paymentMethod,
        markedByUserId: gate.userId,
      });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
