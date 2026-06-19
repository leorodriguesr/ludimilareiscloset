import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchOrderContactAddressByIds,
  mergeOrderContactAddress,
} from "@/lib/orders/order-contact-address";
import {
  fetchOrderShippingFieldsByIds,
  mergeOrderShippingFields,
} from "@/lib/orders/order-shipping-fields";
import { requireAdminApi } from "@/lib/require-admin-api";

/**
 * Lista operacional de envios (pedidos pagos).
 * Filtros:
 *  - needs_label → sem etiqueta
 *  - packed      → etiqueta gerada, aguardando postagem
 *  - shipped     → postado
 *  - delivered   → entregue
 *  - cancelled   → cancelado
 *  - (omitido)   → todos pagos
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = request.nextUrl;
  const filter = searchParams.get("filter");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = 100;

  const baseWhere = { paidAt: { not: null as null } };

  const where =
    filter === "needs_label"
      ? { ...baseWhere, labelUrl: null, shippingStatus: { not: "cancelled" } }
      : filter === "packed"
        ? { ...baseWhere, shippingStatus: "packed" }
        : filter === "shipped"
          ? { ...baseWhere, shippingStatus: "shipped" }
          : filter === "delivered"
            ? { ...baseWhere, shippingStatus: "delivered" }
            : filter === "cancelled"
              ? { ...baseWhere, shippingStatus: "cancelled" }
              : baseWhere;

  try {
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { paidAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          email: true,
          shippingServiceName: true,
          shippingStatus: true,
          recipientName: true,
          superfreteShipmentId: true,
          labelUrl: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    const contactAddressById = await fetchOrderContactAddressByIds(
      orders.map((order) => order.id)
    );
    const shippingById = await fetchOrderShippingFieldsByIds(
      orders.map((order) => order.id)
    );
    const withAddress = mergeOrderContactAddress(orders, contactAddressById);
    const enrichedOrders = mergeOrderShippingFields(withAddress, shippingById);

    return NextResponse.json({ orders: enrichedOrders, total, page, limit });
  } catch (e) {
    console.error("[GET /api/admin/shipments]", e);
    return NextResponse.json({ error: "Erro ao listar envios." }, { status: 500 });
  }
}
