import { cartLineKey } from "@/lib/cart/pure";
import type { CartPieceSelection } from "@/lib/cart/types";
import { CHECKOUT_SHIPPING_AMOUNT_BRL } from "@/lib/config/checkout-shipping-charge";
import type { PaymentMethod } from "@/lib/orders/constants";
import { ORDER_STATUS } from "@/lib/orders/constants";
import {
  OrderCreateError,
  type CheckoutLineInput,
  type OrderAddressInput,
  type OrderContactInput,
  type OrderShippingInput,
} from "@/lib/orders/create-order";
import {
  releaseStockReservations,
  reserveStockForOrderLines,
} from "@/lib/orders/stock/reservation";
import { prisma } from "@/lib/prisma";
import { quoteShippingForCartLines } from "@/lib/shipping/quote-cart";
import {
  parseSuperfreteServiceId,
  superfreteOptionId,
} from "@/lib/shipping/service-id";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import { normalizePostalCode } from "@/lib/shipping/superfrete";

export type MergedCheckoutLine = {
  productId: string;
  quantity: number;
  pieceSelections?: CartPieceSelection[];
};

export function mergeCheckoutLines(lines: CheckoutLineInput[]): MergedCheckoutLine[] {
  const merged = new Map<string, MergedCheckoutLine>();
  for (const l of lines) {
    const id = l.productId.trim();
    const q = Math.floor(Number(l.quantity));
    if (!id || q < 1) {
      throw new OrderCreateError("INVALID_LINE", "Quantidade inválida.");
    }
    const key = cartLineKey(id, l.pieceSelections);
    const prev = merged.get(key);
    if (prev) {
      merged.set(key, { ...prev, quantity: prev.quantity + q });
    } else {
      merged.set(key, {
        productId: id,
        quantity: q,
        ...(l.pieceSelections?.length
          ? { pieceSelections: l.pieceSelections }
          : {}),
      });
    }
  }
  const out = [...merged.values()];
  if (out.length === 0) {
    throw new OrderCreateError("EMPTY", "Nenhum item no pedido.");
  }
  return out;
}

export type PreparedOrderRecalculation = {
  mergedLines: MergedCheckoutLine[];
  destCep: string;
  shippingAmount: number;
  shippingQuotedPrice: number;
  shippingDeliveryDaysMin: number | null;
  shippingDeliveryDaysMax: number | null;
  shippingLabel: string;
  shippingServiceId: number | null;
  packageHeightCm: number | null;
  packageWidthCm: number | null;
  packageLengthCm: number | null;
  packageWeightKg: number | null;
  chosenOption: NormalizedShippingOption;
};

export type PrepareRecalculationInput = {
  lines: CheckoutLineInput[];
  shipping: OrderShippingInput;
  /** Quando carrinho e frete não mudaram, reutiliza dados já salvos na Order. */
  storedOrder?: StoredOrderShippingSnapshot | null;
};

export type StoredOrderShippingSnapshot = {
  destinationCep: string | null;
  shippingServiceId: number | null;
  shippingServiceName: string | null;
  shippingQuotedPrice: number | null;
  shippingDeliveryDaysMin: number | null;
  shippingDeliveryDaysMax: number | null;
  packageHeightCm: number | null;
  packageWidthCm: number | null;
  packageLengthCm: number | null;
  packageWeightKg: number | null;
  items: Array<{
    productId: string | null;
    quantity: number;
    pieceSelectionsJson: string | null;
  }>;
};

export function toStoredShippingSnapshot(order: StoredOrderShippingSnapshot): StoredOrderShippingSnapshot {
  return {
    destinationCep: order.destinationCep,
    shippingServiceId: order.shippingServiceId,
    shippingServiceName: order.shippingServiceName,
    shippingQuotedPrice: order.shippingQuotedPrice,
    shippingDeliveryDaysMin: order.shippingDeliveryDaysMin,
    shippingDeliveryDaysMax: order.shippingDeliveryDaysMax,
    packageHeightCm: order.packageHeightCm,
    packageWidthCm: order.packageWidthCm,
    packageLengthCm: order.packageLengthCm,
    packageWeightKg: order.packageWeightKg,
    items: order.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      pieceSelectionsJson: item.pieceSelectionsJson,
    })),
  };
}

