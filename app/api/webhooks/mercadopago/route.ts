import { NextRequest, NextResponse } from "next/server";
import { getMpOrderStatus } from "@/lib/payments/create-pix-payment";
import { markOrderPaidFromMercadoPago } from "@/lib/orders/mark-paid";
import crypto from "crypto";

/**
 * Valida a assinatura do webhook do Mercado Pago.
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
function validateMpSignature(request: NextRequest, dataId: string): boolean {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
  if (!secret) return true; // sem segredo configurado, aceita (configure em produção)

  const xSignature = request.headers.get("x-signature") ?? "";
  const xRequestId = request.headers.get("x-request-id") ?? "";

  // Formato: ts=...,v1=...
  const parts = Object.fromEntries(
    xSignature.split(",").map((p) => p.split("=", 2) as [string, string])
  );
  const ts = parts["ts"] ?? "";
  const v1 = parts["v1"] ?? "";
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const data = body["data"] as Record<string, unknown> | undefined;
  const dataIdFromBody = data?.["id"] ? String(data["id"]) : "";
  const dataIdFromQuery = request.nextUrl.searchParams.get("data.id") ?? "";
  const dataId = dataIdFromBody || dataIdFromQuery;

  const type = (body["type"] ?? body["topic"] ?? "") as string;
  const action = (body["action"] ?? "") as string;

  if (!validateMpSignature(request, dataId)) {
    console.warn("[webhook mercadopago] assinatura inválida");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (process.env.MERCADO_PAGO_WEBHOOK_DEBUG === "1") {
    console.info("[webhook mercadopago] payload", { type, action, dataId });
  }

  // A Orders API notifica com type/topic relacionado a "order".
  // Resolvemos sempre consultando a Order no MP para obter status + external_reference.
  if (!dataId) {
    return NextResponse.json({ ok: true, skipped: "no data.id" });
  }

  try {
    const mp = await getMpOrderStatus(dataId);

    if (process.env.NODE_ENV === "development") {
      console.info("[webhook mercadopago]", {
        mpOrderId: dataId,
        status: mp.status,
        externalReference: mp.externalReference,
      });
    }

    if (mp.paid) {
      const { updated } = await markOrderPaidFromMercadoPago({
        mpPaymentId: dataId,
        externalReference: mp.externalReference,
      });
      if (process.env.NODE_ENV === "development" && !updated) {
        console.info(
          "[webhook mercadopago] pedido não atualizado (já pago, inválido ou inexistente)"
        );
      }
    }
  } catch (e) {
    // Notificações de outros tópicos (ex.: payment) podem não resolver como order.
    if (process.env.MERCADO_PAGO_WEBHOOK_DEBUG === "1") {
      console.info("[webhook mercadopago] não resolvido como order", e);
    }
  }

  return NextResponse.json({ ok: true });
}
