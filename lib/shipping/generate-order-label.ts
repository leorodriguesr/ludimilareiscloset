import { prisma } from "@/lib/prisma";
import { DEFAULT_SHIPPING_PACKAGE } from "@/lib/shipping/cart-package";
import { packageToSuperFreteKgCm } from "@/lib/shipping/superfrete";
import {
  cancelSuperfreteOrder,
  checkoutSuperfreteOrders,
  createSuperfreteLabelForOrder,
  fetchSuperfreteOrderInfo,
  fetchSuperfreteOrderInfoWithTrackingPoll,
  printSuperfreteLabel,
  type LabelInput,
} from "@/lib/shipping/superfrete-label";
import {
  cancelMelhorEnvioOrder,
  checkoutMelhorEnvioOrders,
  createMelhorEnvioLabelForOrder,
  fetchMelhorEnvioOrderInfo,
  fetchMelhorEnvioOrderInfoWithTrackingPoll,
  isMelhorEnvioProtocolCode,
  printMelhorEnvioLabel,
} from "@/lib/shipping/melhor-envio/label";
import type { MelhorEnvioQuotePackage } from "@/lib/shipping/melhor-envio/quote";
import {
  isCancelledProviderShipmentStatus,
  mapSuperfreteStatusToShippingStatus,
  parseSuperfreteServiceId,
  resolveOrderShippingServiceId,
} from "@/lib/shipping/service-id";
import {
  isShippingProvider,
  SHIPPING_PROVIDERS,
  type ShippingProvider,
} from "@/lib/shipping/providers";
import {
  updateOrderDeliveryDaysFromSuperfrete,
  updateOrderSuperfreteShippingPrice,
} from "@/lib/orders/order-shipping-fields";
import { clearLabelAutoGenerateError } from "@/lib/shipping/label-auto-generate-error";
import { ShippingQuoteError } from "@/lib/shipping/types";
import {
  CustomerDataStatus,
  FulfillmentType,
} from "@/app/generated/prisma/client";
import { canGenerateLabelForFulfillment } from "@/lib/fulfillment/fulfillment-types";
import { orderItemDisplayName } from "@/lib/orders/order-item-display";

function positiveDimCm(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type OrderForLabel = NonNullable<Awaited<ReturnType<typeof loadOrderForLabel>>>;

async function loadOrderForLabel(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      email: true,
      phone: true,
      cpf: true,
      paidAt: true,
      recipientName: true,
      destinationCep: true,
      addressStreet: true,
      addressNumber: true,
      addressComplement: true,
      addressNeighborhood: true,
      addressCity: true,
      addressState: true,
      shippingServiceId: true,
      shippingServiceName: true,
      shippingProvider: true,
      shippingQuotePackagesJson: true,
      packageHeightCm: true,
      packageWidthCm: true,
      packageLengthCm: true,
      packageWeightKg: true,
      superfreteShipmentId: true,
      labelUrl: true,
      superfreteStatus: true,
      shippingStatus: true,
      fulfillmentType: true,
      customerDataStatus: true,
      items: {
        select: {
          quantity: true,
          price: true,
          paymentStatus: true,
          productName: true,
          product: {
            select: {
              name: true,
              price: true,
              weightGrams: true,
              lengthCm: true,
              widthCm: true,
              heightCm: true,
            },
          },
        },
      },
    },
  });
}

function buildVolumeFromOrder(order: OrderForLabel): LabelInput["volume"] {
  if (
    order.packageHeightCm != null &&
    order.packageWidthCm != null &&
    order.packageLengthCm != null &&
    order.packageWeightKg != null
  ) {
    return {
      height: order.packageHeightCm,
      width: order.packageWidthCm,
      length: order.packageLengthCm,
      weight: order.packageWeightKg,
    };
  }

  let weightGrams = 0;
  let lengthCm = DEFAULT_SHIPPING_PACKAGE.lengthCm;
  let widthCm = DEFAULT_SHIPPING_PACKAGE.widthCm;
  let heightCm = DEFAULT_SHIPPING_PACKAGE.heightCm;

  for (const item of order.items) {
    const p = item.product;
    const qty = item.quantity;
    const unitGrams =
      p?.weightGrams != null && p.weightGrams > 0
        ? p.weightGrams
        : DEFAULT_SHIPPING_PACKAGE.weightGrams;
    weightGrams += unitGrams * qty;
    const len = positiveDimCm(p?.lengthCm);
    const wid = positiveDimCm(p?.widthCm);
    const hgt = positiveDimCm(p?.heightCm);
    if (len != null) lengthCm = Math.max(lengthCm, len);
    if (wid != null) widthCm = Math.max(widthCm, wid);
    if (hgt != null) heightCm = Math.max(heightCm, hgt);
  }

  const dims = packageToSuperFreteKgCm({
    weightGrams,
    lengthCm,
    widthCm,
    heightCm,
  });

  return {
    height: dims.heightCm,
    width: dims.widthCm,
    length: dims.lengthCm,
    weight: dims.weightKg,
  };
}

