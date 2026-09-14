import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { ReshipmentError } from "@/lib/reshipments/constants";
import { generateReshipmentLabel } from "@/lib/reshipments/generate-reship-label";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const gate = await requirePermission(PERMISSION.SHIPPING_MANAGE);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let serviceId: number | null = null;
  try {
    const body = (await request.json()) as { serviceId?: unknown };
    if (body.serviceId != null) serviceId = Number(body.serviceId);
  } catch {
    /* body opcional */
  }

  try {
    const reshipment = await generateReshipmentLabel({
      reshipmentId: id,
      actorUserId: gate.userId,
      serviceId,
    });
    return NextResponse.json({ reshipment });
  } catch (e) {
    if (e instanceof ReshipmentError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error("[POST /api/admin/reshipments/:id/labels]", e);
    return NextResponse.json({ error: "Erro ao gerar etiqueta." }, { status: 500 });
  }
}
