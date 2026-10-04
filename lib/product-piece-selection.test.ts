import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maxPurchasableQuantity } from "./product-piece-selection";

const pieces = [
  {
    id: "piece-1",
    name: "Calça",
    variants: [
      { quantity: 0, unlimited: true, color: { name: "Verde" }, size: { name: "M" } },
      { quantity: 0, unlimited: true, color: { name: "Verde" }, size: { name: "G" } },
      { quantity: 0, unlimited: true, color: { name: "Vermelho" }, size: { name: "M" } },
      { quantity: 1, unlimited: false, color: { name: "Vermelho" }, size: { name: "G" } },
    ],
  },
];

describe("maxPurchasableQuantity", () => {
  it("não usa a soma do produto quando a combinação é ilimitada", () => {
    const available = maxPurchasableQuantity({
      stockType: "LIMITED",
      stockQuantity: 1,
      pieces,
      selections: { "piece-1": { color: "Verde", size: "M" } },
    });
    assert.equal(available, Number.POSITIVE_INFINITY);
  });

  it("limita a combinação com estoque finito", () => {
    const available = maxPurchasableQuantity({
      stockType: "LIMITED",
      stockQuantity: 1,
      pieces,
      cartSelections: [{ pieceName: "Calça", color: "Vermelho", size: "G" }],
    });
    assert.equal(available, 1);
  });

  it("antes da seleção, produto misto não fica preso na quantidade limitada", () => {
    const available = maxPurchasableQuantity({
      stockType: "LIMITED",
      stockQuantity: 1,
      pieces,
      selections: { "piece-1": { color: null, size: null } },
    });
    assert.equal(available, Number.POSITIVE_INFINITY);
  });
});
