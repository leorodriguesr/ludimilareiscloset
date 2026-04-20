import { StockType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type CheckoutLineInput = {
  productId: string;
  quantity: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateOrderResult = { id: string; total: number };

export async function createOrderFromCheckout(input: {
  email: string;
  userId: string | null;
  lines: CheckoutLineInput[];
}): Promise<CreateOrderResult> {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) {
    throw new OrderCreateError("INVALID_EMAIL", "E-mail inválido.");
  }

  const merged = new Map<string, number>();
  for (const l of input.lines) {
    const id = l.productId.trim();
    const q = Math.floor(Number(l.quantity));
    if (!id || q < 1) {
      throw new OrderCreateError("INVALID_LINE", "Quantidade inválida.");
    }
    merged.set(id, (merged.get(id) ?? 0) + q);
  }

  const lines = [...merged.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));

  if (lines.length === 0) {
    throw new OrderCreateError("EMPTY", "Nenhum item no pedido.");
  }

  return prisma.$transaction(async (tx) => {
    const resolved: { productId: string; quantity: number; price: number }[] =
      [];
    let total = 0;

    for (const line of lines) {
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: {
          id: true,
          price: true,
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

      resolved.push({
        productId: product.id,
        quantity: line.quantity,
        price: product.price,
      });
      total += product.price * line.quantity;
    }

    const order = await tx.order.create({
      data: {
        email: normalizedEmail,
        userId: input.userId,
        status: "pending_payment",
        total,
        items: {
          create: resolved.map((r) => ({
            productId: r.productId,
            quantity: r.quantity,
            price: r.price,
          })),
        },
      },
      select: { id: true, total: true },
    });

    return { id: order.id, total: order.total };
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
