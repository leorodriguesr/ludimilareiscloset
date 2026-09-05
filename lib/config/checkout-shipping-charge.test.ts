import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCheckoutShippingCharge } from "./checkout-shipping-charge";

const options = [
  { id: "cheap", price: 12.9 },
  { id: "fast", price: 28.5 },
];

describe("resolveCheckoutShippingCharge", () => {
  it("cobra a cotação escolhida quando não há frete grátis", () => {
    assert.equal(
      resolveCheckoutShippingCharge({
        quotedPrice: 28.5,
        chosenOptionId: "fast",
        options,
        cartSubtotal: 80,
        settings: {
          freeShippingEnabled: false,
          freeShippingType: "minimum_value",
          freeShippingMinValue: 200,
        },
      }),
      28.5
    );
  });

  it("zera só a opção mais barata quando o carrinho atinge o mínimo", () => {
    assert.equal(
      resolveCheckoutShippingCharge({
        quotedPrice: 12.9,
        chosenOptionId: "cheap",
        options,
        cartSubtotal: 220,
        settings: {
          freeShippingEnabled: true,
          freeShippingType: "minimum_value",
          freeShippingMinValue: 200,
        },
      }),
      0
    );
    assert.equal(
      resolveCheckoutShippingCharge({
        quotedPrice: 28.5,
        chosenOptionId: "fast",
        options,
        cartSubtotal: 220,
        settings: {
          freeShippingEnabled: true,
          freeShippingType: "minimum_value",
          freeShippingMinValue: 200,
        },
      }),
      28.5
    );
  });
});
