"use server";

import { markOrderPaidIfPending } from "@/lib/orders/mark-paid";
import { infinitePayPaymentCheck } from "@/lib/payments/infinitepay";
import { prisma } from "@/lib/prisma";

function pickParam(
  q: Record<string, string | string[] | undefined>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const v = q[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) {
      return v[0].trim();
    }
  }
  return null;
}

/**
 * Confirma pagamento ao retornar do checkout InfinitePay (query params no /pedido/[id]).
 * O slug da fatura costuma vir na URL; se não vier, usa o salvo ao criar o link de pagamento.
 */
export async function syncOrderPaymentFromReturn(
  orderId: string,
  searchParams: Record<string, string | string[] | undefined>
): Promise<{ confirmed: boolean }> {
  const slugFromUrl = pickParam(searchParams, [
    "slug",
    "invoice_slug",
    "invoiceSlug",
  ]);
  const transactionNsu = pickParam(searchParams, [
    "transaction_nsu",
    "transactionNsu",
    /** Alguns retornos usam o mesmo UUID em `transaction_id`. */
    "transaction_id",
    "transactionId",
  ]);

  let slug = slugFromUrl;
  if (!slug) {
    const row = await prisma.order.findUnique({
      where: { id: orderId },
      select: { infinitePayInvoiceSlug: true },
    });
    slug = row?.infinitePayInvoiceSlug ?? null;
  }

  if (!slug || !transactionNsu) {
    return { confirmed: false };
  }

  const check = await infinitePayPaymentCheck({
    orderNsu: orderId,
    transactionNsu,
    slug,
  });

  if (!check.success || !check.paid) {
    return { confirmed: false };
  }

  await markOrderPaidIfPending({
    orderId,
    transactionNsu,
    invoiceSlug: slug,
    captureMethod: check.captureMethod ?? undefined,
  });
  return { confirmed: true };
}