function parseOrderPieceSelections(
  json: string | null
): CartPieceSelection[] | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as CartPieceSelection[];
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function checkoutLinesMatchOrderItems(
  mergedLines: MergedCheckoutLine[],
  orderItems: StoredOrderShippingSnapshot["items"]
): boolean {
  if (mergedLines.length !== orderItems.length) return false;

  const orderQty = new Map<string, number>();
  for (const item of orderItems) {
    if (!item.productId) return false;
    const key = cartLineKey(
      item.productId,
      parseOrderPieceSelections(item.pieceSelectionsJson)
    );
    orderQty.set(key, item.quantity);
  }

  for (const line of mergedLines) {
    const key = cartLineKey(line.productId, line.pieceSelections);
    if (orderQty.get(key) !== line.quantity) return false;
  }

  return true;
}

function shippingOptionMatchesStoredOrder(
  optionId: string,
  destCep: string,
  stored: StoredOrderShippingSnapshot
): boolean {
  if (normalizePostalCode(stored.destinationCep ?? "") !== destCep) {
    return false;
  }

  if (stored.shippingServiceId == null || stored.shippingQuotedPrice == null) {
    return false;
  }

  const requestedServiceId = parseSuperfreteServiceId(optionId);
  if (requestedServiceId == null) return false;

  return requestedServiceId === stored.shippingServiceId;
}

function canReuseStoredShipping(
  mergedLines: MergedCheckoutLine[],
  destCep: string,
  shipping: OrderShippingInput,
  stored: StoredOrderShippingSnapshot | null | undefined
): stored is StoredOrderShippingSnapshot {
  if (!stored) return false;
  if (!checkoutLinesMatchOrderItems(mergedLines, stored.items)) return false;
  return shippingOptionMatchesStoredOrder(shipping.optionId, destCep, stored);
}

function splitShippingLabel(label: string | null | undefined): {
  carrierName: string;
  serviceName: string;
} {
  const text = (label ?? "").trim();
  if (!text) return { carrierName: "Transportadora", serviceName: "Envio" };
  const parts = text.split(" — ");
  if (parts.length >= 2) {
    return {
      carrierName: parts[0]!.trim() || "Transportadora",
      serviceName: parts.slice(1).join(" — ").trim() || "Envio",
    };
  }
  return { carrierName: text, serviceName: "Envio" };
}

function buildPreparedFromStoredShipping(input: {
  mergedLines: MergedCheckoutLine[];
  destCep: string;
  stored: StoredOrderShippingSnapshot;
}): PreparedOrderRecalculation {
  const serviceId = input.stored.shippingServiceId!;
  const quotedPrice = input.stored.shippingQuotedPrice!;
  const { carrierName, serviceName } = splitShippingLabel(
    input.stored.shippingServiceName
  );

  const chosenOption: NormalizedShippingOption = {
    id: superfreteOptionId(serviceId),
    serviceId,
    carrierName,
    serviceName,
    price: quotedPrice,
    deliveryDaysMin: input.stored.shippingDeliveryDaysMin ?? 0,
    deliveryDaysMax: input.stored.shippingDeliveryDaysMax ?? 0,
  };

  return {
    mergedLines: input.mergedLines,
    destCep: input.destCep,
    shippingAmount: CHECKOUT_SHIPPING_AMOUNT_BRL,
    shippingQuotedPrice: Math.round(quotedPrice * 100) / 100,
    shippingDeliveryDaysMin: input.stored.shippingDeliveryDaysMin,
    shippingDeliveryDaysMax: input.stored.shippingDeliveryDaysMax,
    shippingLabel:
      input.stored.shippingServiceName?.trim() ||
      `${carrierName} — ${serviceName}`,
    shippingServiceId: serviceId,
    packageHeightCm: input.stored.packageHeightCm,
    packageWidthCm: input.stored.packageWidthCm,
    packageLengthCm: input.stored.packageLengthCm,
    packageWeightKg: input.stored.packageWeightKg,
    chosenOption,
  };
}

