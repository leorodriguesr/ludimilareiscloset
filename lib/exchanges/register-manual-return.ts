import {
  ExchangeShippingType,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import { ExchangeError } from "@/lib/exchanges/constants";
import { appendExchangeEvent } from "@/lib/exchanges/events";
import { exchangeDetailInclude } from "@/lib/exchanges/include";
import { prisma } from "@/lib/prisma";

function optionalHttpUrl(value: string, field: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid");
    }
    return url.toString();
  } catch {
    throw new ExchangeError("INVALID_URL", `Informe um link válido em ${field}.`);
  }
}

export async function getReturnShipping(exchangeId: string) {
  const exchange = await prisma.exchange.findUnique({
    where: { id: exchangeId },
    include: {
      shippings: true,
      order: {
        select: {
          orderNumber: true,
          recipientName: true,
        },
      },
    },
  });
  if (!exchange) {
    throw new ExchangeError("NOT_FOUND", "Troca não encontrada.");
  }
  const shipping =
    exchange.shippings.find((s) => s.type === ExchangeShippingType.RETURN) ??
    null;
  return { exchange, shipping };
}

export async function registerManualReturn(input: {
  exchangeId: string;
  actorUserId: string;
  trackingCode: string;
  postingLocationAddress?: string | null;
  postingLocationMapsUrl?: string | null;
  labelUrl?: string | null;
  postingLocationName?: string | null;
  shippingServiceName?: string | null;
}) {
  const trackingCode = input.trackingCode.trim();
  const postingLocationAddress = input.postingLocationAddress?.trim() || null;
  const postingLocationName =
    input.postingLocationName?.trim() ||
    (postingLocationAddress ? "Ponto de postagem" : null);
  const postingLocationMapsUrl = optionalHttpUrl(
    input.postingLocationMapsUrl ?? "",
    "Google Maps"
  );
  const labelUrl = optionalHttpUrl(input.labelUrl ?? "", "etiqueta (PDF)");

  if (!trackingCode) {
    throw new ExchangeError("TRACKING_REQUIRED", "Informe o código de rastreio.");
  }

  const exchange = await prisma.exchange.findUnique({
    where: { id: input.exchangeId },
    include: { shippings: true },
  });

  if (!exchange) {
    throw new ExchangeError("NOT_FOUND", "Troca não encontrada.");
  }
  if (exchange.status === ExchangeStatus.CANCELLED) {
    throw new ExchangeError("CANCELLED", "Troca cancelada.");
  }

  let shipping = exchange.shippings.find(
    (s) => s.type === ExchangeShippingType.RETURN
  );
  if (!shipping) {
    shipping = await prisma.exchangeShipping.create({
      data: {
        exchangeId: exchange.id,
        type: ExchangeShippingType.RETURN,
        method: "CARRIER",
        paidBy: "STORE",
      },
    });
  }

  const alreadyConfigured = Boolean(
    shipping.manualConfiguredAt || shipping.trackingCode
  );
  const nextStatus =
    !alreadyConfigured && exchange.status === ExchangeStatus.AWAITING_RETURN
      ? ExchangeStatus.RETURN_IN_TRANSIT
      : exchange.status;

  await prisma.$transaction(async (tx) => {
    await tx.exchangeShipping.update({
      where: { id: shipping.id },
      data: {
        trackingCode,
        postingLocationName,
        postingLocationAddress,
        postingLocationMapsUrl,
        labelUrl,
        shippingServiceName:
          input.shippingServiceName?.trim() ||
          shipping.shippingServiceName ||
          "Reversa manual",
        shippingStatus: alreadyConfigured ? shipping.shippingStatus : "posted",
        manualConfiguredAt: shipping.manualConfiguredAt ?? new Date(),
      },
    });

    if (nextStatus !== exchange.status) {
      await tx.exchange.update({
        where: { id: exchange.id },
        data: { status: nextStatus },
      });
    }

    await appendExchangeEvent(tx, {
      exchangeId: exchange.id,
      type: "RETURN_MANUAL_REGISTERED",
      actorUserId: input.actorUserId,
      payload: {
        trackingCode,
        postingLocationAddress,
        postingLocationMapsUrl,
        labelUrl,
        edited: alreadyConfigured,
      },
    });
    if (!alreadyConfigured) {
      await appendExchangeEvent(tx, {
        exchangeId: exchange.id,
        type: "RETURN_POSTED",
        actorUserId: input.actorUserId,
      });
    }
  });

  return prisma.exchange.findUniqueOrThrow({
    where: { id: exchange.id },
    include: exchangeDetailInclude,
  });
}
