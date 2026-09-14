import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { ReshipmentError } from "@/lib/reshipments/constants";
import { cancelOrderReshipment } from "@/lib/reshipments/create-reshipment";
import { updateReshipmentPacking } from "@/lib/reshipments/update-packing";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.SHIPPING_MANAGE);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const shippingStatus = b.shippingStatus;
  if (
    shippingStatus !== "to_pack" &&
    shippingStatus !== "packed" &&
    shippingStatus !== "shipped" &&
    shippingStatus !== "delivered"
  ) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  try {
    const updated = await updateReshipmentPacking({
      reshipmentId: id,
      shippingStatus,
      actorUserId: gate.userId,
    });
    if (!updated) {
      return NextResponse.json({ error: "Reenvio não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ReshipmentError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error("[PATCH /api/admin/reshipments/:id]", e);
    return NextResponse.json({ error: "Erro ao atualizar reenvio." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.SHIPPING_MANAGE);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let reason: string | null = null;
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason === "string") reason = body.reason;
  } catch {
    /* body opcional */
  }

  try {
    const reshipment = await cancelOrderReshipment({
      reshipmentId: id,
      actorUserId: gate.userId,
      reason,
    });
    return NextResponse.json({ reshipment });
  } catch (e) {
    if (e instanceof ReshipmentError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error("[DELETE /api/admin/reshipments/:id]", e);
    return NextResponse.json({ error: "Erro ao cancelar reenvio." }, { status: 500 });
  }
}