function resolveServiceId(order: OrderForLabel): number {
  const serviceId = resolveOrderShippingServiceId({
    shippingServiceId: order.shippingServiceId,
    shippingServiceName: order.shippingServiceName,
  });

  if (serviceId == null) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Serviço de frete não identificado no pedido. O cliente precisa refazer o checkout escolhendo uma opção de frete válida.",
      400
    );
  }

  return serviceId;
}

function validateOrderForLabel(order: OrderForLabel): {
  serviceId: number;
  destCep: string;
} {
  if (!canGenerateLabelForFulfillment(order.fulfillmentType)) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Este pedido não utiliza transportadora. Etiqueta não aplicável.",
      400
    );
  }

  if (!order.paidAt) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Não é possível gerar etiqueta para pedido não pago.",
      400
    );
  }

  const destCep = (order.destinationCep ?? "").replace(/\D/g, "");
  const hasDeliveryAddress = Boolean(
    destCep.length === 8 &&
      order.addressStreet &&
      order.addressCity &&
      order.addressState
  );

  if (
    order.customerDataStatus === CustomerDataStatus.PENDING &&
    !hasDeliveryAddress
  ) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Aguardando o preenchimento dos dados de entrega.",
      400
    );
  }

  if (destCep.length !== 8) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "CEP de destino inválido ou não informado.",
      400
    );
  }

  if (!order.addressStreet || !order.addressCity || !order.addressState) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Endereço de entrega incompleto no pedido.",
      400
    );
  }

  const serviceId = resolveServiceId(order);
  if (!Number.isFinite(serviceId) || serviceId < 1) {
    throw new ShippingQuoteError("VALIDATION", "Serviço de frete inválido.", 400);
  }

  return { serviceId, destCep };
}

function resolveOrderProvider(order: {
  shippingProvider: string | null;
}): ShippingProvider {
  if (isShippingProvider(order.shippingProvider)) {
    return order.shippingProvider;
  }
  return SHIPPING_PROVIDERS.SUPERFRETE;
}

function parseStoredPackages(
  json: string | null | undefined
): MelhorEnvioQuotePackage[] | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as MelhorEnvioQuotePackage[]) : null;
  } catch {
    return null;
  }
}

function buildLabelInput(order: OrderForLabel): LabelInput {
  const { serviceId, destCep } = validateOrderForLabel(order);
  let totalInsurance = 0;
  const products: LabelInput["products"] = [];

  for (const item of order.items) {
    totalInsurance += item.price * item.quantity;
    products.push({
      name: orderItemDisplayName(item),
      quantity: item.quantity,
      unitary_value: item.price,
    });
  }

  return {
    serviceId,
    to: {
      name: order.recipientName || order.email?.split("@")[0] || "Destinatário",
      phone: order.phone ?? undefined,
      email: order.email ?? undefined,
      document: order.cpf ?? undefined,
      address: order.addressStreet!,
      number: order.addressNumber ?? undefined,
      complement: order.addressComplement ?? undefined,
      district: order.addressNeighborhood ?? undefined,
      city: order.addressCity!,
      state_abbr: order.addressState!.toUpperCase(),
      postal_code: destCep,
    },
    products,
    volume: buildVolumeFromOrder(order),
    insuranceValue: Math.round(totalInsurance * 100) / 100,
    tag: order.id,
    orderNumber: order.orderNumber,
  };
}

