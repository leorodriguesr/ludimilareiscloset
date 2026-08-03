import { NextResponse } from "next/server";
import { UserRole } from "@/app/generated/prisma/client";
import { requireStaffApi } from "@/lib/auth/require-staff-api";
import { disconnectMelhorEnvio } from "@/lib/shipping/melhor-envio/auth";

export async function POST() {
  const gate = await requireStaffApi();
  if (gate instanceof NextResponse) return gate;
  if (gate.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    await disconnectMelhorEnvio();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/admin/melhor-envio/disconnect]", e);
    return NextResponse.json(
      { error: "Erro ao desconectar Melhor Envio." },
      { status: 500 }
    );
  }
}
