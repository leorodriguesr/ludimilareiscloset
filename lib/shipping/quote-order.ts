import { prisma } from "@/lib/prisma";
import { quoteShippingForCartLines } from "@/lib/shipping/quote-cart";
import { ShippingQuoteError } from "@/lib/shipping/types";

export async function quoteShippingForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      destinationCep: true,
      items: {
        select: {
          productId: true,
          quantity: true,
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

  if (!lines.length) {
    throw new ShippingQuoteError(
      "VALIDATION",
      "Pedido sem produtos do catálogo para cotar frete.",
      400
    );
  }

  return quoteShippingForCartLines(lines, destCep);
}
