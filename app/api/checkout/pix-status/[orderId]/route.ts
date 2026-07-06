import { NextRequest, NextResponse } from "next/server";
import { confirmPaymentFromMercadoPago } from "@/lib/orders/confirm-payment";
import { PAYMENT_GATEWAY, PAYMENT_METHOD } from "@/lib/orders/constants";
import { getActivePaymentAttempt } from "@/lib/orders/get-active-payment-attempt";
import { prisma } from "@/lib/prisma";
import { getMpOrderStatus } from "@/lib/payments/create-pix-payment";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

/**
 * Polling de status do pagamento PIX via tentativa ACTIVE.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const { orderId } = await context.params;
  if (!orderId?.trim()) {
    return NextResponse.json({ error: "orderId obrigatório" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId.trim() },
    select: { status: true, paymentMethod: true },
  });

  if (!order) {
    return NextResponse.json({ error: "pedido não encontrado" }, { status: 404 });
  }

  if (order.paymentMethod !== PAYMENT_METHOD.PIX) {
    return NextResponse.json({ error: "não é pedido PIX" }, { status: 400 });
  }

  if (order.status === "paid") {
    return NextResponse.json(
      { status: "paid" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const attempt = await getActivePaymentAttempt(orderId.trim());
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
          payload: { orderId: orderId.trim(), mpStatus: mp.status },
        });
        if (result.updated) {
          return NextResponse.json(
            { status: "paid" },
            { headers: { "Cache-Control": "no-store" } }
          );
        }
      }
    } catch (e) {
      console.error("[pix-status] consulta MP", e);
    }
  }

  return NextResponse.json(
    { status: order.status },
    { headers: { "Cache-Control": "no-store" } }
  );
}
