import { NextResponse } from "next/server";
import {
  fetchSuperfreteUserInfo,
  superfreteWalletUrl,
} from "@/lib/shipping/superfrete-account";
import {
  readSuperFreteClientConfig,
  superfreteTargetLabel,
} from "@/lib/shipping/superfrete-client";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  try {
    const user = await fetchSuperfreteUserInfo();
    const cfg = readSuperFreteClientConfig();
    return NextResponse.json({
      balance: user.balance,
      shipmentsPending: user.shipmentsPending,
      shipmentsAvailable: user.shipmentsAvailable,
      walletUrl: superfreteWalletUrl(),
      accountEmail: user.email,
      environment: cfg.target,
      environmentLabel: superfreteTargetLabel(cfg.target),
      apiOrigin: cfg.apiOrigin,
    });
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/admin/superfrete/wallet]", e);
    return NextResponse.json({ error: "Erro ao consultar saldo SuperFrete." }, { status: 500 });
  }
}
