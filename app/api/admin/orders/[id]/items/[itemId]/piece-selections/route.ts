import { NextRequest, NextResponse } from "next/server";
import {
  UpdatePieceSelectionsError,
  updateOrderItemPieceSelections,
} from "@/lib/orders/update-order-item-piece-selections";
import { requireAdminApi } from "@/lib/require-admin-api";

type RouteContext = {
  params: Promise<{ id: string; itemId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id, itemId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  try {
    const result = await updateOrderItemPieceSelections({
      orderId: id,
      itemId,
      pieceSelections: b.pieceSelections,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof UpdatePieceSelectionsError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(
      "[PATCH /api/admin/orders/:id/items/:itemId/piece-selections]",
      e
    );
    return NextResponse.json(
      { error: "Erro ao atualizar cor/tamanho." },
      { status: 500 }
    );
  }
}
