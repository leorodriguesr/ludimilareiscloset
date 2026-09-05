import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderStockReservationWhere } from "./reservation-scope";

describe("orderStockReservationWhere", () => {
  it("nunca seleciona reservas pertencentes a trocas", () => {
    assert.deepEqual(orderStockReservationWhere("order_1"), {
      orderId: "order_1",
      exchangeId: null,
    });
  });
});
