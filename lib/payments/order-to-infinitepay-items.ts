import type { InfinitePayLinkItem } from "@/lib/payments/infinitepay";

type OrderRow = {
  total: number;
  shippingAmount: number;
  shippingServiceName: string | null;
  items: {
    quantity: number;
    price: number;
    product: { name: string };
  }[];
};

export function orderToInfinitePayItems(order: OrderRow): InfinitePayLinkItem[] {
  const out: InfinitePayLinkItem[] = [];
  let sumCents = 0;

  for (const it of order.items) {
    const unitCents = Math.round(it.price * 100);
    sumCents += unitCents * it.quantity;
    out.push({
      quantity: it.quantity,
      price: unitCents,
      description: it.product.name.slice(0, 180),
    });
  }

  const targetCents = Math.round(order.total * 100);
  const freightCents = targetCents - sumCents;

  if (freightCents > 0) {
    const labelBase = order.shippingServiceName?.trim() || "Envio";
    out.push({
      quantity: 1,
      price: freightCents,
      description: `Frete — ${labelBase}`.slice(0, 180),
    });
  } else if (freightCents < 0) {
    throw new Error("INFINITEPAY_TOTAL_MISMATCH");
  }

  return out;
}
