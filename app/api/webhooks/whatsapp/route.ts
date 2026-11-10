import { NextRequest, NextResponse } from "next/server";
import { recordWhatsAppAdClick } from "@/lib/meta/record-whatsapp-click";
import {
  parseWhatsAppAdReferrals,
  whatsappSignatureValid,
} from "@/lib/meta/whatsapp-referral";

export const runtime = "nodejs";

/**
 * Verificação do webhook no painel da Meta.
 * Env: WHATSAPP_VERIFY_TOKEN
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

  if (!expected || mode !== "subscribe" || token !== expected || !challenge) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * Mensagens recebidas na Cloud API. Grava o ctwa_clid do anúncio.
 * Env: WHATSAPP_APP_SECRET
 */
export async function POST(request: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret) {
    console.error("[webhook whatsapp] WHATSAPP_APP_SECRET ausente");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!whatsappSignatureValid(raw, signature, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const referrals = parseWhatsAppAdReferrals(payload);
  try {
    for (const referral of referrals) {
      await recordWhatsAppAdClick(referral);
    }
  } catch (error) {
    console.error("[webhook whatsapp]", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: referrals.length });
}
