import { NextRequest, NextResponse } from "next/server";
import { attachOrderPaymentShare } from "@/lib/admin-sale/order-payment-share";
import { prisma } from "@/lib/prisma";
import { expireOrdersBatch } from "@/lib/orders/expire-orders";
import {
  fetchOrderContactAddressByIds,
  mergeOrderContactAddress,
} from "@/lib/orders/order-contact-address";
import {
  fetchOrderShippingFieldsByIds,
  mergeOrderShippingFields,
} from "@/lib/orders/order-shipping-fields";
import { requireAdminApi } from "@/lib/require-admin-api";
import { OrderSource } from "@/app/generated/prisma/client";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  clampAdminListPage,
  parseAdminListLimit,
  parseAdminListPage,
  saleListDateWhere,
  searchDigits,
} from "@/lib/admin/list-pagination";

const INACTIVE: Prisma.OrderWhereInput = {
  status: { in: ["cancelled", "expired"] },
};

const ACTIVE: Prisma.OrderWhereInput = {
  status: { notIn: ["cancelled", "expired"] },
};

function statusWhere(statusFilter: string | null): Prisma.OrderWhereInput {
  if (statusFilter === "paid") {
    return { AND: [ACTIVE, { paidAt: { not: null } }] };
  }
  if (statusFilter === "waiting") {
    return { AND: [ACTIVE, { paidAt: null }] };
  }
  if (statusFilter === "to_pack") {
    return {
      AND: [ACTIVE, { paidAt: { not: null } }, { shippingStatus: "to_pack" }],
    };
  }
  if (statusFilter === "cancelled") return INACTIVE;
  return {};
}

function originWhere(origin: string | null): Prisma.OrderWhereInput {
  if (!origin) return {};
  if (origin === "checkout") {
    return { orderSource: OrderSource.CHECKOUT };
  }
  if (origin === "Admin") {
    return {
      orderSource: OrderSource.ADMIN_SALE,
      createdBy: { role: "ADMIN" },
    };
  }
  if (origin === "Avulsa") {
    return {
      orderSource: OrderSource.ADMIN_SALE,
      OR: [{ createdByUserId: null }, { createdBy: { is: { name: "" } } }],
    };
  }
  return {
    orderSource: OrderSource.ADMIN_SALE,
    createdBy: { name: { startsWith: origin } },
  };
}

function searchWhere(query: string): Prisma.OrderWhereInput {
  const q = query.trim();
  if (!q) return {};
  const number = searchDigits(q);
  const or: Prisma.OrderWhereInput[] = [
    { recipientName: { contains: q } },
    { email: { contains: q } },
    { user: { is: { name: { contains: q } } } },
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

async function collectSaleOrigins(): Promise<string[]> {
  const rows = await prisma.order.findMany({
    where: { orderSource: OrderSource.ADMIN_SALE },
    select: { createdBy: { select: { name: true, role: true } } },
    take: 400,
  });
  const labels = new Set<string>(["checkout"]);
  for (const row of rows) {
    if (row.createdBy?.role === "ADMIN") labels.add("Admin");
    const first = row.createdBy?.name?.trim().split(/\s+/)[0];
    if (first) labels.add(first);
    else labels.add("Avulsa");
  }
  const preferred = ["checkout", "Admin", "Avulsa"];
  const rest = [...labels]
    .filter((label) => !preferred.includes(label))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...preferred.filter((label) => labels.has(label)), ...rest];
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = request.nextUrl;
  const statusFilter = searchParams.get("status");
  const q = searchParams.get("q") ?? "";
  const origin = searchParams.get("origin");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = parseAdminListPage(searchParams.get("page"));
  const limit = parseAdminListLimit(searchParams.get("limit"));

  const shared = [searchWhere(q), originWhere(origin)];
  const where = andWhere([
    statusWhere(statusFilter),
    saleListDateWhere(from, to, statusFilter),
    ...shared,
  ]);

  try {
    try {
      await expireOrdersBatch();
    } catch (expireError) {
      console.error("[GET /api/admin/orders] expire batch", expireError);
    }

    const countWhere = (status: string | null) =>
      andWhere([statusWhere(status), saleListDateWhere(from, to, status), ...shared]);

    const [total, allTotal, paid, waiting, toPack, cancelled, origins] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.count(),
      prisma.order.count({ where: countWhere("paid") }),
      prisma.order.count({ where: countWhere("waiting") }),
      prisma.order.count({ where: countWhere("to_pack") }),
      prisma.order.count({ where: countWhere("cancelled") }),
      collectSaleOrigins(),
    ]);

    const safePage = clampAdminListPage(page, total, limit);
    const pageOrders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * limit,
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
    });

    const contactAddressById = await fetchOrderContactAddressByIds(
      pageOrders.map((order) => order.id)
    );
    const shippingById = await fetchOrderShippingFieldsByIds(
      pageOrders.map((order) => order.id)
    );
    const withAddress = mergeOrderContactAddress(pageOrders, contactAddressById);
    const enrichedOrders = mergeOrderShippingFields(withAddress, shippingById);
    const withPaymentShare = await attachOrderPaymentShare(enrichedOrders);

    return NextResponse.json({
      orders: withPaymentShare,
      total,
      allTotal,
      page: safePage,
      limit,
      origins,
      counts: {
        paid,
        waiting,
        to_pack: toPack,
        cancelled,
      },
    });
  } catch (e) {
    console.error("[GET /api/admin/orders]", e);
    return NextResponse.json({ error: "Erro ao listar pedidos." }, { status: 500 });
  }
}
