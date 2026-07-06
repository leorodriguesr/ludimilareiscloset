import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth-session";
import { continueOrderPayment } from "@/lib/orders/continue-order-payment";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

export async function POST(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await getAppSession();
  if (!session.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.userId },
    select: { id: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 401 });
  }

  const { orderId } = await context.params;
  if (!orderId?.trim()) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const result = await continueOrderPayment({
    orderId: orderId.trim(),
    userId: user.id,
    userEmail: user.email,
  });

  if (!result.ok) {
    const status =
      result.code === "forbidden"
        ? 403
        : result.code === "not_found"
          ? 404
          : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status }
    );
  }

  return NextResponse.json(result);
}
