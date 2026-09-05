import { NextRequest, NextResponse } from "next/server";
import {
  confirmPaymentFromInfinitePay,
  lookupInfinitePayAttempt,
} from "@/lib/orders/confirm-payment";
import { WEBHOOK_AUDIT_OUTCOME } from "@/lib/orders/payment-webhook-audit";
import { parseInfinitePayWebhookPayload } from "@/lib/payments/parse-infinitepay-webhook";
import { readWebhookJsonBody } from "@/lib/payments/read-webhook-json-body";
import {
  infinitePayOrderNsuCandidates,
  verifyInfinitePayPaymentWithApi,
} from "@/lib/payments/verify-infinitepay-payment";

function retryable(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

/** InfinitePay pode chamar POST (corpo JSON), GET (query string) ou form conforme ambiente. */
async function respondInfinitePayWebhook(
  rawBody: unknown
): Promise<NextResponse> {
  let body = rawBody;
  if (process.env.INFINITEPAY_WEBHOOK_DEBUG === "1") {
    try {
      console.info(
        "[webhook infinitepay] debug payload",
        typeof body === "string"
          ? body.slice(0, 4000)
          : JSON.stringify(body)?.slice(0, 4000)
      );
    } catch {
      console.info("[webhook infinitepay] debug payload (unserializable)");
    }
  }

  const parsed = parseInfinitePayWebhookPayload(body);
  const orderNsu = parsed?.orderNsu?.trim() ?? "";
  const invoiceSlug = parsed?.invoiceSlug?.trim() ?? "";
  const transactionNsu = parsed?.transactionNsu?.trim() ?? "";

  if (!orderNsu && !invoiceSlug) {
    if (process.env.NODE_ENV === "development") {
      const keys =
        body && typeof body === "object"
          ? Object.keys(body as object).slice(0, 25)
          : [];
      console.warn("[webhook infinitepay] sem order_nsu nem invoice_slug", keys);
    }
    return NextResponse.json(
      { ok: false, error: "missing identifiers" },
      { status: 200 }
    );
  }

  if (!transactionNsu) {
    console.warn("[webhook infinitepay] sem transaction_nsu");
    return retryable("missing transaction_nsu");
  }

  const attempt = await lookupInfinitePayAttempt({
    orderNsu: orderNsu || null,
    invoiceSlug: invoiceSlug || null,
  });
  if (!attempt) {
    console.warn("[webhook infinitepay] tentativa não encontrada", {
      orderNsu: orderNsu || null,
      invoiceSlug: invoiceSlug || null,
    });
    return retryable("payment attempt not found");
  }

  const verified = await verifyInfinitePayPaymentWithApi({
    orderNsuCandidates: infinitePayOrderNsuCandidates({
      orderNsu,
      orderId: attempt.orderId,
      attemptNumber: attempt.attemptNumber,
    }),
    transactionNsu,
    references: [invoiceSlug, attempt.gatewayReference],
    expectedAmountBRL: attempt.amount,
  });

  if (!verified.ok) {
    console.warn("[webhook infinitepay] payment_check falhou", verified.reason);
    return retryable(verified.reason);
  }

  try {
    const result = await confirmPaymentFromInfinitePay({
      orderNsu: verified.orderNsu,
      invoiceSlug: invoiceSlug || verified.reference,
      transactionNsu,
      captureMethod:
        parsed?.captureMethod?.trim() || verified.check.captureMethod || null,
      source: "webhook",
      payload: body,
    });
    if (
      result.updated ||
      result.outcome === WEBHOOK_AUDIT_OUTCOME.IGNORED_ALREADY_PAID
    ) {
      return NextResponse.json({ ok: true, matched: true });
    }
    if (process.env.NODE_ENV === "development") {
      console.info(
        "[webhook infinitepay] pagamento não confirmado:",
        result.outcome
      );
    }
    return retryable(result.outcome);
  } catch (e) {
    console.error("[webhook infinitepay]", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await readWebhookJsonBody(request);

  if (body === null) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  return respondInfinitePayWebhook(body);
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const obj: Record<string, string> = {};
  sp.forEach((value, key) => {
    obj[key] = value;
  });
  return respondInfinitePayWebhook(obj);
}
