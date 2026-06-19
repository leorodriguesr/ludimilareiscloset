import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMpOrderStatus } from "@/lib/payments/create-pix-payment";
import { markOrderPaidFromMercadoPago } from "@/lib/orders/mark-paid";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

/**
 * Polling de status do pagamento PIX.
 * Consulta o Mercado Pago diretamente e atualiza o pedido caso já esteja pago
 * (funciona em localhost mesmo sem webhook). Retorna: pending_payment | paid.
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
    select: { status: true, paymentMethod: true, mercadoPagoPaymentId: true },
  });

  if (!order) {
    return NextResponse.json({ error: "pedido não encontrado" }, { status: 404 });
  }

  if (order.paymentMethod !== "pix") {
    return NextResponse.json({ error: "não é pedido PIX" }, { status: 400 });
  }

  // Já pago: responde imediatamente
  if (order.status === "paid") {
    return NextResponse.json(
      { status: "paid" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Consulta ativa no Mercado Pago (independente de webhook)
  if (order.mercadoPagoPaymentId) {
    try {
      const mp = await getMpOrderStatus(order.mercadoPagoPaymentId);
      if (mp.paid) {
        await markOrderPaidFromMercadoPago({
          mpPaymentId: order.mercadoPagoPaymentId,
          externalReference: orderId.trim(),
        });
        return NextResponse.json(
          { status: "paid" },
          { headers: { "Cache-Control": "no-store" } }
        );
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
