import { NextRequest, NextResponse } from "next/server";
import { ExchangeStatus, Prisma } from "@/app/generated/prisma/client";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { summarizeOrderExchangeEligibility, canBypassExchangeWindow } from "@/lib/exchanges/eligibility";
import { prisma } from "@/lib/prisma";

const LIST_LIMIT = 30;

function searchQueryReady(q: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/^#/, "").replace(/\D/g, "");
  if (digits.length >= 1 && /^\d+$/.test(trimmed.replace(/^#/, "").trim())) {
    return true;
  }
  return trimmed.length >= 2;
}

export async function GET(request: NextRequest) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!searchQueryReady(q)) {
    return NextResponse.json({ orders: [] });
  }

  const withoutHash = q.replace(/^#/, "").trim();
  const digits = withoutHash.replace(/\D/g, "");
  const isNumeric = digits.length >= 1 && /^\d+$/.test(withoutHash);

  const eligibleWhere = {
    paidAt: { not: null },
    status: "paid",
    shippingStatus: "delivered",
  } as const;

  try {
    const or: Prisma.OrderWhereInput[] = [
      { recipientName: { contains: q } },
      { email: { contains: q } },
      { id: q },
    ];

    if (isNumeric) {
      const asNumber = Number(digits);
      if (Number.isInteger(asNumber) && asNumber > 0) {
        or.push({ orderNumber: asNumber });
      }

      const numbered = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Order"
        WHERE "paidAt" IS NOT NULL
          AND status = 'paid'
          AND "shippingStatus" = 'delivered'
          AND "orderNumber" IS NOT NULL
          AND CAST("orderNumber" AS TEXT) LIKE ${`${digits}%`}
        ORDER BY "createdAt" DESC
        LIMIT ${LIST_LIMIT}
      `;
      const ids = numbered.map((row) => row.id);
      if (ids.length > 0) {
        or.push({ id: { in: ids } });
      }
    }

    const orders = await prisma.order.findMany({
      where: {
        ...eligibleWhere,
        OR: or,
      },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: {
        id: true,
        orderNumber: true,
        recipientName: true,
        email: true,
        destinationCep: true,
        total: true,
        paidAt: true,
        deliveredAt: true,
        fulfillmentType: true,
        shippingServiceName: true,
        deliveryNotes: true,
        shippingAmount: true,
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            productImageUrl: true,
            quantity: true,
            price: true,
            pieceSelectionsJson: true,
          },
        },
        exchanges: {
          where: { status: { not: ExchangeStatus.CANCELLED } },
          select: {
            items: {
              where: { direction: "RETURN" },
              select: {
                orderItemId: true,
                quantity: true,
                pieceSelectionsJson: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      orders: orders.map((order) => {
        const { exchanges, ...rest } = order;
        const eligibility = summarizeOrderExchangeEligibility({
          deliveredAt: order.deliveredAt,
          items: order.items,
          existingReturnLines: exchanges.flatMap((ex) =>
            ex.items.map((item) => ({
              orderItemId: item.orderItemId,
              quantity: item.quantity,
              pieceSelectionsJson: item.pieceSelectionsJson,
            }))
          ),
          hasActiveExchange: exchanges.length > 0,
          bypassWindow: canBypassExchangeWindow(gate.role),
        });
        return {
          ...rest,
          paidAt: order.paidAt?.toISOString() ?? null,
          deliveredAt: order.deliveredAt?.toISOString() ?? null,
          selectable: eligibility.selectable,
          blockReason: eligibility.blockReason,
          unavailableReturnKeys: eligibility.unavailableReturnKeys,
        };
      }),
    });
  } catch (e) {
    console.error("[GET /api/admin/exchanges/orders]", e);
    return NextResponse.json(
      { error: "Erro ao buscar pedidos." },
      { status: 500 }
    );
  }
}
