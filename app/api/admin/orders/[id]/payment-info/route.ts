import { NextRequest, NextResponse } from "next/server";
import { ensureOrderPaymentToken } from "@/lib/admin-sale/payment-page";
import { continueOrderPayment } from "@/lib/orders/continue-order-payment";
import { requireStaffApi } from "@/lib/auth/require-staff-api";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function respondPaymentInfo(input: {
  orderId: string;
  userId: string;
  forceNewLink?: boolean;
}): Promise<NextResponse> {
  const result = await continueOrderPayment({
    orderId: input.orderId,
    userId: input.userId,
    userEmail: "",
    staffBypass: true,
    forceNewLink: input.forceNewLink,
  });

  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "not_pending" || result.code === "expired"
          ? 400
          : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status }
    );
  }

  if (result.type === "paid") {
    return NextResponse.json({ type: "paid" });
  }

  if (result.type === "pix") {
    try {
      const token = await ensureOrderPaymentToken(result.orderId);
      return NextResponse.json({
        type: "pix",
        pixCode: result.pixCode,
        amount: result.amount,
        ...(token
          ? {
              paymentUrl: token.paymentUrl,
              paymentPath: token.paymentPath,
              paymentToken: token.token,
            }
          : {}),
      });
    } catch (e) {
      console.error("[payment-info] ensureOrderPaymentToken", e);
      return NextResponse.json({
        type: "pix",
        pixCode: result.pixCode,
        amount: result.amount,
      });
    }
  }

  return NextResponse.json({
    type: "card",
    checkoutUrl: result.checkoutUrl,
  });
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const gate = await requireStaffApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  return respondPaymentInfo({
    orderId: id.trim(),
    userId: gate.userId,
  });
}

/** Regenera link de pagamento (cartão InfinitePay) sob demanda do admin. */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const gate = await requireStaffApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  let forceNew = true;
  try {
    const body = (await request.json()) as { forceNew?: unknown };
    if (body?.forceNew === false) forceNew = false;
  } catch {
    // body opcional — POST implica regenerar
  }

  return respondPaymentInfo({
    orderId: id.trim(),
    userId: gate.userId,
    forceNewLink: forceNew,
  });
}
