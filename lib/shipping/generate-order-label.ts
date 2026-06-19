import { prisma } from "@/lib/prisma";
import { buildCartShippingPackage } from "@/lib/shipping/cart-package";
import { packageToSuperFreteKgCm } from "@/lib/shipping/superfrete";
import {
  cancelSuperfreteOrder,
  createSuperfreteLabelForOrder,
  fetchSuperfreteOrderInfo,
  printSuperfreteLabel,
  type LabelInput,
} from "@/lib/shipping/superfrete-label";
import {
  mapSuperfreteStatusToShippingStatus,
  parseSuperfreteServiceId,
  resolveOrderShippingServiceId,
} from "@/lib/shipping/service-id";
import {
  updateOrderDeliveryDaysFromSuperfrete,
  updateOrderSuperfreteShippingPrice,
} from "@/lib/orders/order-shipping-fields";
import { ShippingQuoteError } from "@/lib/shipping/types";

const DEFAULT_PKG = { weightGrams: 300, lengthCm: 16, widthCm: 11, heightCm: 2 };

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
      packageHeightCm: true,
      packageWidthCm: true,
      packageLengthCm: true,
      packageWeightKg: true,
      superfreteShipmentId: true,
      labelUrl: true,
      superfreteStatus: true,
      items: {
        include: {
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
  let lengthCm = DEFAULT_PKG.lengthCm;
  let widthCm = DEFAULT_PKG.widthCm;
  let heightCm = DEFAULT_PKG.heightCm;

  for (const item of order.items) {
    const p = item.product;
    const qty = item.quantity;
    const unitGrams =
      p.weightGrams != null && p.weightGrams > 0 ? p.weightGrams : DEFAULT_PKG.weightGrams;
    weightGrams += unitGrams * qty;
    const len = positiveDimCm(p.lengthCm);
    const wid = positiveDimCm(p.widthCm);
    const hgt = positiveDimCm(p.heightCm);
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
  if (!order.paidAt) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Não é possível gerar etiqueta para pedido não pago.",
      400
    );
  }

  const destCep = (order.destinationCep ?? "").replace(/\D/g, "");
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

function buildLabelInput(order: OrderForLabel): LabelInput {
  const { serviceId, destCep } = validateOrderForLabel(order);
  let totalInsurance = 0;
  const products: LabelInput["products"] = [];

  for (const item of order.items) {
    totalInsurance += item.price * item.quantity;
    products.push({
      name: item.product.name,
      quantity: item.quantity,
      unitary_value: item.price,
    });
  }

  return {
    serviceId,
    to: {
      name: order.recipientName || order.email.split("@")[0] || "Destinatário",
      phone: order.phone ?? undefined,
      email: order.email,
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

  // Etiqueta já gerada e URL salva — retorna direto
  if (order.superfreteShipmentId && order.labelUrl) {
    return {
      shipmentId: order.superfreteShipmentId,
      labelUrl: order.labelUrl,
      superfreteStatus: order.superfreteStatus ?? "released",
      alreadyExists: true,
    };
  }

  // Shipment já existe (pago), mas a URL da etiqueta não foi salva — tenta buscar sem recriar
  if (order.superfreteShipmentId && !order.labelUrl) {
    let labelUrl: string | null = null;
    try {
      labelUrl = await printSuperfreteLabel(order.superfreteShipmentId);
    } catch (e) {
      console.warn("[generateOrderLabel] printSuperfreteLabel falhou para shipmentId existente:", e instanceof Error ? e.message : e);
    }
    if (labelUrl) {
      await prisma.order.update({
        where: { id: orderId },
        data: { labelUrl, superfreteStatus: "released" },
      });
    }
    return {
      shipmentId: order.superfreteShipmentId,
      labelUrl: labelUrl ?? "",
      superfreteStatus: order.superfreteStatus ?? "released",
      alreadyExists: true,
    };
  }

  const input = buildLabelInput(order);
  const result = await createSuperfreteLabelForOrder(input);

  // Salva no banco e busca metadados em paralelo
  const [, infoResult] = await Promise.allSettled([
    prisma.order.update({
      where: { id: orderId },
      data: {
        superfreteShipmentId: result.shipmentId,
        labelUrl: result.labelUrl || null,
        superfreteStatus: result.superfreteStatus,
        shippingStatus: "packed",
        labelGeneratedAt: new Date(),
        shippingServiceId: input.serviceId,
      },
    }),
    fetchSuperfreteOrderInfo(result.shipmentId),
  ]);

  // Persiste metadados opcionais (preço, prazo) e corrige labelUrl se necessário
  if (infoResult.status === "fulfilled") {
    const info = infoResult.value;
    await persistSuperfreteOrderMeta(orderId, info).catch(() => null);
    if (!result.labelUrl && info.labelUrl) {
      await prisma.order.update({
        where: { id: orderId },
        data: { labelUrl: info.labelUrl },
      }).catch(() => null);
      result.labelUrl = info.labelUrl;
    }
  }

  return { ...result, alreadyExists: false };
}

export async function syncOrderShipmentFromSuperfrete(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { superfreteShipmentId: true, labelUrl: true },
  });
  if (!order?.superfreteShipmentId) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Pedido não possui etiqueta SuperFrete.",
      400
    );
  }

  const info = await fetchSuperfreteOrderInfo(order.superfreteShipmentId);
  const mappedStatus = mapSuperfreteStatusToShippingStatus(info.status);

  let labelUrl = order.labelUrl;
  if (!labelUrl && info.status === "released") {
    try {
      labelUrl = await printSuperfreteLabel(order.superfreteShipmentId);
    } catch {
      labelUrl = info.labelUrl;
    }
  } else if (info.labelUrl) {
    labelUrl = info.labelUrl;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      superfreteStatus: info.status,
      trackingCode: info.tracking ?? undefined,
      ...(labelUrl ? { labelUrl } : {}),
      ...(mappedStatus ? { shippingStatus: mappedStatus } : {}),
    },
  });

  await persistSuperfreteOrderMeta(orderId, info);

  return info;
}

export async function cancelOrderLabel(orderId: string, reason?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { superfreteShipmentId: true },
  });
  if (!order?.superfreteShipmentId) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Pedido não possui etiqueta para cancelar.",
      400
    );
  }

  await cancelSuperfreteOrder(order.superfreteShipmentId, reason);

  await prisma.order.update({
    where: { id: orderId },
    data: {
      superfreteStatus: "cancelled",
      shippingStatus: "cancelled",
      superfreteShipmentId: null,
      labelUrl: null,
      trackingCode: null,
      labelGeneratedAt: null,
    },
  });
}

export async function reprintOrderLabel(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { superfreteShipmentId: true },
  });
  if (!order?.superfreteShipmentId) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Pedido não possui etiqueta gerada.",
      400
    );
  }

  const labelUrl = await printSuperfreteLabel(order.superfreteShipmentId);
  await prisma.order.update({
    where: { id: orderId },
    data: { labelUrl },
  });
  return labelUrl;
}

export { parseSuperfreteServiceId };
