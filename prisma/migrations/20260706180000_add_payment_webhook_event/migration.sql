-- Fase 5: auditoria de webhooks de pagamento

CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gateway" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "orderId" TEXT,
    "paymentAttemptId" TEXT,
    "gatewayReference" TEXT,
    "reason" TEXT,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PaymentWebhookEvent_orderId_idx" ON "PaymentWebhookEvent"("orderId");
CREATE INDEX "PaymentWebhookEvent_outcome_idx" ON "PaymentWebhookEvent"("outcome");
CREATE INDEX "PaymentWebhookEvent_createdAt_idx" ON "PaymentWebhookEvent"("createdAt");
