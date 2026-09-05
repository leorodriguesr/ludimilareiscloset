import type { PaymentCheckResult } from "@/lib/payments/infinitepay";
import {
  buildInfinitePayOrderNsu,
  expandInfinitePayPaymentReferences,
  infinitePayPaymentCheckWithFallback,
} from "@/lib/payments/infinitepay";

const CENTS_TOLERANCE = 1;

export function infinitePayCentsMatchExpectedBRL(
  cents: number | null | undefined,
  expectedBRL: number
): boolean {
  if (cents == null || !Number.isFinite(cents) || cents < 0) return false;
  const expectedCents = Math.round(expectedBRL * 100);
  return Math.abs(cents - expectedCents) <= CENTS_TOLERANCE;
}

export function isVerifiedInfinitePayPayment(input: {
  check: PaymentCheckResult;
  expectedAmountBRL: number;
}): boolean {
  if (!input.check.success || !input.check.paid) return false;
  if (input.check.amount == null) return false;
  return infinitePayCentsMatchExpectedBRL(
    input.check.amount,
    input.expectedAmountBRL
  );
}

export async function verifyInfinitePayPaymentWithApi(input: {
  orderNsuCandidates: Array<string | null | undefined>;
  transactionNsu: string;
  references: Array<string | null | undefined>;
  expectedAmountBRL: number;
}): Promise<{
  ok: true;
  orderNsu: string;
  reference: string;
  check: PaymentCheckResult;
} | { ok: false; reason: string }> {
  const transactionNsu = input.transactionNsu.trim();
  if (!transactionNsu) {
    return { ok: false, reason: "transaction_nsu ausente." };
  }

  const seen = new Set<string>();
  const orderNsus = input.orderNsuCandidates
    .map((value) => value?.trim() ?? "")
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });

  if (orderNsus.length === 0) {
    return { ok: false, reason: "order_nsu ausente." };
  }

  const references = expandInfinitePayPaymentReferences(input.references);
  if (references.length === 0) {
    return { ok: false, reason: "slug/lenc ausente para payment_check." };
  }

  for (const orderNsu of orderNsus) {
    const verified = await infinitePayPaymentCheckWithFallback({
      orderNsu,
      transactionNsu,
      references,
    });
    if (!verified) continue;
    if (
      !isVerifiedInfinitePayPayment({
        check: verified.check,
        expectedAmountBRL: input.expectedAmountBRL,
      })
    ) {
      return {
        ok: false,
        reason: `payment_check não bate com o valor esperado (${input.expectedAmountBRL}).`,
      };
    }
    return {
      ok: true,
      orderNsu,
      reference: verified.reference,
      check: verified.check,
    };
  }

  return { ok: false, reason: "payment_check não confirmou o pagamento." };
}

export function infinitePayOrderNsuCandidates(input: {
  orderNsu?: string | null;
  orderId?: string | null;
  attemptNumber?: number | null;
}): string[] {
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  };
  push(input.orderNsu);
  if (input.orderId && input.attemptNumber != null) {
    push(buildInfinitePayOrderNsu(input.orderId, input.attemptNumber));
  }
  push(input.orderId);
  return out;
}
