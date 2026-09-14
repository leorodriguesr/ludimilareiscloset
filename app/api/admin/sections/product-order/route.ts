import { NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { listSectionProductOrder } from "@/lib/admin/section-product-order";

export async function GET() {
  const gate = await requirePermission(PERMISSION.PRODUCTS_MANAGE);
  if (gate instanceof NextResponse) return gate;

  try {
    const sections = await listSectionProductOrder();
    return NextResponse.json({ sections });
  } catch (e) {
    console.error("[GET /api/admin/sections/product-order]", e);
    return NextResponse.json(
      { error: "Erro ao carregar a ordenação das seções." },
      { status: 500 }
    );
  }
}
