import { FulfillmentType } from "@/app/generated/prisma/client";
import { continueAdminSalePayment } from "@/lib/admin-sale/continue-admin-sale-payment";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS } from "@/lib/orders/constants";
import { quoteShippingForOrder } from "@/lib/shipping/quote-order";
import { parseSuperfreteServiceId } from "@/lib/shipping/service-id";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { resolveShippingProviderFromQuote } from "@/lib/shipping/providers";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function updateOrderShippingOption(
  orderId: string,
  optionId: string,
  options?: { actorUserId?: string }
) {
  const trimmedOptionId = optionId.trim();
  if (!trimmedOptionId) {
    throw new ShippingQuoteError("VALIDATION", "Selecione uma opção de frete.", 400);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      labelUrl: true,
      superfreteShipmentId: true,
      shippingStatus: true,
      shippingAmount: true,
      total: true,
      status: true,
      destinationCep: true,
    },
  });

  if (!order) {
    throw new ShippingQuoteError("VALIDATION", "Pedido não encontrado.", 404);
  }

  if (order.labelUrl || order.superfreteShipmentId) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Não é possível alterar o frete após gerar a etiqueta. Cancele a etiqueta primeiro.",
      400
    );
  }

  const destCep = (order.destinationCep ?? "").replace(/\D/g, "");
  if (destCep.length !== 8) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Informe o CEP da cliente antes de escolher o envio.",
      400
    );
  }

  const quote = await quoteShippingForOrder(orderId);
  const chosen = quote.options.find((o) => o.id === trimmedOptionId);
  if (!chosen) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Opção de frete inválida ou indisponível para este pedido.",
      400
    );
  }

  const shippingQuotedPrice = round2(chosen.price);
  const shippingDeliveryDaysMin =
    chosen.deliveryDaysMin > 0 ? Math.floor(chosen.deliveryDaysMin) : null;
  const shippingDeliveryDaysMax =
    chosen.deliveryDaysMax > 0 ? Math.floor(chosen.deliveryDaysMax) : null;
  const shippingServiceName = `${chosen.carrierName} — ${chosen.serviceName}`;
  const shippingServiceId =
    chosen.serviceId ?? parseSuperfreteServiceId(trimmedOptionId);
  const ideal = quote.idealPackage;
  const shippingProvider = resolveShippingProviderFromQuote({
    optionId: trimmedOptionId,
    quoteProvider: quote.provider,
  });
  const packagesJson = Array.isArray(chosen.packages)
    ? JSON.stringify(chosen.packages)
    : null;
  const nextShippingStatus =
    order.shippingStatus === "cancelled" ? "to_pack" : order.shippingStatus;
  const nextTotal = round2(order.total - order.shippingAmount + shippingQuotedPrice);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      fulfillmentType: FulfillmentType.CARRIER,
      shippingAmount: shippingQuotedPrice,
      total: nextTotal,
      shippingQuotedPrice,
      shippingDeliveryDaysMin,
      shippingDeliveryDaysMax,
      shippingServiceName,
      shippingServiceId,
      shippingProvider,
      shippingQuotePackagesJson: packagesJson,
      packageHeightCm: ideal?.heightCm ?? null,
      packageWidthCm: ideal?.widthCm ?? null,
      packageLengthCm: ideal?.lengthCm ?? null,
      packageWeightKg: ideal?.weightKg ?? null,
      trackingCode: null,
      superfreteStatus: null,
      superfreteShipmentId: null,
      labelUrl: null,
      labelGeneratedAt: null,
      shippingStatus: nextShippingStatus,
    },
    select: {
      fulfillmentType: true,
      shippingServiceName: true,
      shippingServiceId: true,
      shippingQuotedPrice: true,
      shippingDeliveryDaysMin: true,
      shippingDeliveryDaysMax: true,
      shippingStatus: true,
      shippingProvider: true,
      shippingAmount: true,
      total: true,
    },
  });

  if (order.status === ORDER_STATUS.PENDING_PAYMENT && options?.actorUserId) {
    await continueAdminSalePayment({
      orderId,
      userId: options.actorUserId,
      forceNewLink: true,
    });
  }

  return updated;
}
