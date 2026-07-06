import {
  confirmPaymentFromInfinitePay,
  confirmPaymentFromMercadoPago,
} from "@/lib/orders/confirm-payment";

/** @deprecated Use confirmPaymentFromInfinitePay. Mantido por compatibilidade. */
export async function markOrderPaidFromInfinitePayWebhook(input: {
  orderNsu?: string | null;
  invoiceSlug?: string | null;
  transactionNsu?: string | null;
  captureMethod?: string | null;
}): Promise<{ updated: boolean }> {
  const result = await confirmPaymentFromInfinitePay({
    orderNsu: input.orderNsu,
    invoiceSlug: input.invoiceSlug,
    transactionNsu: input.transactionNsu,
    captureMethod: input.captureMethod,
    source: "webhook",
    payload: input,
  });
  return { updated: result.updated };
}

/** @deprecated Use confirmPaymentFromMercadoPago. Mantido por compatibilidade. */
export async function markOrderPaidFromMercadoPago(input: {
  mpPaymentId: string;
  externalReference?: string | null;
}): Promise<{ updated: boolean }> {
  const result = await confirmPaymentFromMercadoPago({
    mpOrderId: input.mpPaymentId,
    source: "webhook",
    payload: input,
  });
  return { updated: result.updated };
}

/** @deprecated Use confirmPaymentFromInfinitePay / confirmPaymentFromMercadoPago. */
export async function markOrderPaidIfPending(_input: {
  orderId: string;
  transactionNsu?: string | null;
  invoiceSlug?: string | null;
  captureMethod?: string | null;
  mercadoPagoPaymentId?: string | null;
}): Promise<{ updated: boolean }> {
  console.warn(
    "[markOrderPaidIfPending] chamada legada — use confirmPaymentFromInfinitePay ou confirmPaymentFromMercadoPago"
  );
  return { updated: false };
}

export {
  confirmPaymentFromInfinitePay,
  confirmPaymentFromMercadoPago,
} from "@/lib/orders/confirm-payment";
