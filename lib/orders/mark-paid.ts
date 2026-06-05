import { prisma } from "@/lib/prisma";

/**
 * Localiza um pedido `pending_payment` usando o NSU enviado na criação do link
 * ou o slug da fatura gravado ao criar o checkout (fallback quando o webhook não traz order_nsu).
 */
export async function resolvePendingOrderIdFromInfinitePayIds(input: {
  orderNsu?: string | null;
  invoiceSlug?: string | null;
}): Promise<string | null> {
  const nsu = (input.orderNsu ?? "").trim();
  const slug = (input.invoiceSlug ?? "").trim();

  if (nsu) {
    const byNsu = await prisma.order.findUnique({
      where: { id: nsu },
      select: { id: true, status: true },
    });
    if (byNsu?.status === "pending_payment") return byNsu.id;
  }

  if (slug) {
    const bySlug = await prisma.order.findFirst({
      where: {
        infinitePayInvoiceSlug: slug,
        status: "pending_payment",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (bySlug) return bySlug.id;
  }

  return null;
}

/**
 * Usado pelo webhook: aceita order_nsu e/ou invoice_slug como na documentação da InfinitePay.
 */
export async function markOrderPaidFromInfinitePayWebhook(input: {
  orderNsu?: string | null;
  invoiceSlug?: string | null;
  transactionNsu?: string | null;
  captureMethod?: string | null;
}): Promise<{ updated: boolean }> {
  const orderId = await resolvePendingOrderIdFromInfinitePayIds({
    orderNsu: input.orderNsu,
    invoiceSlug: input.invoiceSlug,
  });
  if (!orderId) {
    return { updated: false };
  }

  return markOrderPaidIfPending({
    orderId,
    transactionNsu: input.transactionNsu,
    invoiceSlug: input.invoiceSlug,
    captureMethod: input.captureMethod,
  });
}

export async function markOrderPaidIfPending(input: {
  orderId: string;
  transactionNsu?: string | null;
  invoiceSlug?: string | null;
  captureMethod?: string | null;
}): Promise<{ updated: boolean }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { status: true },
  });
  if (!order || order.status !== "pending_payment") {
    return { updated: false };
  }

  await prisma.order.update({
    where: { id: input.orderId },
    data: {
      status: "paid",
      paidAt: new Date(),
      ...(input.transactionNsu
        ? { infinitePayTransactionNsu: input.transactionNsu }
        : {}),
      ...(input.invoiceSlug ? { infinitePayInvoiceSlug: input.invoiceSlug } : {}),
      ...(input.captureMethod
        ? { paymentCaptureMethod: input.captureMethod }
        : {}),
    },
  });
  return { updated: true };
}