export async function prepareOrderRecalculation(
  input: PrepareRecalculationInput
): Promise<PreparedOrderRecalculation> {
  const mergedLines = mergeCheckoutLines(input.lines);

  const destCep = normalizePostalCode(input.shipping.destinationCep);
  if (!destCep) {
    throw new OrderCreateError("INVALID_CEP", "CEP de entrega inválido.");
  }

  if (canReuseStoredShipping(mergedLines, destCep, input.shipping, input.storedOrder)) {
    return buildPreparedFromStoredShipping({
      mergedLines,
      destCep,
      stored: input.storedOrder,
    });
  }

  const cartLinesForQuote = mergedLines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
  }));

  let quoteResult;
  try {
    quoteResult = await quoteShippingForCartLines(cartLinesForQuote, destCep);
  } catch (e) {
    if (canReuseStoredShipping(mergedLines, destCep, input.shipping, input.storedOrder)) {
      console.warn(
        "[prepareOrderRecalculation] SuperFrete indisponível — reutilizando frete salvo na Order"
      );
      return buildPreparedFromStoredShipping({
        mergedLines,
        destCep,
        stored: input.storedOrder,
      });
    }
    console.error("[prepareOrderRecalculation] frete", e);
    throw new OrderCreateError(
      "SHIPPING_QUOTE",
      "Não foi possível calcular o frete. Verifique o CEP."
    );
  }

  const chosen = quoteResult.options.find((o) => o.id === input.shipping.optionId);
  if (!chosen) {
    throw new OrderCreateError(
      "SHIPPING_OPTION",
      "Opção de frete inválida ou expirada. Calcule o frete novamente."
    );
  }

  const ideal = quoteResult.idealPackage;

  return {
    mergedLines,
    destCep,
    shippingAmount: CHECKOUT_SHIPPING_AMOUNT_BRL,
    shippingQuotedPrice: Math.round(chosen.price * 100) / 100,
    shippingDeliveryDaysMin:
      chosen.deliveryDaysMin > 0 ? Math.floor(chosen.deliveryDaysMin) : null,
    shippingDeliveryDaysMax:
      chosen.deliveryDaysMax > 0 ? Math.floor(chosen.deliveryDaysMax) : null,
    shippingLabel: `${chosen.carrierName} — ${chosen.serviceName}`,
    shippingServiceId:
      chosen.serviceId ?? parseSuperfreteServiceId(input.shipping.optionId),
    packageHeightCm: ideal?.heightCm ?? null,
    packageWidthCm: ideal?.widthCm ?? null,
    packageLengthCm: ideal?.lengthCm ?? null,
    packageWeightKg: ideal?.weightKg ?? null,
    chosenOption: chosen,
  };
}

export type ResolvedOrderLine = {
  productId: string;
  productName: string;
  productDescription: string | null;
  productImageUrl: string | null;
  quantity: number;
  price: number;
  catalogListPrice: number;
  catalogPromoPrice: number | null;
  pieceSelections?: CartPieceSelection[];
};

export type ResolvedOrderTotals = {
  lines: ResolvedOrderLine[];
  subtotal: number;
  total: number;
  shippingAmount: number;
};

export type ResolveLinesInput = {
  mergedLines: MergedCheckoutLine[];
  paymentMethod: PaymentMethod;
  shippingAmount: number;
};

type ProductReader = {
  product: {
    findUnique: typeof prisma.product.findUnique;
  };
};

