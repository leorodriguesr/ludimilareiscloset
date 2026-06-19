import { StockType } from "@/app/generated/prisma/client";
import { cartLineKey } from "@/lib/cart/pure";
import type { CartPieceSelection } from "@/lib/cart/types";
import { prisma } from "@/lib/prisma";
import { quoteShippingForCartLines } from "@/lib/shipping/quote-cart";
import { parseSuperfreteServiceId } from "@/lib/shipping/service-id";
import { normalizePostalCode } from "@/lib/shipping/superfrete";
import { CHECKOUT_SHIPPING_AMOUNT_BRL } from "@/lib/config/checkout-shipping-charge";

export type CheckoutLineInput = {
  productId: string;
  quantity: number;
  pieceSelections?: CartPieceSelection[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateOrderResult = {
  id: string;
  total: number;
  shippingAmount: number;
};

export type OrderShippingInput = {
  destinationCep: string;
  optionId: string;
};

export type OrderContactInput = {
  name?: string;
  phone?: string;
  cpf?: string;
};

export type OrderAddressInput = {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

export async function createOrderFromCheckout(input: {
  email: string;
  userId: string | null;
  lines: CheckoutLineInput[];
  shipping: OrderShippingInput;
  contact?: OrderContactInput;
  address?: OrderAddressInput;
  /** "pix" usa pixPrice dos produtos; "card" (padrão) usa price. */
  paymentMethod?: "pix" | "card";
}): Promise<CreateOrderResult> {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) {
    throw new OrderCreateError("INVALID_EMAIL", "E-mail inválido.");
  }

  const merged = new Map<
    string,
    {
      productId: string;
      quantity: number;
      pieceSelections?: CartPieceSelection[];
    }
  >();
  for (const l of input.lines) {
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

  const lines = [...merged.values()];

  if (lines.length === 0) {
    throw new OrderCreateError("EMPTY", "Nenhum item no pedido.");
  }

  const destCep = normalizePostalCode(input.shipping.destinationCep);
  if (!destCep) {
    throw new OrderCreateError("INVALID_CEP", "CEP de entrega inválido.");
  }

  const cartLinesForQuote = lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
  }));

  let quoteResult;
  try {
    quoteResult = await quoteShippingForCartLines(cartLinesForQuote, destCep);
  } catch (e) {
    console.error("[createOrderFromCheckout] frete", e);
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

  const shippingAmount = CHECKOUT_SHIPPING_AMOUNT_BRL;
  const shippingQuotedPrice = Math.round(chosen.price * 100) / 100;
  const shippingDeliveryDaysMin =
    chosen.deliveryDaysMin > 0 ? Math.floor(chosen.deliveryDaysMin) : null;
  const shippingDeliveryDaysMax =
    chosen.deliveryDaysMax > 0 ? Math.floor(chosen.deliveryDaysMax) : null;
  const shippingLabel = `${chosen.carrierName} — ${chosen.serviceName}`;
  const shippingServiceId =
    chosen.serviceId ?? parseSuperfreteServiceId(input.shipping.optionId);
  const ideal = quoteResult.idealPackage;

  return prisma.$transaction(async (tx) => {
    const resolved: {
      productId: string;
      quantity: number;
      price: number;
      pieceSelections?: CartPieceSelection[];
    }[] = [];
    let subtotal = 0;

    const usePix = input.paymentMethod === "pix";

    for (const line of lines) {
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: {
          id: true,
          price: true,
          pixPrice: true,
          stockType: true,
          stockQuantity: true,
        },
      });

      if (!product) {
        throw new OrderCreateError(
          "PRODUCT_NOT_FOUND",
          "Um dos produtos não está mais disponível."
        );
      }

      if (product.stockType === StockType.LIMITED) {
        const available = product.stockQuantity ?? 0;
        if (available < line.quantity) {
          throw new OrderCreateError(
            "INSUFFICIENT_STOCK",
            "Estoque insuficiente para a quantidade solicitada."
          );
        }
      }

      const linePrice = usePix
        ? (product.pixPrice ?? product.price)
        : product.price;

      resolved.push({
        productId: product.id,
        quantity: line.quantity,
        price: linePrice,
        ...(line.pieceSelections?.length
          ? { pieceSelections: line.pieceSelections }
          : {}),
      });
      subtotal += linePrice * line.quantity;
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const total = Math.round((subtotal + shippingAmount) * 100) / 100;

    // Número sequencial legível: MAX atual + 1 (seguro dentro da transação)
    const maxRows = await tx.$queryRawUnsafe<{ max: number | null }[]>(
      `SELECT MAX("orderNumber") as max FROM "Order"`
    );
    const nextOrderNumber = (maxRows[0]?.max ?? 0) + 1;

    const created = await tx.order.create({
      data: {
        email: normalizedEmail,
        orderNumber: nextOrderNumber,
        ...(input.userId
          ? { user: { connect: { id: input.userId } } }
          : {}),
        status: "pending_payment",
        total,
        paymentMethod: input.paymentMethod ?? "card",
        items: {
          create: resolved.map((r) => ({
            quantity: r.quantity,
            price: r.price,
            pieceSelectionsJson: r.pieceSelections?.length
              ? JSON.stringify(r.pieceSelections)
              : null,
            product: { connect: { id: r.productId } },
          })),
        },
      },
      select: { id: true },
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
      shippingAmount,
      shippingQuotedPrice,
      shippingDeliveryDaysMin,
      shippingDeliveryDaysMax,
      shippingLabel,
      shippingServiceId,
      destCep,
      input.contact?.name ?? null,
      input.contact?.phone ?? null,
      input.contact?.cpf ?? null,
      input.address?.street ?? null,
      input.address?.number ?? null,
      input.address?.complement ?? null,
      input.address?.neighborhood ?? null,
      input.address?.city ?? null,
      input.address?.state ?? null,
      ideal?.heightCm ?? null,
      ideal?.widthCm ?? null,
      ideal?.lengthCm ?? null,
      ideal?.weightKg ?? null,
      created.id
    );

    const orderRows = await tx.$queryRawUnsafe<
      { id: string; total: number; shippingAmount: number }[]
    >(
      `SELECT "id", "total", "shippingAmount" FROM "Order" WHERE "id" = ? LIMIT 1`,
      created.id
    );
    const order = orderRows[0];
    if (!order) {
      throw new OrderCreateError(
        "ORDER_PERSIST",
        "Não foi possível confirmar o pedido após gravar o frete."
      );
    }

    return {
      id: order.id,
      total: order.total,
      shippingAmount: order.shippingAmount,
    };
  });
}

export class OrderCreateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OrderCreateError";
    this.code = code;
  }
}
