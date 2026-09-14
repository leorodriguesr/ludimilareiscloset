import { prisma } from "@/lib/prisma";
import { buildCartShippingPackage } from "@/lib/shipping/cart-package";
import { packageToSuperFreteKgCm } from "@/lib/shipping/superfrete";
import { resolveStoreSender } from "@/lib/shipping/superfrete-account";
import {
  createMelhorEnvioLabelForOrder,
  fetchMelhorEnvioOrderInfoWithTrackingPoll,
} from "@/lib/shipping/melhor-envio/label";
import {
  mapSuperfreteStatusToShippingStatus,
  parseSuperfreteServiceId,
} from "@/lib/shipping/service-id";
import { ShippingQuoteError } from "@/lib/shipping/types";
import type { LabelInput, LabelParty } from "@/lib/shipping/superfrete-label";
import { isLocalExchangeShippingMethod } from "@/lib/exchanges/shipping-method";
import { ReshipmentError } from "@/lib/reshipments/constants";
import { appendReshipmentEvent } from "@/lib/reshipments/events";
import { getOrderReshipment } from "@/lib/reshipments/create-reshipment";

function resolveServiceId(
  value: number | string | null | undefined
): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }
  return parseSuperfreteServiceId(value);
}

function customerPartyFromReshipment(row: {
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
    !row.recipientName?.trim() ||
    !row.addressStreet?.trim() ||
    !row.addressCity?.trim() ||
    !row.addressState?.trim() ||
    !row.destinationCep?.replace(/\D/g, "")
  ) {
    throw new ReshipmentError(
      "ADDRESS_INCOMPLETE",
      "Endereço incompleto para gerar etiqueta."
    );
  }

  return {
    name: row.recipientName.trim(),
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    document: row.cpf ?? undefined,
    address: row.addressStreet.trim(),
    number: row.addressNumber ?? undefined,
    complement: row.addressComplement ?? undefined,
    district: row.addressNeighborhood ?? undefined,
    city: row.addressCity.trim(),
    state_abbr: row.addressState.trim(),
    postal_code: row.destinationCep,
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

export async function generateReshipmentLabel(input: {
  reshipmentId: string;
  actorUserId: string;
  serviceId?: number | null;
}) {
  const reshipment = await prisma.orderReshipment.findUnique({
    where: { id: input.reshipmentId },
    include: {
      items: true,
      order: { select: { id: true, orderNumber: true } },
    },
  });

  if (!reshipment) {
    throw new ReshipmentError("NOT_FOUND", "Reenvio não encontrado.");
  }
  if (reshipment.status === "CANCELLED") {
    throw new ReshipmentError("CANCELLED", "Reenvio cancelado.");
  }
  if (isLocalExchangeShippingMethod(reshipment.method)) {
    throw new ReshipmentError(
      "LOCAL_SHIPPING",
      "Retirada ou motoboy não usa etiqueta de transportadora."
    );
  }
  if (reshipment.superfreteShipmentId && reshipment.shippingStatus !== "cancelled") {
    throw new ReshipmentError("LABEL_EXISTS", "Já existe etiqueta para este reenvio.");
  }
  if (reshipment.items.length === 0) {
    throw new ReshipmentError("NO_ITEMS", "Não há peças neste reenvio.");
  }

  const serviceId =
    resolveServiceId(input.serviceId) ??
    resolveServiceId(reshipment.shippingServiceId);
  if (serviceId == null) {
    throw new ReshipmentError(
      "SERVICE_REQUIRED",
      "Selecione o serviço de frete antes de gerar a etiqueta."
    );
  }

  const from = await storeAsLabelParty();
  const to = customerPartyFromReshipment(reshipment);
  const volume =
    volumeFromShipping(reshipment) ??
    (await volumeFromItems(
      reshipment.items.map((i) => ({
        quantity: i.quantity,
        productId: i.productId,
      }))
    ));

  const products = reshipment.items.map((i) => ({
    name: i.productName,
    quantity: i.quantity,
    unitary_value: i.unitPrice,
  }));
  const insuranceValue = reshipment.items.reduce(
    (acc, i) => acc + i.unitPrice * i.quantity,
    0
  );

  let result;
  try {
    result = await createMelhorEnvioLabelForOrder({
      serviceId,
      from,
      to,
      products,
      volume,
      insuranceValue,
      tag: `R${reshipment.order.orderNumber ?? reshipment.id.slice(0, 6)}`,
      orderNumber: reshipment.order.orderNumber,
    });
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      throw new ReshipmentError("SUPERFRETE", e.message);
    }
    throw e;
  }

  let tracking: string | null = null;
  let cost: number | null = reshipment.quotedPrice;
  let superfreteStatus = result.superfreteStatus;
  let labelUrl = result.labelUrl || null;

  try {
    const info = await fetchMelhorEnvioOrderInfoWithTrackingPoll(result.shipmentId, {
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
    mapped === "shipped" || mapped === "delivered" ? mapped : "to_pack";

  await prisma.$transaction(async (tx) => {
    await tx.orderReshipment.update({
      where: { id: reshipment.id },
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
        status:
          mapped === "delivered"
            ? "DELIVERED"
            : mapped === "shipped"
              ? "SHIPPED"
              : reshipment.status,
      },
    });
    await appendReshipmentEvent(tx, {
      reshipmentId: reshipment.id,
      type: "LABEL_GENERATED",
      actorUserId: input.actorUserId,
      payload: { shipmentId: result.shipmentId, serviceId },
    });
  });

  return getOrderReshipment(reshipment.id);
}