export async function resolveOrderLinesAndTotals(
  input: ResolveLinesInput,
  db: ProductReader
): Promise<ResolvedOrderTotals> {
  const resolved: ResolvedOrderLine[] = [];
  let subtotal = 0;
  const usePix = input.paymentMethod === "pix";

  for (const line of input.mergedLines) {
    const product = await db.product.findUnique({
      where: { id: line.productId },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        pixPrice: true,
        images: {
          orderBy: { order: "asc" as const },
          take: 1,
          select: { url: true },
        },
      },
    });

    if (!product) {
      throw new OrderCreateError(
        "PRODUCT_NOT_FOUND",
        "Um dos produtos não está mais disponível."
      );
    }

    const catalogListPrice = product.price;
    const catalogPromoPrice = product.pixPrice;
    const linePrice = usePix
      ? (catalogPromoPrice ?? catalogListPrice)
      : catalogListPrice;

    resolved.push({
      productId: product.id,
      productName: product.name.trim() || "Produto",
      productDescription: product.description?.trim() || null,
      productImageUrl: product.images[0]?.url ?? null,
      quantity: line.quantity,
      price: linePrice,
      catalogListPrice,
      catalogPromoPrice,
      ...(line.pieceSelections?.length
        ? { pieceSelections: line.pieceSelections }
        : {}),
    });
    subtotal += linePrice * line.quantity;
  }

  subtotal = Math.round(subtotal * 100) / 100;
  const total = Math.round((subtotal + input.shippingAmount) * 100) / 100;

  return {
    lines: resolved,
    subtotal,
    total,
    shippingAmount: input.shippingAmount,
  };
}

type OrderWriter = Pick<
  typeof prisma,
  | "$executeRawUnsafe"
  | "order"
  | "orderItem"
  | "stockReservation"
  | "product"
  | "pieceVariant"
>;

export type PersistOrderFieldsInput = {
  orderId: string;
  prepared: PreparedOrderRecalculation;
  contact?: OrderContactInput;
  address?: OrderAddressInput;
  cpf?: string;
  totals: ResolvedOrderTotals;
  paymentMethod: PaymentMethod;
  lastRecalculatedAt: Date;
};

export async function persistRecalculatedOrder(
  tx: OrderWriter,
  input: PersistOrderFieldsInput
): Promise<void> {
  const { orderId, prepared, contact, address, cpf, totals, paymentMethod } =
    input;

  await releaseStockReservations(tx, orderId);

  await tx.orderItem.deleteMany({ where: { orderId } });

  await reserveStockForOrderLines(
    tx,
    orderId,
    totals.lines,
    input.lastRecalculatedAt
  );

  if (totals.lines.length > 0) {
    await tx.orderItem.createMany({
      data: totals.lines.map((r) => ({
        orderId,
        productId: r.productId,
        productName: r.productName,
        productDescription: r.productDescription,
        productImageUrl: r.productImageUrl,
        quantity: r.quantity,
        price: r.price,
        catalogListPrice: r.catalogListPrice,
        catalogPromoPrice: r.catalogPromoPrice,
        catalogUnitPrice: r.price,
        lineSubtotalOriginal: Math.round(r.price * r.quantity * 100) / 100,
        lineSubtotalFinal: Math.round(r.price * r.quantity * 100) / 100,
        pieceSelectionsJson: r.pieceSelections?.length
          ? JSON.stringify(r.pieceSelections)
          : null,
      })),
    });
  }

  await tx.order.update({
    where: { id: orderId },
    data: {
      total: totals.total,
      paymentMethod,
      lastRecalculatedAt: input.lastRecalculatedAt,
    },
  });

  await tx.$executeRawUnsafe(
    `UPDATE "Order" SET
      "shippingAmount" = ?,
      "shippingQuotedPrice" = ?,
      "shippingDeliveryDaysMin" = ?,
      "shippingDeliveryDaysMax" = ?,
      "shippingServiceName" = ?,
      "shippingServiceId" = ?,
      "destinationCep" = ?,
      "recipientName" = ?,
      "phone" = ?,
      "cpf" = ?,
      "addressStreet" = ?,
      "addressNumber" = ?,
      "addressComplement" = ?,
      "addressNeighborhood" = ?,
      "addressCity" = ?,
      "addressState" = ?,
      "packageHeightCm" = ?,
      "packageWidthCm" = ?,
      "packageLengthCm" = ?,
      "packageWeightKg" = ?,
      "updatedAt" = datetime('now')
    WHERE "id" = ?`,
    prepared.shippingAmount,
    prepared.shippingQuotedPrice,
    prepared.shippingDeliveryDaysMin,
    prepared.shippingDeliveryDaysMax,
    prepared.shippingLabel,
    prepared.shippingServiceId,
    prepared.destCep,
    contact?.name ?? null,
    contact?.phone ?? null,
    cpf ?? contact?.cpf ?? null,
    address?.street ?? null,
    address?.number ?? null,
    address?.complement ?? null,
    address?.neighborhood ?? null,
    address?.city ?? null,
    address?.state ?? null,
    prepared.packageHeightCm,
    prepared.packageWidthCm,
    prepared.packageLengthCm,
    prepared.packageWeightKg,
    orderId
  );
}

