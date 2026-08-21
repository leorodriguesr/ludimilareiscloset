import { DiscountMode } from "@/app/generated/prisma/client";
import type { CartPieceSelection } from "@/lib/cart/types";
import type { PaymentMethod } from "@/lib/orders/constants";
import { prisma } from "@/lib/prisma";

export type DiscountInput = {
  mode: DiscountMode;
  value: number;
};

export type AdminSaleCatalogLineInput = {
  kind: "catalog";
  productId: string;
  quantity: number;
  pieceSelections?: CartPieceSelection[];
  itemDiscount?: DiscountInput;
  /** Preço unitário informado pelo admin (substitui o de catálogo). */
  unitPrice?: number;
};

export type AdminSaleCustomPieceInput = {
  name: string;
  size: string;
  color: string;
};

export type AdminSaleCustomLineInput = {
  kind: "custom";
  description: string;
  /** Peças do conjunto (cada uma com tamanho/cor próprios). */
  pieces: AdminSaleCustomPieceInput[];
  /** Valor do conjunto inteiro (não por peça). */
  unitPrice: number;
  quantity: number;
  itemDiscount?: DiscountInput;
};

export type AdminSaleLineInput =
  | AdminSaleCatalogLineInput
  | AdminSaleCustomLineInput;

export type ResolvedAdminSaleLine = {
  productId: string | null;
  productName: string;
  productDescription: string | null;
  productImageUrl: string | null;
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

function resolveCustomLine(
  line: AdminSaleCustomLineInput
): ResolvedAdminSaleLine {
  const description = line.description.trim();
  if (!description) throw new Error("Informe a descrição do conjunto.");

  const pieces = (line.pieces ?? [])
    .map((p, index) => {
      const name = String(p.name ?? "").trim();
      const size = String(p.size ?? "").trim();
      const color = String(p.color ?? "").trim();
      return {
        name: name || (size || color ? `Peça ${index + 1}` : ""),
        size,
        color,
      };
    })
    .filter((p) => p.name || p.size || p.color);

  const qty = Math.floor(Number(line.quantity));
  if (qty < 1) throw new Error("Quantidade inválida.");

  const unit = round2(Number(line.unitPrice));
  if (!Number.isFinite(unit) || unit < 0) {
    throw new Error("Valor do conjunto inválido.");
  }

  const lineOriginal = round2(unit * qty);
  const unitDiscount = calculateDiscountAmount(unit, line.itemDiscount);
  const itemDiscountAmount = round2(unitDiscount * qty);
  const unitPrice = round2(Math.max(unit - unitDiscount, 0));
  const lineSubtotalFinal = round2(unitPrice * qty);

  return {
    productId: null,
    productName: description,
    productDescription: null,
    productImageUrl: null,
    quantity: qty,
    ...(pieces.length
      ? {
          pieceSelections: pieces.map((p) => ({
            pieceName: p.name || "Peça",
            size: p.size || null,
            color: p.color || null,
          })),
        }
      : {}),
    catalogListPrice: unit,
    catalogPromoPrice: null,
    catalogUnitPrice: unit,
    itemDiscountMode: line.itemDiscount?.mode ?? null,
    itemDiscountValue: line.itemDiscount?.value ?? null,
    itemDiscountAmount,
    unitPrice,
    lineSubtotalOriginal: lineOriginal,
    lineSubtotalFinal,
  };
}

async function resolveCatalogLine(
  line: AdminSaleCatalogLineInput,
  usePix: boolean
): Promise<ResolvedAdminSaleLine> {
  const product = await prisma.product.findUnique({
    where: { id: line.productId.trim() },
    select: {
      id: true,
      price: true,
      pixPrice: true,
      name: true,
      description: true,
      images: {
        orderBy: { order: "asc" },
        take: 1,
        select: { url: true },
      },
    },
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

  const hasOverride =
    line.unitPrice != null && Number.isFinite(Number(line.unitPrice));
  const unitPrice = hasOverride
    ? round2(Math.max(Number(line.unitPrice), 0))
    : round2(
        Math.max(
          catalogUnitPrice -
            calculateDiscountAmount(catalogUnitPrice, line.itemDiscount),
          0
        )
      );
  const itemDiscountAmount = round2(
    Math.max(catalogUnitPrice - unitPrice, 0) * qty
  );
  const lineOriginal = round2(catalogUnitPrice * qty);
  const lineSubtotalFinal = round2(unitPrice * qty);

  return {
    productId: product.id,
    productName: product.name.trim() || "Produto",
    productDescription: product.description?.trim() || null,
    productImageUrl: product.images[0]?.url ?? null,
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
  };
}

export async function resolveAdminSalePricing(
  input: AdminSalePricingInput
): Promise<AdminSalePricingResult> {
  const usePix = input.paymentMethod === "pix";
  const resolved: ResolvedAdminSaleLine[] = [];
  let subtotalOriginal = 0;
  let itemsDiscountTotal = 0;

  for (const line of input.lines) {
    const resolvedLine =
      line.kind === "custom"
        ? resolveCustomLine(line)
        : await resolveCatalogLine(line, usePix);

    resolved.push(resolvedLine);
    subtotalOriginal += resolvedLine.lineSubtotalOriginal;
    itemsDiscountTotal += resolvedLine.itemDiscountAmount;
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

/** Normaliza linha crua do body da API para o formato interno. */
export function normalizeAdminSaleLineInput(
  row: Record<string, unknown>,
  itemDiscount?: DiscountInput
): AdminSaleLineInput {
  const kind =
    row.kind === "custom" ||
    (!String(row.productId ?? "").trim() &&
      (row.description != null || row.unitPrice != null))
      ? "custom"
      : "catalog";

  if (kind === "custom") {
    const piecesRaw = Array.isArray(row.pieces) ? row.pieces : null;
    const pieces: AdminSaleCustomPieceInput[] = piecesRaw
      ? piecesRaw.map((p, index) => {
          const piece = (p ?? {}) as Record<string, unknown>;
          return {
            name: String(piece.name ?? piece.pieceName ?? `Peça ${index + 1}`),
            size: String(piece.size ?? ""),
            color: String(piece.color ?? ""),
          };
        })
      : [
          {
            name: "Conjunto",
            size: String(row.size ?? ""),
            color: String(row.color ?? ""),
          },
        ];

    return {
      kind: "custom",
      description: String(row.description ?? ""),
      pieces,
      unitPrice: Number(row.unitPrice ?? 0),
      quantity: Math.max(1, Math.floor(Number(row.quantity ?? 1)) || 1),
      ...(itemDiscount ? { itemDiscount } : {}),
    };
  }

  const unitPriceRaw = Number(row.unitPrice);
  return {
    kind: "catalog",
    productId: String(row.productId ?? ""),
    quantity: Math.max(1, Math.floor(Number(row.quantity ?? 1)) || 1),
    pieceSelections: Array.isArray(row.pieceSelections)
      ? (row.pieceSelections as CartPieceSelection[])
      : undefined,
    ...(itemDiscount ? { itemDiscount } : {}),
    ...(Number.isFinite(unitPriceRaw) ? { unitPrice: unitPriceRaw } : {}),
  };
}
