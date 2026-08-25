import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isMelhorEnvioProtocolCode } from "@/lib/shipping/melhor-envio/label";
import {
  isCancelledProviderShipmentStatus,
  mapSuperfreteStatusToShippingStatus,
  providerShipmentStatusFromPayload,
} from "@/lib/shipping/service-id";
import { SHIPPING_PROVIDERS } from "@/lib/shipping/providers";

type MeWebhookPayload = {
  event?: string;
  data?: {
    id?: string;
    status?: string;
    tracking?: string | null;
    tracking_url?: string | null;
    canceled_at?: string | null;
    cancelled_at?: string | null;
    tags?: { tag?: string; url?: string }[];
  };
};

function verifyMeSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret =
    process.env.MELHOR_ENVIO_CLIENT_SECRET?.trim() ||
    process.env.MELHOR_ENVIO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader?.trim()) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const received = signatureHeader.trim();

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(received, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return expected === received;
  }
}

async function resolveOrderId(data: NonNullable<MeWebhookPayload["data"]>) {
  const shipmentId = data.id?.trim();
  if (shipmentId) {
    const byShipment = await prisma.order.findFirst({
      where: { superfreteShipmentId: shipmentId },
      select: { id: true },
    });
    if (byShipment) return byShipment.id;
  }

  for (const t of data.tags ?? []) {
    const tag = t.tag?.trim();
    if (!tag) continue;
    const byTag = await prisma.order.findUnique({
      where: { id: tag },
      select: { id: true },
    });
    if (byTag) return byTag.id;
  }

  return null;
}

async function resolveExchangeShippingId(
  data: NonNullable<MeWebhookPayload["data"]>
) {
  const shipmentId = data.id?.trim();
  if (!shipmentId) return null;
  const row = await prisma.exchangeShipping.findFirst({
    where: { superfreteShipmentId: shipmentId },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Se o redirect OAuth foi cadastrado por engano nesta URL de webhook,
 * encaminha code/state para o callback correto (evita HTTP 405).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (code && state) {
    const target = new URL(
      "/api/integrations/melhor-envio/callback",
      request.nextUrl.origin
    );
    request.nextUrl.searchParams.forEach((value, key) => {
      target.searchParams.set(key, value);
    });
    return NextResponse.redirect(target);
  }
  return NextResponse.json(
    {
      error:
        "Webhook Melhor Envio aceita apenas POST. URL de OAuth: /api/integrations/melhor-envio/callback",
    },
    { status: 405 }
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-me-signature");

  if (!verifyMeSignature(rawBody, signature)) {
    console.warn("[webhook melhor-envio] assinatura inválida ou secret ausente");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: MeWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MeWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const event = payload.event ?? "";
  const data = payload.data;
  if (!data?.id && !data?.tags?.length) {
    return NextResponse.json({ ok: false, error: "missing data" }, { status: 200 });
  }

  const meStatus = providerShipmentStatusFromPayload({
    status: data.status ?? event.replace(/^order\./, ""),
    canceled_at: data.canceled_at,
    cancelled_at: data.cancelled_at,
  });
  const labelCancelled =
    isCancelledProviderShipmentStatus(meStatus) || event === "order.cancelled";
  const mappedStatus = labelCancelled
    ? "cancelled"
    : mapSuperfreteStatusToShippingStatus(meStatus);
  const trackingRaw = data.tracking?.trim() || undefined;
  const tracking =
    trackingRaw && !isMelhorEnvioProtocolCode(trackingRaw)
      ? trackingRaw
      : undefined;
  const tagUrl = data.tags?.find((t) => t.url?.trim())?.url?.trim();

  const orderId = await resolveOrderId(data);
  if (orderId) {
    const updates: Record<string, unknown> = labelCancelled
      ? {
          shippingProvider: SHIPPING_PROVIDERS.MELHOR_ENVIO,
          superfreteStatus: "cancelled",
          shippingStatus: "cancelled",
          superfreteShipmentId: null,
          labelUrl: null,
          trackingCode: null,
          labelGeneratedAt: null,
        }
      : {
          shippingProvider: SHIPPING_PROVIDERS.MELHOR_ENVIO,
          superfreteStatus: meStatus || undefined,
          ...(tracking ? { trackingCode: tracking } : {}),
          ...(mappedStatus ? { shippingStatus: mappedStatus } : {}),
        };
    if (!labelCancelled && data.id) updates.superfreteShipmentId = data.id;
    if (
      !labelCancelled &&
      tagUrl &&
      (event === "order.generated" || event === "order.released")
    ) {
      updates.labelUrl = tagUrl;
      updates.labelGeneratedAt = new Date();
    }

    try {
      await prisma.order.update({ where: { id: orderId }, data: updates });
      return NextResponse.json({ ok: true, matched: true, orderId });
    } catch (e) {
      console.error("[webhook melhor-envio] order", e);
      return NextResponse.json({ error: "server" }, { status: 500 });
    }
  }

  const exchangeShippingId = await resolveExchangeShippingId(data);
  if (exchangeShippingId) {
    const shippingStatus =
      mappedStatus === "shipped" || mappedStatus === "delivered"
        ? mappedStatus
        : labelCancelled || meStatus === "cancelled"
          ? "cancelled"
          : "labeled";

    try {
      await prisma.exchangeShipping.update({
        where: { id: exchangeShippingId },
        data: labelCancelled
          ? {
              superfreteStatus: "cancelled",
              shippingStatus: "cancelled",
              superfreteShipmentId: null,
              labelUrl: null,
              trackingCode: null,
              labelGeneratedAt: null,
            }
          : {
              superfreteStatus: meStatus || undefined,
              ...(tracking ? { trackingCode: tracking } : {}),
              shippingStatus,
              ...(tagUrl ? { labelUrl: tagUrl, labelGeneratedAt: new Date() } : {}),
            },
      });
      return NextResponse.json({
        ok: true,
        matched: true,
        exchangeShippingId,
      });
    } catch (e) {
      console.error("[webhook melhor-envio] exchange", e);
      return NextResponse.json({ error: "server" }, { status: 500 });
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[webhook melhor-envio] sem match", { event, id: data.id });
  }
  return NextResponse.json({ ok: true, matched: false });
}
