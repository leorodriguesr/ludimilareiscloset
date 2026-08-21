/** Status da Order (intenção de compra). */
export const ORDER_STATUS = {
  PENDING_PAYMENT: "pending_payment",
  PAID: "paid",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** Status da tentativa de pagamento. */
export const PAYMENT_ATTEMPT_STATUS = {
  CREATED: "created",
  ACTIVE: "active",
  FAILED: "failed",
  SUPERSEDED: "superseded",
  EXPIRED: "expired",
  PAID: "paid",
} as const;

export type PaymentAttemptStatus =
  (typeof PAYMENT_ATTEMPT_STATUS)[keyof typeof PAYMENT_ATTEMPT_STATUS];

export const PAYMENT_METHOD = {
  PIX: "pix",
  CARD: "card",
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const PAYMENT_GATEWAY = {
  MERCADOPAGO: "mercadopago",
  INFINITEPAY: "infinitepay",
} as const;

export type PaymentGateway =
  (typeof PAYMENT_GATEWAY)[keyof typeof PAYMENT_GATEWAY];

export const ORDER_ITEM_PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
} as const;

export const ORDER_CHARGE_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  CANCELLED: "cancelled",
} as const;

export const ORDER_CHARGE_REASON = {
  INITIAL: "initial",
  ADDON: "addon",
} as const;

export const ORDER_CHARGE_PURPOSE = "order_charge";

/** Tempo de vida de uma Order pendente. Reinicia se o admin reabrir uma cancelada. */
export const ORDER_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
