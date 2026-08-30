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
import { FulfillmentType } from "@/app/generated/prisma/client";
import type { Prisma } from "@/app/generated/prisma/client";
import { requireAdminApi } from "@/lib/require-admin-api";
import {
  clampAdminListPage,
  parseAdminListLimit,
  parseAdminListPage,
  searchDigits,
} from "@/lib/admin/list-pagination";

const BASE_WHERE: Prisma.OrderWhereInput = {
  paidAt: { not: null },
  status: { not: "cancelled" },
};

function filterWhere(filter: string | null): Prisma.OrderWhereInput {
  if (filter === "needs_label") {
    return { ...BASE_WHERE, labelUrl: null, fulfillmentType: FulfillmentType.CARRIER };
  }
  if (filter === "to_pack") return { ...BASE_WHERE, shippingStatus: "to_pack" };
  if (filter === "packed") return { ...BASE_WHERE, shippingStatus: "packed" };
  if (filter === "shipped") return { ...BASE_WHERE, shippingStatus: "shipped" };
  if (filter === "delivered") return { ...BASE_WHERE, shippingStatus: "delivered" };
  if (filter === "cancelled") return { ...BASE_WHERE, shippingStatus: "cancelled" };
  return BASE_WHERE;
}

function searchWhere(query: string): Prisma.OrderWhereInput {
  const q = query.trim();
  if (!q) return {};
  const number = searchDigits(q);
  const or: Prisma.OrderWhereInput[] = [
    { recipientName: { contains: q } },
    { email: { contains: q } },
    { trackingCode: { contains: q } },
  ];
  if (number != null) or.push({ orderNumber: number });
  return { OR: or };
}

function andWhere(parts: Prisma.OrderWhereInput[]): Prisma.OrderWhereInput {
  const filtered = parts.filter((part) => Object.keys(part).length > 0);
  if (filtered.length === 0) return {};
  if (filtered.length === 1) return filtered[0]!;
  return { AND: filtered };
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = request.nextUrl;
  const filter = searchParams.get("filter");
  const q = searchParams.get("q") ?? "";
  const page = parseAdminListPage(searchParams.get("page"));
  const limit = parseAdminListLimit(searchParams.get("limit"));

  const search = searchWhere(q);
  const where = andWhere([filterWhere(filter), search]);

  try {
    const countFor = (key: string | null) =>
      prisma.order.count({ where: andWhere([filterWhere(key), search]) });

    const [total, allTotal, needsLabel, toPack, packed, shipped, delivered, cancelled] =
      await Promise.all([
        prisma.order.count({ where }),
        prisma.order.count({ where: BASE_WHERE }),
        countFor("needs_label"),
        countFor("to_pack"),
        countFor("packed"),
        countFor("shipped"),
        countFor("delivered"),
        countFor("cancelled"),
      ]);

    const safePage = clampAdminListPage(page, total, limit);
    const orders = await prisma.order.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (safePage - 1) * limit,
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        email: true,
        fulfillmentType: true,
        orderSource: true,
        customerDataStatus: true,
        shippingServiceName: true,
        deliveryNotes: true,
        internalNotes: true,
        shippingStatus: true,
        shippingProvider: true,
        recipientName: true,
        superfreteShipmentId: true,
        labelUrl: true,
        paidAt: true,
        createdAt: true,
        items: {
          select: {
            id: true,
            quantity: true,
            price: true,
            pieceSelectionsJson: true,
            productId: true,
            productName: true,
            productDescription: true,
            productImageUrl: true,
            paymentStatus: true,
            product: {
              select: {
                id: true,
                name: true,
                description: true,
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
    });

    const contactAddressById = await fetchOrderContactAddressByIds(
      orders.map((order) => order.id)
    );
    const shippingById = await fetchOrderShippingFieldsByIds(
      orders.map((order) => order.id)
    );
    const withAddress = mergeOrderContactAddress(orders, contactAddressById);
    const enrichedOrders = mergeOrderShippingFields(withAddress, shippingById);

    return NextResponse.json({
      orders: enrichedOrders,
      total,
      allTotal,
      page: safePage,
      limit,
      counts: {
        needs_label: needsLabel,
        to_pack: toPack,
        packed,
        shipped,
        delivered,
        cancelled,
      },
    });
  } catch (e) {
    console.error("[GET /api/admin/shipments]", e);
    return NextResponse.json({ error: "Erro ao listar envios." }, { status: 500 });
  }
}