async function createLabelForProvider(
  provider: ShippingProvider,
  input: LabelInput,
  packages: MelhorEnvioQuotePackage[] | null
) {
  if (provider === SHIPPING_PROVIDERS.MELHOR_ENVIO) {
    return createMelhorEnvioLabelForOrder({ ...input, packages });
  }
  return createSuperfreteLabelForOrder(input);
}

async function checkoutForProvider(
  provider: ShippingProvider,
  shipmentIds: string[]
) {
  if (provider === SHIPPING_PROVIDERS.MELHOR_ENVIO) {
    return checkoutMelhorEnvioOrders(shipmentIds);
  }
  return checkoutSuperfreteOrders(shipmentIds);
}

async function fetchInfoForProvider(
  provider: ShippingProvider,
  shipmentId: string
) {
  if (provider === SHIPPING_PROVIDERS.MELHOR_ENVIO) {
    return fetchMelhorEnvioOrderInfo(shipmentId);
  }
  return fetchSuperfreteOrderInfo(shipmentId);
}

async function fetchInfoWithPollForProvider(
  provider: ShippingProvider,
  shipmentId: string,
  options?: { maxWaitMs?: number; intervalMs?: number }
) {
  if (provider === SHIPPING_PROVIDERS.MELHOR_ENVIO) {
    return fetchMelhorEnvioOrderInfoWithTrackingPoll(shipmentId, options);
  }
  return fetchSuperfreteOrderInfoWithTrackingPoll(shipmentId, options);
}

async function printForProvider(
  provider: ShippingProvider,
  shipmentId: string
) {
  if (provider === SHIPPING_PROVIDERS.MELHOR_ENVIO) {
    return printMelhorEnvioLabel(shipmentId);
  }
  return printSuperfreteLabel(shipmentId);
}

async function cancelForProvider(
  provider: ShippingProvider,
  shipmentId: string,
  reason?: string
) {
  if (provider === SHIPPING_PROVIDERS.MELHOR_ENVIO) {
    return cancelMelhorEnvioOrder(shipmentId, reason);
  }
  return cancelSuperfreteOrder(shipmentId, reason);
}

async function persistSuperfreteOrderMeta(
  orderId: string,
  info: Awaited<ReturnType<typeof fetchSuperfreteOrderInfo>>
) {
  if (info.price != null && info.price >= 0) {
    await updateOrderSuperfreteShippingPrice(orderId, info.price);
  }
  if (info.deliveryMin != null || info.deliveryMax != null) {
    await updateOrderDeliveryDaysFromSuperfrete(
      orderId,
      info.deliveryMin,
      info.deliveryMax
    );
  }
}

