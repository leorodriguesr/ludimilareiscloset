import { NextRequest, NextResponse } from "next/server";
import { continueOrderPayment } from "@/lib/orders/continue-order-payment";
import { requireStaffApi } from "@/lib/auth/require-staff-api";

interface RouteContext {
  params: Promise<{ id: string }>;
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

  const result = await continueOrderPayment({
    orderId: id.trim(),
    userId: gate.userId,
    userEmail: "",
    staffBypass: true,
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
    return NextResponse.json({
      type: "pix",
      pixCode: result.pixCode,
      amount: result.amount,
    });
  }

  return NextResponse.json({
    type: "card",
    checkoutUrl: result.checkoutUrl,
  });
}
