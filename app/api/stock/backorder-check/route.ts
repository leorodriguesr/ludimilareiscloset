import { NextRequest, NextResponse } from "next/server";
import type { CartPieceSelection } from "@/lib/cart/types";
import { listBackorderGaps } from "@/lib/orders/stock/backorder-gaps";

type InputLine = {
  productId?: unknown;
  quantity?: unknown;
  pieceSelections?: unknown;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    lines?: InputLine[];
  } | null;
  if (!Array.isArray(body?.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "Carrinho inválido." }, { status: 400 });
  }

  const lines = body.lines.map((line) => ({
    productId: String(line.productId ?? "").trim(),
    quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
    pieceSelections: Array.isArray(line.pieceSelections)
      ? (line.pieceSelections as CartPieceSelection[])
      : undefined,
  }));
  if (lines.some((line) => !line.productId)) {
    return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
  }

  try {
    const gaps = await listBackorderGaps(lines);
    return NextResponse.json({
      shortages: gaps.filter((row) => row.allowed),
      blocked: gaps.filter((row) => !row.allowed),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível consultar o estoque.",
      },
      { status: 400 }
    );
  }
}
