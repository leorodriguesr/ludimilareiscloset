import { NextRequest, NextResponse } from "next/server";
import { markOrderPaidManually } from "@/lib/order/payment/manual-payment";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { PAYMENT_METHOD, type PaymentMethod } from "@/lib/orders/constants";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const gate = await requirePermission(PERMISSION.ADMIN_SALE_MARK_PAID);
  if (gate instanceof NextResponse) return gate;

  let paymentMethod: PaymentMethod | undefined;
  try {
    const body = (await request.json()) as { paymentMethod?: unknown };
    if (body.paymentMethod === PAYMENT_METHOD.CARD) {
      paymentMethod = PAYMENT_METHOD.CARD;
    } else if (body.paymentMethod === PAYMENT_METHOD.PIX) {
      paymentMethod = PAYMENT_METHOD.PIX;
    }
  } catch {
    /* body opcional */
  }

  const { id } = await context.params;
  const result = await markOrderPaidManually({
    orderId: id,
    paymentMethod,
    markedByUserId: gate.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
