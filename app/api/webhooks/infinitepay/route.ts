import { NextRequest, NextResponse } from "next/server";
import { confirmPaymentFromInfinitePay } from "@/lib/orders/confirm-payment";
import { parseInfinitePayWebhookPayload } from "@/lib/payments/parse-infinitepay-webhook";
import { readWebhookJsonBody } from "@/lib/payments/read-webhook-json-body";

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

  if (process.env.NODE_ENV === "development") {
    console.info("[webhook infinitepay]", {
      orderNsu: orderNsu ? `${orderNsu.slice(0, 12)}…` : "(slug only)",
      invoiceSlug: invoiceSlug ? `${invoiceSlug.slice(0, 8)}…` : "",
      hasTransaction: Boolean(parsed?.transactionNsu?.trim()),
    });
  }

  try {
    const result = await confirmPaymentFromInfinitePay({
      orderNsu: orderNsu || null,
      invoiceSlug: invoiceSlug || null,
      transactionNsu: parsed?.transactionNsu?.trim() || null,
      captureMethod: parsed?.captureMethod?.trim() || null,
      source: "webhook",
      payload: body,
    });
    if (process.env.NODE_ENV === "development" && !result.updated) {
      console.info(
        "[webhook infinitepay] pagamento não confirmado:",
        result.outcome
      );
    }
  } catch (e) {
    console.error("[webhook infinitepay]", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
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
