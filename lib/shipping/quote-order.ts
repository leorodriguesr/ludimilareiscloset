import { prisma } from "@/lib/prisma";
import {
  quoteShippingForCartLines,
  quoteShippingForDefaultPackage,
  quoteShippingForPackageDims,
} from "@/lib/shipping/quote-cart";
import { ShippingQuoteError } from "@/lib/shipping/types";

export async function quoteShippingForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      destinationCep: true,
      packageHeightCm: true,
      packageWidthCm: true,
      packageLengthCm: true,
      packageWeightKg: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          price: true,
        },
      },
    },
  });

  if (!order) {
    throw new ShippingQuoteError("VALIDATION", "Pedido não encontrado.", 404);
  }

  const destCep = (order.destinationCep ?? "").replace(/\D/g, "");
  if (destCep.length !== 8) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "CEP de destino inválido ou não informado no pedido.",
      400
    );
  }

  if (!order.items.length) {
    throw new ShippingQuoteError("VALIDATION", "Pedido sem itens para cotar frete.", 400);
  }

  const lines = order.items
    .filter(
      (item): item is typeof item & { productId: string } =>
        typeof item.productId === "string" && item.productId.length > 0
    )
    .map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

  const quantity =
    order.items.reduce((sum, item) => sum + item.quantity, 0) || 1;
  const insuranceValue = order.items.reduce(
    (sum, item) => sum + Math.max(0, item.price) * item.quantity,
    0
  );

  if (lines.length > 0) {
    try {
      return await quoteShippingForCartLines(lines, destCep);
    } catch (e) {
      // productId órfão (produto removido fora do cascade): cai no fallback.
      if (!(e instanceof Error) || e.message !== "PRODUCT_NOT_FOUND") {
        throw e;
      }
    }
  }

  // Venda avulsa / produto removido do catálogo: cotar sem productId.
  const hasStoredPackage =
    order.packageHeightCm != null &&
    order.packageWidthCm != null &&
    order.packageLengthCm != null &&
    order.packageWeightKg != null &&
    order.packageHeightCm > 0 &&
    order.packageWidthCm > 0 &&
    order.packageLengthCm > 0 &&
    order.packageWeightKg > 0;

  if (hasStoredPackage) {
    return quoteShippingForPackageDims(destCep, {
      quantity: 1,
      insuranceValue,
      weightGrams: Math.round(order.packageWeightKg! * 1000),
      lengthCm: order.packageLengthCm!,
      widthCm: order.packageWidthCm!,
      heightCm: order.packageHeightCm!,
    });
  }

  return quoteShippingForDefaultPackage(destCep, {
    quantity,
    insuranceValue,
  });
}
