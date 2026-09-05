import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canCompleteExchangeWithOutbound } from "./outbound-complete";

describe("canCompleteExchangeWithOutbound", () => {
  it("permite concluir sem itens de saída", () => {
    assert.equal(
      canCompleteExchangeWithOutbound({
        hasOutboundItems: false,
        outboundShippings: [],
      }),
      true
    );
  });

  it("bloqueia transporte sem postagem", () => {
    assert.equal(
      canCompleteExchangeWithOutbound({
        hasOutboundItems: true,
        outboundShippings: [{ method: "CARRIER", shippingStatus: "labeled" }],
      }),
      false
    );
  });

  it("libera transportadora depois de postada", () => {
    assert.equal(
      canCompleteExchangeWithOutbound({
        hasOutboundItems: true,
        outboundShippings: [{ method: "CARRIER", shippingStatus: "posted" }],
      }),
      true
    );
  });

  it("bloqueia retirada/moto boy apenas embalado", () => {
    assert.equal(
      canCompleteExchangeWithOutbound({
        hasOutboundItems: true,
        outboundShippings: [{ method: "STORE_PICKUP", shippingStatus: "packed" }],
      }),
      false
    );
  });

  it("aceita retirada/moto boy depois da entrega", () => {
    assert.equal(
      canCompleteExchangeWithOutbound({
        hasOutboundItems: true,
        outboundShippings: [
          { method: "LOCAL_COURIER", shippingStatus: "delivered" },
        ],
      }),
      true
    );
  });
});
