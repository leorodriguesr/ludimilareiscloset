import { NextRequest, NextResponse } from "next/server";
import { validatePaymentToken } from "@/lib/admin-sale/payment-page";
import { confirmPaymentFromMercadoPago } from "@/lib/orders/confirm-payment";
import { PAYMENT_GATEWAY, PAYMENT_METHOD } from "@/lib/orders/constants";
import { getActivePaymentAttempt } from "@/lib/orders/get-active-payment-attempt";
import { prisma } from "@/lib/prisma";
import { getMpOrderStatus } from "@/lib/payments/create-pix-payment";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const validation = await validatePaymentToken(token);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (validation.paid) {
    return NextResponse.json(
      { status: "paid" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: validation.orderId },
    select: { status: true, paymentMethod: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
  }

  if (order.paymentMethod !== PAYMENT_METHOD.PIX) {
    return NextResponse.json({ error: "Não é pagamento Pix." }, { status: 400 });
  }

  const attempt = await getActivePaymentAttempt(validation.orderId);
  const mpOrderId =
    attempt?.gateway === PAYMENT_GATEWAY.MERCADOPAGO
      ? attempt.gatewayReference
      : null;

  if (mpOrderId) {
    try {
      const mp = await getMpOrderStatus(mpOrderId);
      if (mp.paid) {
        const result = await confirmPaymentFromMercadoPago({
          mpOrderId,
          source: "polling",
          payload: { orderId: validation.orderId, paymentToken: token },
        });
        if (result.updated) {
          return NextResponse.json(
            { status: "paid" },
            { headers: { "Cache-Control": "no-store" } }
          );
        }
      }
    } catch (e) {
      console.error("[public/order-payment/status] consulta MP", e);
    }
  }

  return NextResponse.json(
    { status: order.status },
    { headers: { "Cache-Control": "no-store" } }
  );
}
