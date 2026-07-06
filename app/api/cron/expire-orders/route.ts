import { NextRequest, NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron/authorize-cron-request";
import { expireOrdersBatch } from "@/lib/orders/expire-orders";

export const dynamic = "force-dynamic";

async function runExpireOrders(): Promise<NextResponse> {
  const { expiredOrderIds } = await expireOrdersBatch();

  if (expiredOrderIds.length > 0) {
    console.info(
      "[cron/expire-orders] pedidos expirados:",
      expiredOrderIds.length,
      expiredOrderIds
    );
  }

  return NextResponse.json({
    ok: true,
    expiredCount: expiredOrderIds.length,
    expiredOrderIds,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    return await runExpireOrders();
  } catch (e) {
    console.error("[cron/expire-orders]", e);
    return NextResponse.json(
      { error: "Falha ao expirar pedidos." },
      { status: 500 }
    );
  }
}

/** Vercel Cron invoca GET por padrão; reutiliza a mesma lógica do POST. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}
