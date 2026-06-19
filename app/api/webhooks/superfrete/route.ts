import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapSuperfreteStatusToShippingStatus } from "@/lib/shipping/service-id";

type SuperfreteWebhookPayload = {
  event?: string;
  data?: {
    id?: string;
    status?: string;
    tracking?: string | null;
    tracking_url?: string | null;
    tags?: { tag?: string; url?: string }[];
  };
};

function verifySuperfreteSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.SUPERFRETE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader?.trim()) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
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

async function resolveOrderIdFromWebhook(data: NonNullable<SuperfreteWebhookPayload["data"]>) {
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

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-me-signature");

  if (!verifySuperfreteSignature(rawBody, signature)) {
    console.warn("[webhook superfrete] assinatura inválida ou secret ausente");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: SuperfreteWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as SuperfreteWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const event = payload.event ?? "";
  const data = payload.data;
  if (!data?.id && !data?.tags?.length) {
    return NextResponse.json({ ok: false, error: "missing data" }, { status: 200 });
  }

  const orderId = await resolveOrderIdFromWebhook(data);
  if (!orderId) {
    if (process.env.NODE_ENV === "development") {
      console.info("[webhook superfrete] pedido não encontrado", { event, id: data.id });
    }
    return NextResponse.json({ ok: true, matched: false });
  }

  const sfStatus = data.status ?? event.replace(/^order\./, "");
  const mappedStatus = mapSuperfreteStatusToShippingStatus(sfStatus);
  const tracking = data.tracking?.trim() || undefined;

  const updates: Record<string, unknown> = {
    superfreteStatus: sfStatus || undefined,
    ...(tracking ? { trackingCode: tracking } : {}),
    ...(mappedStatus ? { shippingStatus: mappedStatus } : {}),
  };

  if (data.id) {
    updates.superfreteShipmentId = data.id;
  }

  const tagUrl = data.tags?.find((t) => t.url?.trim())?.url?.trim();
  if (tagUrl && (event === "order.generated" || event === "order.released")) {
    updates.labelUrl = tagUrl;
    updates.labelGeneratedAt = new Date();
  }

  try {
    await prisma.order.update({
      where: { id: orderId },
      data: updates,
    });

    if (process.env.NODE_ENV === "development") {
      console.info("[webhook superfrete]", { event, orderId, sfStatus, tracking });
    }

    return NextResponse.json({ ok: true, matched: true, orderId });
  } catch (e) {
    console.error("[webhook superfrete]", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
