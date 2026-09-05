import { NextRequest, NextResponse } from "next/server";
import {
  dashboardMetricsForRole,
  getDashboardMetrics,
  parseDashboardDateRange,
} from "@/lib/admin/dashboard-metrics";
import { requireStaffApi } from "@/lib/auth/require-staff-api";

export async function GET(request: NextRequest) {
  const gate = await requireStaffApi();
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = request.nextUrl;
  const range = parseDashboardDateRange(
    searchParams.get("from"),
    searchParams.get("to")
  );

  try {
    const metrics = dashboardMetricsForRole(
      await getDashboardMetrics(range),
      gate.role
    );
    return NextResponse.json(metrics);
  } catch (e) {
    console.error("[GET /api/admin/dashboard]", e);
    return NextResponse.json(
      { error: "Erro ao carregar o dashboard." },
      { status: 500 }
    );
  }
}
