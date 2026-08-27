import {
  ExchangeShippingType,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import { ExchangeError } from "@/lib/exchanges/constants";
import { appendExchangeEvent } from "@/lib/exchanges/events";
import { exchangeDetailInclude } from "@/lib/exchanges/include";
import { prisma } from "@/lib/prisma";
import { resolveStoreSender } from "@/lib/shipping/superfrete-account";

function formatStoreAddress(store: {
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state_abbr: string;
  postal_code: string;
}): string {
  const street = [store.address, store.number].filter(Boolean).join(", ");
  const extra = [store.complement, store.district].filter(Boolean).join(" · ");
  const city = [store.city, store.state_abbr].filter(Boolean).join(" / ");
  const cep = store.postal_code.replace(/\D/g, "");
  const cepFmt =
    cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : store.postal_code;
  return [street, extra, city, cepFmt].filter(Boolean).join(" — ");
}

export async function defaultReturnDestinationAddress(): Promise<string> {
  try {
    const store = await resolveStoreSender();
    return formatStoreAddress(store);
  } catch {
    return "";
  }
}

export async function registerManualReturn(input: {
  exchangeId: string;
  actorUserId: string;
  trackingCode: string;
  postingLocationName: string;
  postingLocationAddress: string;
  shippingServiceName?: string | null;
}) {
  const trackingCode = input.trackingCode.trim();
  const postingLocationName = input.postingLocationName.trim();
  const postingLocationAddress = input.postingLocationAddress.trim();

  if (!trackingCode) {
    throw new ExchangeError("TRACKING_REQUIRED", "Informe o código de rastreio.");
  }
  if (!postingLocationName) {
    throw new ExchangeError(
      "POSTING_LOCATION_REQUIRED",
      "Informe o local de postagem."
    );
  }
  if (!postingLocationAddress) {
    throw new ExchangeError(
      "POSTING_ADDRESS_REQUIRED",
      "Informe o endereço de destino da postagem."
    );
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

  const shipping = exchange.shippings.find(
    (s) => s.type === ExchangeShippingType.RETURN
  );
  if (!shipping) {
    throw new ExchangeError("SHIPPING_MISSING", "Frete de retorno não configurado.");
  }
  if (shipping.method !== "CARRIER") {
    throw new ExchangeError(
      "NOT_CARRIER",
      "Só o retorno por transportadora usa reversa manual."
    );
  }
  if (shipping.superfreteShipmentId) {
    throw new ExchangeError(
      "AUTO_REVERSE_EXISTS",
      "Esta troca já tem reversa gerada automaticamente."
    );
  }

  const nextStatus =
    exchange.status === ExchangeStatus.AWAITING_RETURN
      ? ExchangeStatus.RETURN_IN_TRANSIT
      : exchange.status;

  await prisma.$transaction(async (tx) => {
    await tx.exchangeShipping.update({
      where: { id: shipping.id },
      data: {
        trackingCode,
        postingLocationName,
        postingLocationAddress,
        shippingServiceName:
          input.shippingServiceName?.trim() ||
          shipping.shippingServiceName ||
          "Reversa manual",
        shippingStatus: "posted",
        manualConfiguredAt: new Date(),
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
        postingLocationName,
        postingLocationAddress,
      },
    });
    await appendExchangeEvent(tx, {
      exchangeId: exchange.id,
      type: "RETURN_POSTED",
      actorUserId: input.actorUserId,
    });
  });

  return prisma.exchange.findUniqueOrThrow({
    where: { id: exchange.id },
    include: exchangeDetailInclude,
  });
}
