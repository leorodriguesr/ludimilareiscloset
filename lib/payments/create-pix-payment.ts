import { mpFetch } from "./mercadopago-client";

export type PixPaymentResult = {
  /** ID da Order no Mercado Pago (ex.: ORD... / ORDTST...). */
  mpOrderId: string;
  pixCode: string;
  pixQrBase64: string | null;
  expiresAt: string;
};

type MpOrderResponse = {
  id: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transactions?: {
    payments?: Array<{
      id?: string;
      date_of_expiration?: string;
      status?: string;
      payment_method?: {
        qr_code?: string;
        qr_code_base64?: string;
      };
    }>;
  };
};

/**
 * Cria um pagamento PIX via Orders API do Mercado Pago e retorna os dados do QR code.
 * Usa /v1/orders (compatível com credenciais de teste e produção).
 */
export async function createPixPayment(input: {
  orderId: string;
  /** Chave de idempotência única por tentativa de pagamento. */
  paymentAttemptId: string;
  amount: number;
  description: string;
  payerEmail: string;
  payerName?: string;
  payerCpf?: string;
}): Promise<PixPaymentResult> {
  // Em ambiente de teste, o MP exige que o pagador seja um usuário de teste.
  const testPayerEmail = process.env.MERCADO_PAGO_TEST_PAYER_EMAIL?.trim();
  const effectiveEmail = testPayerEmail || input.payerEmail;
  const firstName = input.payerName?.split(" ")[0] || "Cliente";

  const amount = (Math.round(input.amount * 100) / 100).toFixed(2);

  const order = await mpFetch<MpOrderResponse>("/v1/orders", {
    method: "POST",
    idempotencyKey: input.paymentAttemptId,
    body: {
      type: "online",
      external_reference: input.orderId,
      total_amount: amount,
      description: input.description.slice(0, 256),
      payer: {
        email: effectiveEmail,
        first_name: firstName,
      },
      transactions: {
        payments: [
          {
            amount,
            payment_method: {
              id: "pix",
              type: "bank_transfer",
            },
          },
        ],
      },
    },
  });

  const payment = order.transactions?.payments?.[0];
  const pixCode = payment?.payment_method?.qr_code;
  const pixQrBase64 = payment?.payment_method?.qr_code_base64 ?? null;

  if (!order.id || !pixCode) {
    throw new Error("Mercado Pago não retornou os dados do PIX.");
  }

  // PIX expira em 24h por padrão na Orders API; usamos o retornado se houver.
  const expiresAt =
    payment?.date_of_expiration ??
    new Date(Date.now() + 30 * 60 * 1000).toISOString();

  return {
    mpOrderId: order.id,
    pixCode,
    pixQrBase64,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/**
 * Consulta o status de uma Order no Mercado Pago.
 * Retorna "processed" quando o pagamento foi aprovado.
 */
export async function getMpOrderStatus(mpOrderId: string): Promise<{
  status: string;
  paid: boolean;
  externalReference: string | null;
}> {
  const details = await getMpOrderPixDetails(mpOrderId);
  return {
    status: details.status,
    paid: details.paid,
    externalReference: details.externalReference,
  };
}

export async function getMpOrderPixDetails(mpOrderId: string): Promise<{
  status: string;
  paid: boolean;
  externalReference: string | null;
  pixCode: string | null;
  pixQrBase64: string | null;
  expiresAt: string | null;
}> {
  const order = await mpFetch<MpOrderResponse>(
    `/v1/orders/${encodeURIComponent(mpOrderId)}`
  );
  const status = order.status ?? "unknown";
  const paid = status === "processed";
  const payment = order.transactions?.payments?.[0];
  const pixCode = payment?.payment_method?.qr_code ?? null;
  const pixQrBase64 = payment?.payment_method?.qr_code_base64 ?? null;
  const expiresAt = payment?.date_of_expiration
    ? new Date(payment.date_of_expiration).toISOString()
    : null;

  return {
    status,
    paid,
    externalReference: order.external_reference ?? null,
    pixCode,
    pixQrBase64,
    expiresAt,
  };
}
