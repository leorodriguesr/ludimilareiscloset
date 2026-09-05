import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cashLedgerIdempotencyKey,
  orderCancellationLedgerKey,
  orderReactivationLedgerKey,
} from "./idempotency";

describe("cashLedgerIdempotencyKey", () => {
  it("usa a mesma chave para a mesma troca", () => {
    assert.equal(
      cashLedgerIdempotencyKey("exchange-balance", "ex_1"),
      cashLedgerIdempotencyKey("exchange-balance", "ex_1")
    );
    assert.equal(
      cashLedgerIdempotencyKey("exchange-refund", "ex_1"),
      "exchange-refund:ex_1"
    );
  });

  it("separa cobrança e reembolso", () => {
    assert.notEqual(
      cashLedgerIdempotencyKey("exchange-balance", "ex_1"),
      cashLedgerIdempotencyKey("exchange-refund", "ex_1")
    );
  });

  it("separa vendas por tentativa", () => {
    assert.notEqual(
      cashLedgerIdempotencyKey("sale", "att_1"),
      cashLedgerIdempotencyKey("sale", "att_2")
    );
  });

  it("separa ciclos de cancelamento e reativação do mesmo pedido", () => {
    const firstPaidAt = new Date("2026-09-01T12:00:00.000Z");
    const secondPaidAt = new Date("2026-09-05T12:00:00.000Z");
    const firstCancelledAt = new Date("2026-09-02T12:00:00.000Z");
    const secondCancelledAt = new Date("2026-09-06T12:00:00.000Z");

    assert.notEqual(
      orderCancellationLedgerKey("order_1", firstPaidAt),
      orderCancellationLedgerKey("order_1", secondPaidAt)
    );
    assert.notEqual(
      orderReactivationLedgerKey("order_1", firstCancelledAt),
      orderReactivationLedgerKey("order_1", secondCancelledAt)
    );
  });
});
