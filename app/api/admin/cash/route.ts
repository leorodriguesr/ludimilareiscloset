import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth/require-staff-api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const gate = await requireStaffApi();
  if (gate instanceof NextResponse) return gate;

  try {
    if (typeof prisma.cashLedgerEntry?.aggregate !== "function") {
      return NextResponse.json({
        inTotal: 0,
        outTotal: 0,
        net: 0,
        staleClient: true,
      });
    }

    const [ins, outs] = await Promise.all([
      prisma.cashLedgerEntry.aggregate({
        where: { direction: "IN" },
        _sum: { amount: true },
      }),
      prisma.cashLedgerEntry.aggregate({
        where: { direction: "OUT" },
        _sum: { amount: true },
      }),
    ]);

    const inTotal = Math.round((ins._sum.amount ?? 0) * 100) / 100;
    const outTotal = Math.round((outs._sum.amount ?? 0) * 100) / 100;

    return NextResponse.json({
      inTotal,
      outTotal,
      net: Math.round((inTotal - outTotal) * 100) / 100,
    });
  } catch (e) {
    console.error("[GET /api/admin/cash]", e);
    return NextResponse.json({ error: "Erro ao carregar caixa." }, { status: 500 });
  }
}
