import { prisma } from "@/lib/prisma";

export const WEBHOOK_AUDIT_OUTCOME = {
  CONFIRMED: "confirmed",
  REJECTED_SUPERSEDED: "rejected_superseded",
  REJECTED_EXPIRED: "rejected_expired",
  REJECTED_AMOUNT: "rejected_amount_mismatch",
  REJECTED_ATTEMPT_STATUS: "rejected_attempt_status",
  REJECTED_ORDER_STATE: "rejected_order_state",
  REJECTED_NOT_FOUND: "rejected_not_found",
  IGNORED_ALREADY_PAID: "ignored_already_paid",
} as const;

export type WebhookAuditOutcome =
  (typeof WEBHOOK_AUDIT_OUTCOME)[keyof typeof WEBHOOK_AUDIT_OUTCOME];

export async function logPaymentWebhookEvent(input: {
  gateway: string;
  source: string;
  outcome: WebhookAuditOutcome;
  orderId?: string | null;
  paymentAttemptId?: string | null;
  gatewayReference?: string | null;
  reason?: string | null;
  payload?: unknown;
}): Promise<void> {
  let payloadJson: string | null = null;
  if (input.payload != null) {
    try {
      payloadJson = JSON.stringify(input.payload).slice(0, 8000);
    } catch {
      payloadJson = null;
    }
  }

  const line = {
    gateway: input.gateway,
    source: input.source,
    outcome: input.outcome,
    orderId: input.orderId ?? null,
    paymentAttemptId: input.paymentAttemptId ?? null,
    gatewayReference: input.gatewayReference ?? null,
    reason: input.reason ?? null,
  };

  if (input.outcome === WEBHOOK_AUDIT_OUTCOME.CONFIRMED) {
    console.info("[payment-webhook]", line);
  } else {
    console.warn("[payment-webhook]", line);
  }

  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        gateway: input.gateway,
        source: input.source,
        outcome: input.outcome,
        orderId: input.orderId ?? null,
        paymentAttemptId: input.paymentAttemptId ?? null,
        gatewayReference: input.gatewayReference ?? null,
        reason: input.reason ?? null,
        payloadJson,
      },
    });
  } catch (e) {
    console.error("[payment-webhook] falha ao gravar auditoria", e, line);
  }
}