export async function generateOrderLabel(orderId: string) {
  const order = await loadOrderForLabel(orderId);
  if (!order) {
    throw new ShippingQuoteError("VALIDATION", "Pedido não encontrado.", 404);
  }

  if (order.status === "cancelled") {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Não é possível gerar etiqueta para venda cancelada.",
      400
    );
  }

  const hasUnpaidItems = order.items.some(
    (item) => item.paymentStatus === "pending"
  );
  if (hasUnpaidItems) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Há itens aguardando pagamento. Conclua o acréscimo antes de gerar a etiqueta.",
      400
    );
  }

  const labelCancelled =
    order.shippingStatus === "cancelled" ||
    isCancelledProviderShipmentStatus(order.superfreteStatus);

  if (labelCancelled) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        superfreteShipmentId: null,
        labelUrl: null,
        trackingCode: null,
        labelGeneratedAt: null,
        superfreteStatus: null,
        // Sai de "Cancelado" antes de gerar a nova etiqueta.
        shippingStatus: "to_pack",
      },
    });
    order.superfreteShipmentId = null;
    order.labelUrl = null;
    order.superfreteStatus = null;
    order.shippingStatus = "to_pack";
  }

  const provider = resolveOrderProvider(order);
  let alreadyExists = false;
  let checkoutError: string | undefined;

  if (order.superfreteShipmentId && order.labelUrl) {
    alreadyExists = true;
    // Ainda sincroniza: no Melhor Envio o rastreio costuma surgir após generate/print.
  } else if (order.superfreteShipmentId && !order.labelUrl) {
    alreadyExists = true;
    // Reaproveita o envio já criado (ex.: pending por saldo) e tenta checkout de novo.
    try {
      await checkoutForProvider(provider, [order.superfreteShipmentId]);
    } catch (e) {
      checkoutError =
        e instanceof Error ? e.message : "Falha no checkout do frete.";
      console.warn(
        `[generateOrderLabel] checkout retry falhou para ${order.superfreteShipmentId}:`,
        checkoutError
      );
    }
  } else {
    const input = buildLabelInput(order);
    const packages = parseStoredPackages(order.shippingQuotePackagesJson);
    const result = await createLabelForProvider(provider, input, packages);
    checkoutError = result.checkoutError;

    await prisma.order.update({
      where: { id: orderId },
      data: {
        shippingProvider: provider,
        superfreteShipmentId: result.shipmentId,
        labelUrl: null,
        superfreteStatus: result.superfreteStatus,
        labelGeneratedAt: new Date(),
        shippingServiceId: input.serviceId,
        // Regeneração após cancelamento: etiqueta nova vai para "por enviar".
        ...(labelCancelled ? { shippingStatus: "packed" } : {}),
      },
    });
    if (labelCancelled) {
      order.shippingStatus = "packed";
    }
  }

  let info: Awaited<ReturnType<typeof syncOrderShipmentFromSuperfrete>> | null = null;
  try {
    info = await syncOrderShipmentFromSuperfrete(orderId, {
      pollTracking: true,
      maxWaitMs: 12_000,
      tryCheckout: !checkoutError,
    });
  } catch (e) {
    console.warn(
      "[generateOrderLabel] syncOrderShipmentFromSuperfrete falhou:",
      e instanceof Error ? e.message : e
    );
  }

  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      superfreteShipmentId: true,
      labelUrl: true,
      superfreteStatus: true,
      trackingCode: true,
    },
  });

  await clearLabelAutoGenerateError(orderId);

  const superfreteStatus =
    info?.status ?? updated?.superfreteStatus ?? "released";
  const paymentPending = superfreteStatus === "pending" || Boolean(checkoutError);

  return {
    shipmentId: updated?.superfreteShipmentId ?? "",
    labelUrl: updated?.labelUrl ?? info?.labelUrl ?? "",
    superfreteStatus,
    tracking: info?.tracking ?? updated?.trackingCode ?? null,
    alreadyExists,
    paymentPending,
    ...(checkoutError && paymentPending
      ? {
          message:
            provider === SHIPPING_PROVIDERS.MELHOR_ENVIO
              ? "Etiqueta criada no Melhor Envio, mas falta pagar (saldo insuficiente). Após pagar lá, use Sincronizar status."
              : "Etiqueta criada na SuperFrete, mas falta pagar (saldo insuficiente). Após pagar lá, use Sincronizar status.",
          checkoutError,
        }
      : {}),
  };
}

function cancelledLabelClearData() {
  return {
    superfreteStatus: "cancelled",
    shippingStatus: "cancelled" as const,
    superfreteShipmentId: null,
    labelUrl: null,
    trackingCode: null,
    labelGeneratedAt: null,
  };
}

