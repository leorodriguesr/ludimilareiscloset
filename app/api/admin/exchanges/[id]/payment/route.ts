import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { PAYMENT_METHOD } from "@/lib/orders/constants";
import {
  getCurrentExchangeBalancePayment,
  initiateExchangeBalancePayment,
} from "@/lib/exchanges/initiate-balance-payment";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  try {
    const payment = await getCurrentExchangeBalancePayment(id);
    return NextResponse.json({ payment });
  } catch (e) {
    console.error("[GET /api/admin/exchanges/:id/payment]", e);
    return NextResponse.json(
      { error: "Erro ao consultar pagamento da diferença." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const method = b.paymentMethod;
  if (method !== PAYMENT_METHOD.PIX && method !== PAYMENT_METHOD.CARD) {
    return NextResponse.json(
      { error: "Informe paymentMethod: pix ou card." },
      { status: 400 }
    );
  }

  try {
    const result = await initiateExchangeBalancePayment({
      exchangeId: id,
      paymentMethod: method,
      actorUserId: gate.userId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[POST /api/admin/exchanges/:id/payment]", e);
    return NextResponse.json(
      { error: "Erro ao gerar pagamento da diferença." },
      { status: 500 }
    );
  }
}
