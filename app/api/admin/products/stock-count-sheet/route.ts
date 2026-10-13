import { NextResponse } from "next/server";
import { buildStockCountSheet } from "@/lib/admin/stock-count-sheet";
import { requireAdminRole } from "@/lib/auth/require-staff-api";

export async function GET() {
  const gate = await requireAdminRole();
  if (gate instanceof NextResponse) return gate;

  try {
    const { bytes, filename } = await buildStockCountSheet();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/products/stock-count-sheet]", error);
    return NextResponse.json(
      { error: "Não foi possível gerar a contagem de estoque." },
      { status: 500 }
    );
  }
}
