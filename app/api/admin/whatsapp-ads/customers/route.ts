import { NextResponse } from "next/server";
import { loadMetaCustomerListCsv } from "@/lib/admin/load-meta-customer-list";
import { requireAdminRole } from "@/lib/auth/require-staff-api";

export async function GET() {
  const gate = await requireAdminRole();
  if (gate instanceof NextResponse) return gate;

  try {
    const { csv, customers } = await loadMetaCustomerListCsv();
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="clientes-meta.csv"',
        "Cache-Control": "no-store",
        "X-Customer-Count": String(customers),
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/whatsapp-ads/customers]", error);
    return NextResponse.json(
      { error: "Não foi possível gerar a lista de clientes." },
      { status: 500 }
    );
  }
}
