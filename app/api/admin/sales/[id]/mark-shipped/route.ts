import { NextRequest, NextResponse } from "next/server";
import { markArrangedOrderShipped } from "@/lib/admin-sale/create-admin-sale";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const gate = await requirePermission(PERMISSION.SHIPPING_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await context.params;
  const result = await markArrangedOrderShipped({
    orderId: id,
    shippedByUserId: gate.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
