import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { fetchSuperfreteOrderInfo } from "@/lib/shipping/superfrete-label";
import { ShippingQuoteError } from "@/lib/shipping/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const session = await getAppSession();
  if (!session.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      email: true,
      superfreteShipmentId: true,
      trackingCode: true,
      shippingStatus: true,
      superfreteStatus: true,
      shippingServiceId: true,
      shippingDeliveryDaysMin: true,
      shippingDeliveryDaysMax: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: session.user.userId },
    select: { id: true, email: true, role: true },
  });

  const isOwner =
    order.userId === session.user.userId ||
    (order.userId == null && order.email === userRecord?.email);
  const isStaff = userRecord?.role === "ADMIN" || userRecord?.role === "GESTOR";

  if (!isOwner && !isStaff) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  if (!order.superfreteShipmentId) {
    return NextResponse.json({
      trackingCode: order.trackingCode,
      shippingStatus: order.shippingStatus,
      superfreteStatus: order.superfreteStatus,
      shippingServiceId: order.shippingServiceId,
      deliveryMin: order.shippingDeliveryDaysMin,
      deliveryMax: order.shippingDeliveryDaysMax,
      liveInfo: null,
    });
  }

  try {
    const liveInfo = await fetchSuperfreteOrderInfo(order.superfreteShipmentId);
    return NextResponse.json({
      trackingCode: liveInfo.tracking ?? order.trackingCode,
      shippingStatus: order.shippingStatus,
      superfreteStatus: liveInfo.status ?? order.superfreteStatus,
      shippingServiceId: order.shippingServiceId,
      // Prazo do pedido (já inclui dias de embalagem da cotação); não usar o da SuperFrete.
      deliveryMin: order.shippingDeliveryDaysMin,
      deliveryMax: order.shippingDeliveryDaysMax,
      liveInfo,
    });
  } catch (e) {
    const msg = e instanceof ShippingQuoteError ? e.message : "Erro ao consultar rastreio.";
    return NextResponse.json({
      trackingCode: order.trackingCode,
      shippingStatus: order.shippingStatus,
      superfreteStatus: order.superfreteStatus,
      shippingServiceId: order.shippingServiceId,
      deliveryMin: order.shippingDeliveryDaysMin,
      deliveryMax: order.shippingDeliveryDaysMax,
      liveInfo: null,
      warning: msg,
    });
  }
}
