import { NextRequest, NextResponse } from "next/server";
import { ExchangeShippingType } from "@/app/generated/prisma/client";
import { ExchangeError } from "@/lib/exchanges/constants";
import { generateExchangeLabel } from "@/lib/exchanges/generate-exchange-label";
import { prisma } from "@/lib/prisma";
import { generateOrderLabel } from "@/lib/shipping/generate-order-label";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { requireAdminApi } from "@/lib/require-admin-api";

const MAX_BULK = 25;
const CONCURRENCY = 3;

type BulkResult = {
  orderId: string;
  ok: boolean;
  error?: string;
  tracking?: string | null;
  labelUrl?: string;
};

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  let orderIds: string[] = [];
  try {
    const body = (await request.json()) as { orderIds?: unknown };
    if (Array.isArray(body.orderIds)) {
      orderIds = body.orderIds
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
        .slice(0, MAX_BULK);
    }
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!orderIds.length) {
    return NextResponse.json(
      { error: "Informe ao menos um pedido." },
      { status: 400 }
    );
  }

  const results = await runPool(orderIds, CONCURRENCY, async (orderId) => {
    try {
      const outbound = await prisma.exchangeShipping.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          type: true,
          exchangeId: true,
          shippingServiceId: true,
        },
      });
      if (outbound?.type === ExchangeShippingType.OUTBOUND) {
        const exchange = await generateExchangeLabel({
          exchangeId: outbound.exchangeId,
          type: "OUTBOUND",
          actorUserId: gate.userId,
          serviceId: outbound.shippingServiceId,
        });
        const shipping =
          exchange.shippings.find((row) => row.id === outbound.id) ??
          exchange.shippings.find((row) => row.type === ExchangeShippingType.OUTBOUND);
        return {
          orderId,
          ok: true,
          tracking: shipping?.trackingCode ?? null,
          labelUrl: shipping?.labelUrl ?? undefined,
        } satisfies BulkResult;
      }

      const result = await generateOrderLabel(orderId);
      return {
        orderId,
        ok: true,
        tracking: result.tracking ?? null,
        labelUrl: result.labelUrl,
      } satisfies BulkResult;
    } catch (e) {
      const message =
        e instanceof ExchangeError || e instanceof ShippingQuoteError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Erro ao gerar etiqueta.";
      return { orderId, ok: false, error: message } satisfies BulkResult;
    }
  });

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    results,
    okCount,
    failCount: results.length - okCount,
  });
}
