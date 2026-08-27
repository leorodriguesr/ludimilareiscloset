import {
  ExchangeShippingType,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import { appendExchangeEvent } from "@/lib/exchanges/events";
import { chooseReturnReverse } from "@/lib/exchanges/choose-return-reverse";
import { prisma } from "@/lib/prisma";
import {
  buildCartShippingPackage,
  buildDefaultShippingPackage,
} from "@/lib/shipping/cart-package";
import { getMelhorEnvioConnectionStatus } from "@/lib/shipping/melhor-envio/auth";
import {
  createMelhorEnvioReverseLabel,
  fetchMelhorEnvioOrderInfoWithTrackingPoll,
} from "@/lib/shipping/melhor-envio/label";
import { calculateShippingMelhorEnvio } from "@/lib/shipping/melhor-envio/quote";
import {
  isMelhorEnvioEnabled,
  SHIPPING_PROVIDERS,
} from "@/lib/shipping/providers";
import { mapSuperfreteStatusToShippingStatus } from "@/lib/shipping/service-id";
import { packageToSuperFreteKgCm } from "@/lib/shipping/superfrete";
import { resolveStoreSender } from "@/lib/shipping/superfrete-account";
import type { LabelParty } from "@/lib/shipping/superfrete-label";

function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function optionLabel(option: {
  carrierName: string;
  serviceName: string;
  price: number;
}): string {
  return `${option.carrierName} ${option.serviceName} ${formatBrl(option.price)}`;
}

async function isMelhorEnvioReady(): Promise<boolean> {
  if (!isMelhorEnvioEnabled()) return false;
  try {
    const status = await getMelhorEnvioConnectionStatus();
    return Boolean(status.configured && status.connected);
  } catch {
    return false;
  }
}

function customerPartyFromOrder(order: {
  recipientName: string | null;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  destinationCep: string | null;
}): LabelParty | null {
  if (
    !order.recipientName?.trim() ||
    !order.addressStreet?.trim() ||
    !order.addressCity?.trim() ||
    !order.addressState?.trim() ||
    !order.destinationCep?.replace(/\D/g, "")
  ) {
    return null;
  }

  return {
    name: order.recipientName.trim(),
    phone: order.phone ?? undefined,
    email: order.email ?? undefined,
    document: order.cpf ?? undefined,
    address: order.addressStreet.trim(),
    number: order.addressNumber ?? undefined,
    complement: order.addressComplement ?? undefined,
    district: order.addressNeighborhood ?? undefined,
    city: order.addressCity.trim(),
    state_abbr: order.addressState.trim(),
    postal_code: order.destinationCep,
  };
}

async function storeAsLabelParty(): Promise<LabelParty> {
  const store = await resolveStoreSender();
  return {
    name: store.name,
    phone: store.phone,
    email: store.email,
    document: store.document,
    address: store.address,
    number: store.number,
    complement: store.complement,
    district: store.district,
    city: store.city,
    state_abbr: store.state_abbr,
    postal_code: store.postal_code,
  };
}

async function markManual(
  exchangeId: string,
  actorUserId: string,
  reason: string,
  extra?: Record<string, unknown>
): Promise<void> {
  const shipping = await prisma.exchangeShipping.findFirst({
    where: { exchangeId, type: ExchangeShippingType.RETURN },
    select: { id: true, superfreteShipmentId: true },
  });
  if (shipping && !shipping.superfreteShipmentId) {
    await prisma.exchangeShipping.update({
      where: { id: shipping.id },
      data: { shippingStatus: "pending_manual" },
    });
  }
  await appendExchangeEvent(prisma, {
    exchangeId,
    type: "NOTE_ADDED",
    actorUserId,
    payload: {
      kind: "manual_reverse",
      message: `Realizar reversa manualmente. ${reason}`.trim(),
      ...extra,
    },
  });
}

async function buildQuotePackage(items: {
  quantity: number;
  productId: string | null;
  unitPrice: number;
}[]) {
  const catalogLines = items
    .filter((i) => !!i.productId)
    .map((i) => ({ productId: i.productId!, quantity: i.quantity }));
  const insuranceFallback = items.reduce(
    (acc, i) => acc + Math.max(0, i.unitPrice) * i.quantity,
    0
  );
  const qty = Math.max(
    1,
    items.reduce((acc, i) => acc + Math.max(1, i.quantity), 0)
  );

  if (catalogLines.length === 0) {
    return buildDefaultShippingPackage({
      quantity: qty,
      insuranceValue: insuranceFallback,
    });
  }

  try {
    return await buildCartShippingPackage(catalogLines);
  } catch {
    return buildDefaultShippingPackage({
      quantity: qty,
      insuranceValue: insuranceFallback,
    });
  }
}

/**
 * Após criar troca/devolução com retorno CARRIER: cota cliente → loja.
 * Se PAC/SEDEX for o mais barato, gera reversa ME; senão marca manual.
 * Nunca lança — a criação da troca já foi persistida.
 */
export async function maybeGenerateReturnReverse(input: {
  exchangeId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    await maybeGenerateReturnReverseInner(input);
  } catch (e) {
    console.warn("[exchange reverse]", e);
    try {
      await markManual(
        input.exchangeId,
        input.actorUserId,
        e instanceof Error ? e.message : "Falha inesperada na cotação."
      );
    } catch (inner) {
      console.warn("[exchange reverse] falha ao registrar evento manual", inner);
    }
  }
}

async function maybeGenerateReturnReverseInner(input: {
  exchangeId: string;
  actorUserId: string;
}): Promise<void> {
  const exchange = await prisma.exchange.findUnique({
    where: { id: input.exchangeId },
    include: {
      items: true,
      shippings: true,
      order: {
        select: {
          orderNumber: true,
          recipientName: true,
          phone: true,
          email: true,
          cpf: true,
          addressStreet: true,
          addressNumber: true,
          addressComplement: true,
          addressNeighborhood: true,
          addressCity: true,
          addressState: true,
          destinationCep: true,
          shippingProvider: true,
          superfreteShipmentId: true,
        },
      },
    },
  });

  if (!exchange || exchange.status === ExchangeStatus.CANCELLED) return;

  const shipping = exchange.shippings.find(
    (s) => s.type === ExchangeShippingType.RETURN
  );
  if (!shipping || shipping.method !== "CARRIER") return;
  if (shipping.superfreteShipmentId) return;

  const returnItems = exchange.items.filter((i) => i.direction === "RETURN");
  if (returnItems.length === 0) {
    await markManual(
      exchange.id,
      input.actorUserId,
      "Não há peças de retorno para cotar."
    );
    return;
  }

  if (!(await isMelhorEnvioReady())) {
    await markManual(
      exchange.id,
      input.actorUserId,
      "Melhor Envio não está ativo (reversa oficial só nos Correios via ME)."
    );
    return;
  }

  const customer = customerPartyFromOrder(exchange.order);
  if (!customer) {
    await markManual(
      exchange.id,
      input.actorUserId,
      "Endereço da cliente incompleto para cotar o retorno."
    );
    return;
  }

  if (!customer.email?.trim() || !(customer.phone ?? "").replace(/\D/g, "")) {
    await markManual(
      exchange.id,
      input.actorUserId,
      "E-mail ou telefone da cliente ausente para gerar o código de postagem."
    );
    return;
  }

  const store = await storeAsLabelParty();
  const fromCep = customer.postal_code.replace(/\D/g, "");
  const toCep = store.postal_code.replace(/\D/g, "");
  if (fromCep.length !== 8 || toCep.length !== 8) {
    await markManual(
      exchange.id,
      input.actorUserId,
      "CEP da cliente ou da loja inválido."
    );
    return;
  }

  const pkg = await buildQuotePackage(returnItems);
  const quote = await calculateShippingMelhorEnvio({
    originPostalCode: fromCep,
    destinationPostalCode: toCep,
    products: pkg.products.map((p, idx) => ({
      id: p.id || `p-${idx + 1}`,
      quantity: p.quantity,
      weight: p.weight,
      height: p.height,
      width: p.width,
      length: p.length,
      insurance_value: p.insurance_value ?? 0,
    })),
    insuranceValue: pkg.useInsurance ? pkg.insuranceDeclared : undefined,
  });

  const choice = chooseReturnReverse(quote.options);
  if (!choice.useReverse || !choice.correios || choice.correios.serviceId == null) {
    const cheaper = choice.cheapestOther
      ? optionLabel(choice.cheapestOther)
      : "nenhuma opção Correios PAC/SEDEX";
    const correios = choice.correios
      ? optionLabel(choice.correios)
      : "PAC/SEDEX indisponível";
    await markManual(
      exchange.id,
      input.actorUserId,
      `${cheaper} ficou mais barato que ${correios}.`,
      {
        cheaper: choice.cheapestOther,
        correios: choice.correios,
      }
    );
    return;
  }

  const volumeDims = packageToSuperFreteKgCm({
    weightGrams: pkg.weightGrams,
    lengthCm: pkg.lengthCm,
    widthCm: pkg.widthCm,
    heightCm: pkg.heightCm,
  });
  const volume = {
    height: volumeDims.heightCm,
    width: volumeDims.widthCm,
    length: volumeDims.lengthCm,
    weight: volumeDims.weightKg,
  };

  const originalShipmentId =
    exchange.order.shippingProvider === SHIPPING_PROVIDERS.MELHOR_ENVIO
      ? exchange.order.superfreteShipmentId
      : null;

  const result = await createMelhorEnvioReverseLabel({
    serviceId: choice.correios.serviceId,
    from: customer,
    to: store,
    products: returnItems.map((i) => ({
      name: i.productName,
      quantity: i.quantity,
      unitary_value: i.unitPrice > 0 ? i.unitPrice : 0.01,
    })),
    volume,
    insuranceValue: pkg.useInsurance ? pkg.insuranceDeclared : 0,
    tag: `T${exchange.exchangeNumber ?? exchange.id.slice(0, 6)}-R`,
    orderNumber: exchange.order.orderNumber,
    originalShipmentId,
  });

  if (result.checkoutError) {
    await markManual(
      exchange.id,
      input.actorUserId,
      `Checkout da reversa falhou: ${result.checkoutError}`,
      { shipmentId: result.shipmentId }
    );
    return;
  }

  let tracking: string | null = null;
  let cost: number | null = choice.correios.price;
  let superfreteStatus = result.superfreteStatus;
  let labelUrl = result.labelUrl || null;

  try {
    const info = await fetchMelhorEnvioOrderInfoWithTrackingPoll(
      result.shipmentId,
      { maxWaitMs: 8000 }
    );
    tracking = info.tracking;
    if (info.price != null) cost = info.price;
    superfreteStatus = info.status;
    if (info.labelUrl) labelUrl = info.labelUrl;
  } catch {
    /* sync best-effort */
  }

  const mapped = mapSuperfreteStatusToShippingStatus(superfreteStatus);
  const shippingStatus =
    mapped === "shipped" || mapped === "delivered" ? mapped : "labeled";

  await prisma.$transaction(async (tx) => {
    await tx.exchangeShipping.update({
      where: { id: shipping.id },
      data: {
        shippingServiceId: choice.correios!.serviceId,
        shippingServiceName: `${choice.correios!.carrierName} ${choice.correios!.serviceName}`,
        quotedPrice: choice.correios!.price,
        superfreteShipmentId: result.shipmentId,
        superfreteStatus,
        trackingCode: tracking,
        labelUrl,
        labelGeneratedAt: new Date(),
        cost,
        packageHeightCm: volume.height,
        packageWidthCm: volume.width,
        packageLengthCm: volume.length,
        packageWeightKg: volume.weight,
        shippingStatus,
      },
    });

    let nextStatus = exchange.status;
    if (
      exchange.status === ExchangeStatus.AWAITING_RETURN &&
      (mapped === "shipped" || mapped === "delivered")
    ) {
      nextStatus = ExchangeStatus.RETURN_IN_TRANSIT;
    }

    if (nextStatus !== exchange.status) {
      await tx.exchange.update({
        where: { id: exchange.id },
        data: { status: nextStatus },
      });
    }

    await appendExchangeEvent(tx, {
      exchangeId: exchange.id,
      type: "REVERSE_LABEL_GENERATED",
      actorUserId: input.actorUserId,
      payload: {
        shipmentId: result.shipmentId,
        serviceId: choice.correios!.serviceId,
        quotedPrice: choice.correios!.price,
        cheaperThan: choice.cheapestOther
          ? optionLabel(choice.cheapestOther)
          : null,
      },
    });
  });
}
