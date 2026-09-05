import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  infinitePayCentsMatchExpectedBRL,
  infinitePayOrderNsuCandidates,
  isVerifiedInfinitePayPayment,
} from "./verify-infinitepay-payment";

describe("infinitePayCentsMatchExpectedBRL", () => {
  it("aceita o valor do pedido em centavos", () => {
    assert.equal(infinitePayCentsMatchExpectedBRL(1554, 15.54), true);
  });

  it("rejeita valor diferente do pedido", () => {
    assert.equal(infinitePayCentsMatchExpectedBRL(18900, 15.54), false);
  });
});

describe("isVerifiedInfinitePayPayment", () => {
  it("exige success, paid e amount do pedido", () => {
    assert.equal(
      isVerifiedInfinitePayPayment({
        check: {
          success: true,
          paid: true,
          amount: 1554,
          paidAmount: 1554,
        },
        expectedAmountBRL: 15.54,
      }),
      true
    );
    assert.equal(
      isVerifiedInfinitePayPayment({
        check: { success: true, paid: false, amount: 1554 },
        expectedAmountBRL: 15.54,
      }),
      false
    );
  });
});

describe("infinitePayOrderNsuCandidates", () => {
  it("inclui nsu com tentativa e o id do pedido", () => {
    assert.deepEqual(
      infinitePayOrderNsuCandidates({
        orderNsu: "abc-att-1",
        orderId: "abc",
        attemptNumber: 1,
      }),
      ["abc-att-1", "abc"]
    );
  });
});
