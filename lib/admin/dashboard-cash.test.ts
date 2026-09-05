import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeDashboardCashNet,
  computeDashboardOperatingNet,
  omitDashboardCashFields,
  shouldCountStoreShippingCost,
} from "./dashboard-cash";

describe("computeDashboardCashNet", () => {
  it("calcula todas as entradas menos todas as saídas do ledger", () => {
    assert.equal(
      computeDashboardCashNet({
        cashInTotal: 408,
        cashOutTotal: 50,
      }),
      358
    );
  });

  it("inclui no período uma saída de cancelamento de pedido antigo", () => {
    assert.equal(
      computeDashboardCashNet({
        cashInTotal: 0,
        cashOutTotal: 320,
      }),
      -320
    );
  });

  it("separa o custo de frete do caixa registrado", () => {
    assert.equal(
      computeDashboardOperatingNet({
        cashNet: 358,
        storeShippingCost: 14.42,
      }),
      343.58
    );
  });
});

describe("shouldCountStoreShippingCost", () => {
  const periodStart = new Date("2026-09-01T00:00:00.000Z");
  const periodEnd = new Date("2026-09-30T23:59:59.999Z");

  it("conta etiqueta gerada no período mesmo com troca cancelada", () => {
    assert.equal(
      shouldCountStoreShippingCost({
        paidBy: "STORE",
        cost: 18.9,
        labelGeneratedAt: new Date("2026-09-10T12:00:00.000Z"),
        createdAt: new Date("2026-08-20T12:00:00.000Z"),
        exchangeCancelled: true,
        periodStart,
        periodEnd,
      }),
      true
    );
  });

  it("ignora cotação sem etiqueta de troca cancelada", () => {
    assert.equal(
      shouldCountStoreShippingCost({
        paidBy: "STORE",
        cost: 18.9,
        labelGeneratedAt: null,
        createdAt: new Date("2026-09-10T12:00:00.000Z"),
        exchangeCancelled: true,
        periodStart,
        periodEnd,
      }),
      false
    );
  });
});

describe("omitDashboardCashFields", () => {
  it("remove o caixa líquido e deixa as vendas", () => {
    const visible = omitDashboardCashFields({
      paidCount: 4,
      cashNet: 120,
      cashInTotal: 200,
      cashOutTotal: 80,
      operatingNet: 100,
    });
    assert.equal(visible.paidCount, 4);
    assert.equal("cashNet" in visible, false);
    assert.equal("operatingNet" in visible, false);
  });
});
