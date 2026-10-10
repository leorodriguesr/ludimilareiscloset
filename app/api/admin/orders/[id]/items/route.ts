import { NextRequest, NextResponse } from "next/server";
import {
  AdminSaleItemsError,
  replaceAdminSaleItems,
} from "@/lib/admin-sale/replace-admin-sale-items";
import { requireStaffApi } from "@/lib/auth/require-staff-api";
import { OrderCreateError } from "@/lib/orders/create-order";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const gate = await requireStaffApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const lines =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).lines
      : undefined;
  const acceptBackorder = Boolean(
    body &&
    typeof body === "object" &&
    (body as Record<string, unknown>).acceptBackorder === true
  );

  try {
    const result = await replaceAdminSaleItems({
      orderId: id.trim(),
      lines,
      actorUserId: gate.userId,
      acceptBackorder,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof AdminSaleItemsError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof OrderCreateError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 409 }
      );
    }
    console.error("[PUT /api/admin/orders/:id/items]", e);
    return NextResponse.json(
      { error: "Não foi possível atualizar os itens." },
      { status: 500 }
    );
  }
}
