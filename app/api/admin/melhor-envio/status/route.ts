import { NextResponse } from "next/server";
import { UserRole } from "@/app/generated/prisma/client";
import { requireStaffApi } from "@/lib/auth/require-staff-api";
import { getMelhorEnvioConnectionStatus } from "@/lib/shipping/melhor-envio/auth";
import {
  melhorEnvioTargetLabel,
  melhorEnvioWalletUrl,
} from "@/lib/shipping/melhor-envio/env";
import {
  isMelhorEnvioEnabled,
  SHIPPING_PROVIDERS,
} from "@/lib/shipping/providers";

export async function GET() {
  const gate = await requireStaffApi();
  if (gate instanceof NextResponse) return gate;
  if (gate.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const status = await getMelhorEnvioConnectionStatus();
    const enabled = isMelhorEnvioEnabled();
    const activeProvider =
      enabled && status.connected
        ? SHIPPING_PROVIDERS.MELHOR_ENVIO
        : SHIPPING_PROVIDERS.SUPERFRETE;
    return NextResponse.json({
      enabled,
      activeProvider,
      ...status,
      environmentLabel: status.target
        ? melhorEnvioTargetLabel(status.target)
        : null,
      walletUrl: status.target ? melhorEnvioWalletUrl(status.target) : null,
    });
  } catch (e) {
    console.error("[GET /api/admin/melhor-envio/status]", e);
    return NextResponse.json(
      { error: "Erro ao consultar status Melhor Envio." },
      { status: 500 }
    );
  }
}
