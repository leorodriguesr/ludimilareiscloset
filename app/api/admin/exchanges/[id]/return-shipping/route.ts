import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { ExchangeError } from "@/lib/exchanges/constants";
import {
  defaultReturnDestinationAddress,
  registerManualReturn,
} from "@/lib/exchanges/register-manual-return";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.EXCHANGES_MANAGE);
  if (gate instanceof NextResponse) return gate;
  void params;
  const address = await defaultReturnDestinationAddress();
  return NextResponse.json({ defaultAddress: address });
}

export async function PATCH(request: NextRequest, { params }: Params) {
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

  try {
    const exchange = await registerManualReturn({
      exchangeId: id,
      actorUserId: gate.userId,
      trackingCode: String(b.trackingCode ?? ""),
      postingLocationName: String(b.postingLocationName ?? ""),
      postingLocationAddress: String(b.postingLocationAddress ?? ""),
      shippingServiceName:
        typeof b.shippingServiceName === "string"
          ? b.shippingServiceName
          : null,
    });
    return NextResponse.json({ exchange });
  } catch (e) {
    if (e instanceof ExchangeError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    console.error("[PATCH /api/admin/exchanges/:id/return-shipping]", e);
    return NextResponse.json(
      { error: "Erro ao salvar reversa manual." },
      { status: 500 }
    );
  }
}
