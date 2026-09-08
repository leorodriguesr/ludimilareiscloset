import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  exchangeOutboundMatchesFilter,
  exchangeOutboundMatchesSearch,
  mapExchangeOutboundListStatus,
  resolveExchangeOutboundListPaidAt,
  sliceMergedShipmentPage,
} from "./outbound-shipment-list";

describe("mapExchangeOutboundListStatus", () => {
  it("starts unlabeled re-ships as to_pack", () => {
    assert.equal(mapExchangeOutboundListStatus("pending"), "to_pack");
    assert.equal(mapExchangeOutboundListStatus("labeled"), "to_pack");
    assert.equal(mapExchangeOutboundListStatus("to_pack"), "to_pack");
  });

  it("keeps later packing statuses", () => {
    assert.equal(mapExchangeOutboundListStatus("packed"), "packed");
    assert.equal(mapExchangeOutboundListStatus("posted"), "shipped");
    assert.equal(mapExchangeOutboundListStatus("shipped"), "shipped");
    assert.equal(mapExchangeOutboundListStatus("delivered"), "delivered");
    assert.equal(mapExchangeOutboundListStatus("cancelled"), "cancelled");
  });
});

describe("exchangeOutboundMatchesFilter", () => {
  it("puts carrier without label in needs_label", () => {
    assert.equal(
      exchangeOutboundMatchesFilter({
        shippingStatus: "to_pack",
        labelUrl: null,
        fulfillmentType: "CARRIER",
        filter: "needs_label",
      }),
      true
    );
  });

  it("keeps unlabeled carrier in to_pack", () => {
    assert.equal(
      exchangeOutboundMatchesFilter({
        shippingStatus: "pending",
        labelUrl: null,
        fulfillmentType: "CARRIER",
        filter: "to_pack",
      }),
      true
    );
  });

  it("keeps completed exchanges in delivered and hides cancelled from the main list", () => {
    assert.equal(
      exchangeOutboundMatchesFilter({
        shippingStatus: "delivered",
        labelUrl: "https://label",
        fulfillmentType: "CARRIER",
        exchangeStatus: "COMPLETED",
        filter: "delivered",
      }),
      true
    );
    assert.equal(
      exchangeOutboundMatchesFilter({
        shippingStatus: "cancelled",
        labelUrl: null,
        fulfillmentType: "CARRIER",
        exchangeStatus: "CANCELLED",
        filter: null,
      }),
      false
    );
    assert.equal(
      exchangeOutboundMatchesFilter({
        shippingStatus: "cancelled",
        labelUrl: null,
        fulfillmentType: "CARRIER",
        exchangeStatus: "CANCELLED",
        filter: "cancelled",
      }),
      true
    );
    assert.equal(
      exchangeOutboundMatchesFilter({
        shippingStatus: "to_pack",
        labelUrl: null,
        fulfillmentType: "CARRIER",
        exchangeStatus: "CANCELLED",
        filter: "cancelled",
      }),
      true
    );
  });
});

describe("resolveExchangeOutboundListPaidAt", () => {
  it("prefers the exchange payment date over shipping creation", () => {
    const createdAt = new Date("2026-09-01T12:00:00.000Z");
    const balancePaidAt = new Date("2026-09-08T15:00:00.000Z");
    assert.equal(
      resolveExchangeOutboundListPaidAt({
        balancePaidAt,
        outboundDefinedAt: new Date("2026-09-07T12:00:00.000Z"),
        inspectedAt: new Date("2026-09-06T12:00:00.000Z"),
        createdAt,
      }).toISOString(),
      balancePaidAt.toISOString()
    );
  });

  it("falls back to outbound definition when there was no extra payment", () => {
    const outboundDefinedAt = new Date("2026-09-07T12:00:00.000Z");
    assert.equal(
      resolveExchangeOutboundListPaidAt({
        balancePaidAt: null,
        outboundDefinedAt,
        inspectedAt: new Date("2026-09-06T12:00:00.000Z"),
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
      }).toISOString(),
      outboundDefinedAt.toISOString()
    );
  });
});

describe("exchangeOutboundMatchesSearch", () => {
  it("matches exchange number and TROCA", () => {
    const row = {
      exchangeNumber: 12,
      recipientName: "Maria",
      email: "maria@example.com",
      trackingCode: null,
    };
    assert.equal(exchangeOutboundMatchesSearch(row, "12"), true);
    assert.equal(exchangeOutboundMatchesSearch(row, "troca"), true);
    assert.equal(exchangeOutboundMatchesSearch(row, "Maria"), true);
    assert.equal(exchangeOutboundMatchesSearch(row, "99"), false);
  });
});

describe("sliceMergedShipmentPage", () => {
  it("interleaves exchanges with sales by date", () => {
    const orders = [
      { id: "o1", sortAt: 300 },
      { id: "o2", sortAt: 100 },
    ];
    const exchanges = [{ id: "e1", sortAt: 200 }];
    assert.deepEqual(
      sliceMergedShipmentPage(orders, exchanges, 0, 2).map((row) => row.id),
      ["o1", "e1"]
    );
    assert.deepEqual(
      sliceMergedShipmentPage(orders, exchanges, 2, 2).map((row) => row.id),
      ["o2"]
    );
  });
});
