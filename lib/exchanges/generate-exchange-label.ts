import {
  ExchangeBalanceStatus,
  ExchangeShippingType,
  ExchangeStatus,
} from "@/app/generated/prisma/client";
import { ExchangeError } from "@/lib/exchanges/constants";
import { appendExchangeEvent } from "@/lib/exchanges/events";
import { prisma } from "@/lib/prisma";
import { buildCartShippingPackage } from "@/lib/shipping/cart-package";
import { packageToSuperFreteKgCm } from "@/lib/shipping/superfrete";
import { resolveStoreSender } from "@/lib/shipping/superfrete-account";
import {
  createSuperfreteLabelForOrder,
  fetchSuperfreteOrderInfoWithTrackingPoll,
  type LabelInput,
  type LabelParty,
} from "@/lib/shipping/superfrete-label";
import {
  mapSuperfreteStatusToShippingStatus,
  parseSuperfreteServiceId,
} from "@/lib/shipping/service-id";
import { ShippingQuoteError } from "@/lib/shipping/types";

function resolveServiceId(
  value: number | string | null | undefined
): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }
  return parseSuperfreteServiceId(value);
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
}): LabelParty {
  if (
    !order.recipientName?.trim() ||
    !order.addressStreet?.trim() ||
    !order.addressCity?.trim() ||
    !order.addressState?.trim() ||
    !order.destinationCep?.replace(/\D/g, "")
  ) {
    throw new ExchangeError(
      "ADDRESS_INCOMPLETE",
      "Endereço do cliente incompleto para gerar etiqueta."
    );
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

function volumeFromShipping(shipping: {
  packageHeightCm: number | null;
  packageWidthCm: number | null;
  packageLengthCm: number | null;
  packageWeightKg: number | null;
}): LabelInput["volume"] | null {
  if (
    shipping.packageHeightCm != null &&
    shipping.packageWidthCm != null &&
    shipping.packageLengthCm != null &&
    shipping.packageWeightKg != null
  ) {
    return {
      height: shipping.packageHeightCm,
      width: shipping.packageWidthCm,
      length: shipping.packageLengthCm,
      weight: shipping.packageWeightKg,
    };
  }
  return null;
}

async function volumeFromItems(
  items: {
    quantity: number;
    productId: string | null;
  }[]
): Promise<LabelInput["volume"]> {
  const lines = items
    .filter((i) => !!i.productId)
    .map((i) => ({ productId: i.productId!, quantity: i.quantity }));

  if (lines.length === 0) {
    const dims = packageToSuperFreteKgCm({
      weightGrams: 300,
      lengthCm: 16,
      widthCm: 11,
      heightCm: 2,
    });
    return {
      height: dims.heightCm,
      width: dims.widthCm,
      length: dims.lengthCm,
      weight: dims.weightKg,
    };
  }

  const pkg = await buildCartShippingPackage(lines);
  const dims = packageToSuperFreteKgCm({
    weightGrams: pkg.weightGrams,
    lengthCm: pkg.lengthCm,
    widthCm: pkg.widthCm,
    heightCm: pkg.heightCm,
  });

  return {
    height: dims.heightCm,
    width: dims.widthCm,
    length: dims.lengthCm,
    weight: dims.weightKg,
  };
}

export async function generateExchangeLabel(input: {
  exchangeId: string;
  type: ExchangeShippingType;
  actorUserId: string;
  serviceId?: number | null;
}) {
  const exchange = await prisma.exchange.findUnique({
    where: { id: input.exchangeId },
    include: {
      items: true,
      shippings: true,
      order: {
        select: {
          id: true,
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
        },
      },
    },
  });

  if (!exchange) {
    throw new ExchangeError("NOT_FOUND", "Troca não encontrada.");
  }

  if (exchange.status === ExchangeStatus.CANCELLED) {
    throw new ExchangeError("CANCELLED", "Troca cancelada.");
  }

  const shipping = exchange.shippings.find((s) => s.type === input.type);
  if (!shipping) {
    throw new ExchangeError(
      "SHIPPING_MISSING",
      input.type === "RETURN"
        ? "Frete de retorno não configurado."
        : "Frete de reenvio não configurado."
    );
  }

  if (
    shipping.method === "STORE_PICKUP" ||
    shipping.method === "LOCAL_COURIER"
  ) {
    throw new ExchangeError(
      "LOCAL_SHIPPING",
      shipping.method === "STORE_PICKUP"
        ? "Retorno na loja não usa etiqueta SuperFrete."
        : "Coleta local não usa etiqueta SuperFrete."
    );
  }

  if (shipping.superfreteShipmentId && shipping.shippingStatus !== "cancelled") {
    throw new ExchangeError(
      "LABEL_EXISTS",
      "Já existe etiqueta para este envio."
    );
  }

  if (input.type === "OUTBOUND") {
    if (exchange.balanceStatus === ExchangeBalanceStatus.PENDING) {
      throw new ExchangeError(
        "PAYMENT_PENDING",
        "Aguarde o pagamento da cliente antes de gerar a etiqueta de reenvio."
      );
    }
    if (
      exchange.status !== ExchangeStatus.READY_OUTBOUND &&
      exchange.status !== ExchangeStatus.OUTBOUND
    ) {
      throw new ExchangeError(
        "INVALID_STATUS",
        "Conclua a conferência e o pagamento antes de gerar a etiqueta de reenvio."
      );
    }
  }

  const serviceId =
    resolveServiceId(input.serviceId) ??
    resolveServiceId(shipping.shippingServiceId);

  if (serviceId == null) {
    throw new ExchangeError(
      "SERVICE_REQUIRED",
      "Selecione o serviço de frete antes de gerar a etiqueta."
    );
  }

  const directionItems = exchange.items.filter((i) =>
    input.type === "RETURN" ? i.direction === "RETURN" : i.direction === "OUTBOUND"
  );

  if (directionItems.length === 0) {
    throw new ExchangeError("NO_ITEMS", "Não há itens para este envio.");
  }

  const customer = customerPartyFromOrder(exchange.order);
  const store = await storeAsLabelParty();

  const from = input.type === "RETURN" ? customer : store;
  const to = input.type === "RETURN" ? store : customer;

  const volume =
    volumeFromShipping(shipping) ??
    (await volumeFromItems(
      directionItems.map((i) => ({
        quantity: i.quantity,
        productId: i.productId,
      }))
    ));

  const products = directionItems.map((i) => ({
    name: i.productName,
    quantity: i.quantity,
    unitary_value: i.unitPrice,
  }));

  const insuranceValue = directionItems.reduce(
    (acc, i) => acc + i.unitPrice * i.quantity,
    0
  );

  let result;
  try {
    result = await createSuperfreteLabelForOrder({
      serviceId,
      from,
      to,
      products,
      volume,
      insuranceValue,
      tag: `T${exchange.exchangeNumber ?? exchange.id.slice(0, 6)}-${input.type === "RETURN" ? "R" : "O"}`,
      orderNumber: exchange.order.orderNumber,
    });
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      throw new ExchangeError("SUPERFRETE", e.message);
    }
    throw e;
  }

  let tracking: string | null = null;
  let cost: number | null = shipping.quotedPrice;
  let superfreteStatus = result.superfreteStatus;
  let labelUrl = result.labelUrl || null;

  try {
    const info = await fetchSuperfreteOrderInfoWithTrackingPoll(result.shipmentId, {
      maxWaitMs: 8000,
    });
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

  const updated = await prisma.$transaction(async (tx) => {
    await tx.exchangeShipping.update({
      where: { id: shipping.id },
      data: {
        shippingServiceId: serviceId,
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
    if (input.type === "RETURN" && exchange.status === ExchangeStatus.AWAITING_RETURN) {
      if (mapped === "shipped" || mapped === "delivered") {
        nextStatus = ExchangeStatus.RETURN_IN_TRANSIT;
      }
    }
    if (input.type === "OUTBOUND") {
      nextStatus = ExchangeStatus.OUTBOUND;
    }

    const ex = await tx.exchange.update({
      where: { id: exchange.id },
      data: { status: nextStatus },
      include: {
        items: true,
        shippings: true,
        events: { orderBy: { createdAt: "asc" } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            recipientName: true,
            email: true,
          },
        },
      },
    });

    await appendExchangeEvent(tx, {
      exchangeId: exchange.id,
      type:
        input.type === "RETURN"
          ? "REVERSE_LABEL_GENERATED"
          : "OUTBOUND_LABEL_GENERATED",
      actorUserId: input.actorUserId,
      payload: { shipmentId: result.shipmentId, serviceId },
    });

    if (
      input.type === "RETURN" &&
      (mapped === "shipped" || mapped === "delivered")
    ) {
      await appendExchangeEvent(tx, {
        exchangeId: exchange.id,
        type: "RETURN_POSTED",
        actorUserId: input.actorUserId,
      });
    }

    return ex;
  });

  return updated;
}
