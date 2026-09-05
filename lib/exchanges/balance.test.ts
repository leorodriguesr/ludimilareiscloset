import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeExchangeBalance } from "./balance";

describe("computeExchangeBalance", () => {
  it("upgrade cobra a diferença de produto", () => {
    const balance = computeExchangeBalance({
      returnedItemsTotal: 150,
      newItemsTotal: 220,
      shippings: [],
    });
    assert.equal(balance.productsDelta, 70);
    assert.equal(balance.balanceAmount, 70);
    assert.equal(balance.balanceStatus, "PENDING");
  });

  it("downgrade gera crédito", () => {
    const balance = computeExchangeBalance({
      returnedItemsTotal: 200,
      newItemsTotal: 150,
      shippings: [],
    });
    assert.equal(balance.productsDelta, -50);
    assert.equal(balance.balanceAmount, -50);
    assert.equal(balance.balanceStatus, "CREDIT_PENDING");
  });

  it("mesma peça + venda adicional cobra só o extra e o frete da cliente", () => {
    const balance = computeExchangeBalance({
      returnedItemsTotal: 150,
      newItemsTotal: 230,
      samePieceSwap: true,
      additionalItemsTotal: 80,
      shippings: [{ quotedPrice: 18, paidBy: "CUSTOMER" }],
    });
    assert.equal(balance.productsDelta, 80);
    assert.equal(balance.shippingCustomerTotal, 18);
    assert.equal(balance.balanceAmount, 98);
    assert.equal(balance.balanceStatus, "PENDING");
  });

  it("frete pago pela loja não entra no saldo", () => {
    const balance = computeExchangeBalance({
      returnedItemsTotal: 100,
      newItemsTotal: 100,
      shippings: [{ quotedPrice: 24.48, paidBy: "STORE" }],
    });
    assert.equal(balance.shippingCustomerTotal, 0);
    assert.equal(balance.balanceAmount, 0);
    assert.equal(balance.balanceStatus, "NONE");
  });

  it("ajuste manual entra no saldo", () => {
    const balance = computeExchangeBalance({
      returnedItemsTotal: 100,
      newItemsTotal: 100,
      adjustmentAmount: -10,
      shippings: [],
    });
    assert.equal(balance.balanceAmount, -10);
    assert.equal(balance.balanceStatus, "CREDIT_PENDING");
  });
});