export type RecalculateOrderInput = {
  orderId: string;
  lines: CheckoutLineInput[];
  shipping: OrderShippingInput;
  contact?: OrderContactInput;
  address?: OrderAddressInput;
  cpf?: string;
  paymentMethod: PaymentMethod;
};

export type RecalculateOrderResult = {
  orderId: string;
  total: number;
  shippingAmount: number;
  previousTotal: number | null;
  priceUpdated: boolean;
};

export async function recalculateOrder(
  input: RecalculateOrderInput
): Promise<RecalculateOrderResult> {
  const existing = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      status: true,
      total: true,
      destinationCep: true,
      shippingServiceId: true,
      shippingServiceName: true,
      shippingQuotedPrice: true,
      shippingDeliveryDaysMin: true,
      shippingDeliveryDaysMax: true,
      packageHeightCm: true,
      packageWidthCm: true,
      packageLengthCm: true,
      packageWeightKg: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          pieceSelectionsJson: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!existing) {
    throw new OrderCreateError("ORDER_NOT_FOUND", "Pedido não encontrado.");
  }
  if (existing.status !== ORDER_STATUS.PENDING_PAYMENT) {
    throw new OrderCreateError(
      "ORDER_NOT_PENDING",
      "Este pedido não pode mais ser alterado."
    );
  }

  const previousTotal = existing.total;
  const prepared = await prepareOrderRecalculation({
    lines: input.lines,
    shipping: input.shipping,
    storedOrder: toStoredShippingSnapshot(existing),
  });

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { status: true },
    });
    if (!locked || locked.status !== ORDER_STATUS.PENDING_PAYMENT) {
      throw new OrderCreateError(
        "ORDER_NOT_PENDING",
        "Este pedido não pode mais ser alterado."
      );
    }

    const totals = await resolveOrderLinesAndTotals(
      {
        mergedLines: prepared.mergedLines,
        paymentMethod: input.paymentMethod,
        shippingAmount: prepared.shippingAmount,
      },
      tx
    );

    await persistRecalculatedOrder(tx, {
      orderId: input.orderId,
      prepared,
      contact: input.contact,
      address: input.address,
      cpf: input.cpf,
      totals,
      paymentMethod: input.paymentMethod,
      lastRecalculatedAt: now,
    });

    return totals;
  });

  return {
    orderId: input.orderId,
    total: result.total,
    shippingAmount: result.shippingAmount,
    previousTotal,
    priceUpdated: previousTotal !== result.total,
  };
}
