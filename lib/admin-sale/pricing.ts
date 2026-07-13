import { DiscountMode } from "@/app/generated/prisma/client";
import type { CartPieceSelection } from "@/lib/cart/types";
import type { PaymentMethod } from "@/lib/orders/constants";
import { prisma } from "@/lib/prisma";

export type DiscountInput = {
  mode: DiscountMode;
  value: number;
};

export type AdminSaleLineInput = {
  productId: string;
  quantity: number;
  pieceSelections?: CartPieceSelection[];
  itemDiscount?: DiscountInput;
};

export type ResolvedAdminSaleLine = {
  productId: string;
  quantity: number;
  pieceSelections?: CartPieceSelection[];
  catalogListPrice: number;
  catalogPromoPrice: number | null;
  catalogUnitPrice: number;
  itemDiscountMode: DiscountMode | null;
  itemDiscountValue: number | null;
  itemDiscountAmount: number;
  unitPrice: number;
  lineSubtotalOriginal: number;
  lineSubtotalFinal: number;
};

export type AdminSalePricingInput = {
  lines: AdminSaleLineInput[];
  paymentMethod: PaymentMethod;
  shippingAmount: number;
  orderDiscount?: DiscountInput;
};

export type AdminSalePricingResult = {
  lines: ResolvedAdminSaleLine[];
  subtotalOriginal: number;
  itemsDiscountTotal: number;
  subtotalAfterItemDiscounts: number;
  orderDiscountAmount: number;
  shippingAmount: number;
  total: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateDiscountAmount(
  base: number,
  discount?: DiscountInput
): number {
  if (!discount || discount.value <= 0 || base <= 0) return 0;
  if (discount.mode === DiscountMode.FIXED) {
    return round2(Math.min(discount.value, base));
  }
  const pct = Math.min(Math.max(discount.value, 0), 100);
  return round2((base * pct) / 100);
}

export async function resolveAdminSalePricing(
  input: AdminSalePricingInput
): Promise<AdminSalePricingResult> {
  const usePix = input.paymentMethod === "pix";
  const resolved: ResolvedAdminSaleLine[] = [];
  let subtotalOriginal = 0;
  let itemsDiscountTotal = 0;

  for (const line of input.lines) {
    const product = await prisma.product.findUnique({
      where: { id: line.productId.trim() },
      select: { id: true, price: true, pixPrice: true, name: true },
    });
    if (!product) {
      throw new Error(`Produto não encontrado: ${line.productId}`);
    }

    const qty = Math.floor(Number(line.quantity));
    if (qty < 1) throw new Error("Quantidade inválida.");

    const catalogListPrice = round2(product.price);
    const catalogPromoPrice =
      product.pixPrice != null ? round2(product.pixPrice) : null;
    const catalogUnitPrice = round2(
      usePix ? (catalogPromoPrice ?? catalogListPrice) : catalogListPrice
    );

    const lineOriginal = round2(catalogUnitPrice * qty);
    const unitDiscount = calculateDiscountAmount(
      catalogUnitPrice,
      line.itemDiscount
    );
    const itemDiscountAmount = round2(unitDiscount * qty);
    const unitPrice = round2(Math.max(catalogUnitPrice - unitDiscount, 0));
    const lineSubtotalFinal = round2(unitPrice * qty);

    resolved.push({
      productId: product.id,
      quantity: qty,
      ...(line.pieceSelections?.length
        ? { pieceSelections: line.pieceSelections }
        : {}),
      catalogListPrice,
      catalogPromoPrice,
      catalogUnitPrice,
      itemDiscountMode: line.itemDiscount?.mode ?? null,
      itemDiscountValue: line.itemDiscount?.value ?? null,
      itemDiscountAmount,
      unitPrice,
      lineSubtotalOriginal: lineOriginal,
      lineSubtotalFinal,
    });

    subtotalOriginal += lineOriginal;
    itemsDiscountTotal += itemDiscountAmount;
  }

  subtotalOriginal = round2(subtotalOriginal);
  itemsDiscountTotal = round2(itemsDiscountTotal);
  const subtotalAfterItemDiscounts = round2(
    subtotalOriginal - itemsDiscountTotal
  );

  const shippingAmount = round2(Math.max(input.shippingAmount, 0));
  const orderDiscountBase = round2(subtotalAfterItemDiscounts + shippingAmount);
  const orderDiscountAmount = calculateDiscountAmount(
    orderDiscountBase,
    input.orderDiscount
  );

  const total = round2(orderDiscountBase - orderDiscountAmount);

  if (total < 0) {
    throw new Error("Total da venda não pode ser negativo.");
  }

  return {
    lines: resolved,
    subtotalOriginal,
    itemsDiscountTotal,
    subtotalAfterItemDiscounts,
    orderDiscountAmount,
    shippingAmount,
    total,
  };
}