export async function syncOrderShipmentFromSuperfrete(
  orderId: string,
  options?: {
    pollTracking?: boolean;
    maxWaitMs?: number;
    /** Tenta checkout se a SuperFrete ainda estiver pending (saldo). Default: true. */
    tryCheckout?: boolean;
  }
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      superfreteShipmentId: true,
      labelUrl: true,
      shippingStatus: true,
      shippingProvider: true,
      trackingCode: true,
    },
  });
  if (!order?.superfreteShipmentId) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Pedido não possui etiqueta de envio.",
      400
    );
  }

  const provider = resolveOrderProvider(order);
  const shipmentId = order.superfreteShipmentId;
  let info = await fetchInfoForProvider(provider, shipmentId);

  if (isCancelledProviderShipmentStatus(info.status)) {
    await prisma.order.update({
      where: { id: orderId },
      data: cancelledLabelClearData(),
    });
    return { ...info, status: "cancelled", labelUrl: null, tracking: null };
  }

  if (options?.tryCheckout !== false && info.status === "pending") {
    try {
      await checkoutForProvider(provider, [shipmentId]);
      info = await fetchInfoForProvider(provider, shipmentId);
    } catch (e) {
      console.warn(
        `[syncOrderShipmentFromSuperfrete] checkout pending falhou para ${shipmentId}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  if (isCancelledProviderShipmentStatus(info.status)) {
    await prisma.order.update({
      where: { id: orderId },
      data: cancelledLabelClearData(),
    });
    return { ...info, status: "cancelled", labelUrl: null, tracking: null };
  }

  // Melhor Envio: generate + print liberam o código de rastreio.
  // Antes o print vinha DEPOIS do poll — por isso o rastreio só aparecia no sync manual.
  if (
    provider === SHIPPING_PROVIDERS.MELHOR_ENVIO &&
    info.status !== "pending" &&
    !isCancelledProviderShipmentStatus(info.status)
  ) {
    try {
      const { generateMelhorEnvioLabels } = await import(
        "@/lib/shipping/melhor-envio/label"
      );
      await generateMelhorEnvioLabels([shipmentId]);
    } catch {
      /* já gerada / saldo */
    }
  }

  let labelUrl = order.labelUrl || info.labelUrl || null;
  if (
    !labelUrl &&
    info.status !== "pending" &&
    !isCancelledProviderShipmentStatus(info.status) &&
    info.status !== "unknown"
  ) {
    try {
      labelUrl = await printForProvider(provider, shipmentId);
    } catch (e) {
      console.warn(
        `[syncOrderShipmentFromSuperfrete] print falhou para ${shipmentId}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  if (!info.tracking) {
    info = await fetchInfoForProvider(provider, shipmentId);
  }

  if (
    options?.pollTracking &&
    !info.tracking &&
    info.status !== "pending" &&
    !isCancelledProviderShipmentStatus(info.status)
  ) {
    info = await fetchInfoWithPollForProvider(provider, shipmentId, {
      maxWaitMs: options.maxWaitMs ?? 12_000,
      intervalMs: 1500,
    });
  }

  if (isCancelledProviderShipmentStatus(info.status)) {
    await prisma.order.update({
      where: { id: orderId },
      data: cancelledLabelClearData(),
    });
    return { ...info, status: "cancelled", labelUrl: null, tracking: null };
  }

  const mappedStatus = mapSuperfreteStatusToShippingStatus(info.status);
  const nextShippingStatus =
    mappedStatus ??
    (order.shippingStatus === "cancelled" &&
    !isCancelledProviderShipmentStatus(info.status)
      ? "packed"
      : null);

  const trackingUpdate = (() => {
    // Sempre grava o rastreio da transportadora quando disponível (ex.: ME… → AD…BR).
    if (info.tracking) return { trackingCode: info.tracking };
    // Limpa ORD-... gravado por engano até o rastreio real existir.
    if (isMelhorEnvioProtocolCode(order.trackingCode)) {
      return { trackingCode: null as string | null };
    }
    return {};
  })();

  await prisma.order.update({
    where: { id: orderId },
    data: {
      superfreteStatus: info.status,
      ...trackingUpdate,
      ...(labelUrl ? { labelUrl } : {}),
      ...(nextShippingStatus ? { shippingStatus: nextShippingStatus } : {}),
    },
  });

  await persistSuperfreteOrderMeta(orderId, { ...info, labelUrl });

  return { ...info, labelUrl };
}

export async function cancelOrderLabel(orderId: string, reason?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { superfreteShipmentId: true, shippingProvider: true },
  });
  if (!order?.superfreteShipmentId) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Pedido não possui etiqueta para cancelar.",
      400
    );
  }

  await cancelForProvider(
    resolveOrderProvider(order),
    order.superfreteShipmentId,
    reason
  );

  await prisma.order.update({
    where: { id: orderId },
    data: cancelledLabelClearData(),
  });
}

export async function reprintOrderLabel(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { superfreteShipmentId: true, shippingProvider: true },
  });
  if (!order?.superfreteShipmentId) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Pedido não possui etiqueta gerada.",
      400
    );
  }

  const labelUrl = await printForProvider(
    resolveOrderProvider(order),
    order.superfreteShipmentId
  );
  await prisma.order.update({
    where: { id: orderId },
    data: { labelUrl },
  });
  return labelUrl;
}

export { parseSuperfreteServiceId };
