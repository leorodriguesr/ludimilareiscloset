import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCheckoutPaymentLinkWithinDeadline } from "./payment-link-expiry";

const now = new Date("2026-09-05T17:00:00.000Z");

describe("isCheckoutPaymentLinkWithinDeadline", () => {
  it("aceita checkout antes do vencimento", () => {
    assert.equal(
      isCheckoutPaymentLinkWithinDeadline({
        orderSource: "CHECKOUT",
        expiresAt: new Date("2026-09-05T18:00:00.000Z"),
        now,
      }),
      true
    );
  });

  it("bloqueia checkout vencido ou sem prazo", () => {
    assert.equal(
      isCheckoutPaymentLinkWithinDeadline({
        orderSource: "CHECKOUT",
        expiresAt: new Date("2026-09-05T16:00:00.000Z"),
        now,
      }),
      false
    );
    assert.equal(
      isCheckoutPaymentLinkWithinDeadline({
        orderSource: "CHECKOUT",
        expiresAt: null,
        now,
      }),
      false
    );
  });

  it("preserva a regra existente da venda avulsa", () => {
    assert.equal(
      isCheckoutPaymentLinkWithinDeadline({
        orderSource: "ADMIN_SALE",
        expiresAt: new Date("2026-09-05T16:00:00.000Z"),
        now,
      }),
      true
    );
  });
});
