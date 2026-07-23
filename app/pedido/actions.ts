"use server";

import { confirmPaymentFromInfinitePay } from "@/lib/orders/confirm-payment";
import { getActivePaymentAttempt } from "@/lib/orders/get-active-payment-attempt";
import { PAYMENT_GATEWAY } from "@/lib/orders/constants";
import {
  expandInfinitePayPaymentReferences,
  infinitePayPaymentCheckWithFallback,
} from "@/lib/payments/infinitepay";
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
 */
export async function syncOrderPaymentFromReturn(
  orderId: string,
  searchParams: Record<string, string | string[] | undefined>
): Promise<{ confirmed: boolean }> {
  const slugFromUrl = pickParam(searchParams, [
    "slug",
    "invoice_slug",
    "invoiceSlug",
    "lenc",
  ]);
  const transactionNsu = pickParam(searchParams, [
    "transaction_nsu",
    "transactionNsu",
    "transaction_id",
    "transactionId",
  ]);

  if (!transactionNsu) {
    return { confirmed: false };
  }

  const [attempt, orderRow] = await Promise.all([
    getActivePaymentAttempt(orderId),
    prisma.order.findUnique({
      where: { id: orderId },
      select: { infinitePayInvoiceSlug: true },
    }),
  ]);

  const references = expandInfinitePayPaymentReferences([
    slugFromUrl,
    attempt?.gateway === PAYMENT_GATEWAY.INFINITEPAY
      ? attempt.gatewayReference
      : null,
    orderRow?.infinitePayInvoiceSlug,
  ]);

  const verified = await infinitePayPaymentCheckWithFallback({
    orderNsu: orderId,
    transactionNsu,
    references,
  });

  if (!verified) {
    return { confirmed: false };
  }

  const invoiceSlug =
    slugFromUrl && !slugFromUrl.includes(".v1.")
      ? slugFromUrl
      : verified.reference;

  const result = await confirmPaymentFromInfinitePay({
    orderNsu: orderId,
    invoiceSlug,
    transactionNsu,
    captureMethod: verified.check.captureMethod ?? undefined,
    source: "return_url",
    payload: { searchParams, paymentCheck: verified.check },
  });

  return { confirmed: result.updated };
}
