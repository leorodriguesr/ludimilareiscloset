import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  saveSectionProductOrder,
  SectionProductOrderError,
} from "@/lib/admin/section-product-order";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const gate = await requirePermission(PERMISSION.PRODUCTS_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const productIds = Array.isArray((body as { productIds?: unknown }).productIds)
    ? (body as { productIds: unknown[] }).productIds.filter(
        (value): value is string => typeof value === "string"
      )
    : null;
  if (!productIds) {
    return NextResponse.json(
      { error: "Informe a lista de produtos." },
      { status: 400 }
    );
  }

  try {
    await saveSectionProductOrder(id, productIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SectionProductOrderError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[PUT /api/admin/sections/:id/products/order]", e);
    return NextResponse.json(
      { error: "Erro ao salvar a ordem da seção." },
      { status: 500 }
    );
  }
}
