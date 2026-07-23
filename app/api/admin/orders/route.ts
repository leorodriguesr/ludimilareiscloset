import { NextRequest, NextResponse } from "next/server";
import { attachOrderPaymentShare } from "@/lib/admin-sale/order-payment-share";
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
 * Filtros de status:
 *  - "paid"    → paidAt not null
 *  - "waiting" → paidAt null (aguardando pagamento, qualquer tempo)
 *  - (omitido) → todos os pedidos
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = request.nextUrl;
  const statusFilter = searchParams.get("status");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = 100;

  const where =
    statusFilter === "paid"
      ? { paidAt: { not: null } }
      : statusFilter === "waiting"
        ? { paidAt: null as null }
        : {};

  try {
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { name: true, email: true, phone: true } },
          createdBy: { select: { name: true, role: true } },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  weightGrams: true,
                  lengthCm: true,
                  widthCm: true,
                  heightCm: true,
                  images: {
                    orderBy: { order: "asc" },
                    take: 1,
                    select: { url: true },
                  },
                },
              },
            },
          },
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
    const withPaymentShare = await attachOrderPaymentShare(enrichedOrders);

    return NextResponse.json({
      orders: withPaymentShare,
      total,
      page,
      limit,
    });
  } catch (e) {
    console.error("[GET /api/admin/orders]", e);
    return NextResponse.json({ error: "Erro ao listar pedidos." }, { status: 500 });
  }
}
