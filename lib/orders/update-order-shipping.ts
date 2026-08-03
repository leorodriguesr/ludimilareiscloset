import { prisma } from "@/lib/prisma";
import { quoteShippingForOrder } from "@/lib/shipping/quote-order";
import { parseSuperfreteServiceId } from "@/lib/shipping/service-id";
import { ShippingQuoteError } from "@/lib/shipping/types";
import { resolveShippingProviderFromQuote } from "@/lib/shipping/providers";

export async function updateOrderShippingOption(orderId: string, optionId: string) {
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

  const quote = await quoteShippingForOrder(orderId);
  const chosen = quote.options.find((o) => o.id === trimmedOptionId);
  if (!chosen) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Opção de frete inválida ou indisponível para este pedido.",
      400
    );
  }

  const shippingQuotedPrice = Math.round(chosen.price * 100) / 100;
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
  // Após cancelar etiqueta, limpa rastros cancelados e volta a "por embalar".
  const nextShippingStatus =
    order.shippingStatus === "cancelled" ? "to_pack" : order.shippingStatus;

  await prisma.$executeRawUnsafe(
    `UPDATE "Order" SET
      "shippingQuotedPrice" = ?,
      "shippingDeliveryDaysMin" = ?,
      "shippingDeliveryDaysMax" = ?,
      "shippingServiceName" = ?,
      "shippingServiceId" = ?,
      "shippingProvider" = ?,
      "shippingQuotePackagesJson" = ?,
      "packageHeightCm" = ?,
      "packageWidthCm" = ?,
      "packageLengthCm" = ?,
      "packageWeightKg" = ?,
      "trackingCode" = NULL,
      "superfreteStatus" = NULL,
      "superfreteShipmentId" = NULL,
      "labelUrl" = NULL,
      "labelGeneratedAt" = NULL,
      "shippingStatus" = ?,
      "updatedAt" = datetime('now')
    WHERE id = ?`,
    shippingQuotedPrice,
    shippingDeliveryDaysMin,
    shippingDeliveryDaysMax,
    shippingServiceName,
    shippingServiceId,
    shippingProvider,
    packagesJson,
    ideal?.heightCm ?? null,
    ideal?.widthCm ?? null,
    ideal?.lengthCm ?? null,
    ideal?.weightKg ?? null,
    nextShippingStatus,
    orderId
  );

  return {
    shippingServiceName,
    shippingServiceId,
    shippingQuotedPrice,
    shippingDeliveryDaysMin,
    shippingDeliveryDaysMax,
    shippingStatus: nextShippingStatus,
    shippingProvider,
  };
}
