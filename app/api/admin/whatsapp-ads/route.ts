import { NextRequest, NextResponse } from "next/server";
import { loadWhatsAppAdReport } from "@/lib/admin/load-whatsapp-ad-report";
import { requireAdminRole } from "@/lib/auth/require-staff-api";

export async function GET(request: NextRequest) {
  const gate = await requireAdminRole();
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = request.nextUrl;
  try {
    const report = await loadWhatsAppAdReport(
      searchParams.get("from"),
      searchParams.get("to")
    );
    return NextResponse.json(report);
  } catch (error) {
    console.error("[GET /api/admin/whatsapp-ads]", error);
    return NextResponse.json(
      { error: "Erro ao carregar os anúncios." },
      { status: 500 }
    );
  }
}
