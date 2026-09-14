import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReshipCards,
  groupSelectedReshipUnits,
  unavailableReshipUnitKeys,
} from "./availability";

describe("unavailableReshipUnitKeys", () => {
  it("bloqueia unidade já em reenvio ativo", () => {
    const cards = buildReshipCards([
      {
        id: "item-1",
        productId: "p1",
        productName: "Vestido",
        productImageUrl: null,
        quantity: 2,
        price: 100,
        pieceSelectionsJson: JSON.stringify([
          { pieceName: "Única", size: "M", color: "Preto" },
        ]),
      },
    ]);
    const unavailable = unavailableReshipUnitKeys(cards, [
      {
        orderItemId: "item-1",
        quantity: 1,
        pieceSelectionsJson: JSON.stringify([
          { pieceName: "Única", size: "M", color: "Preto" },
        ]),
      },
    ]);
    assert.equal(unavailable.size, 1);
    assert.equal(cards[0]!.units.length, 2);
  });
});

describe("groupSelectedReshipUnits", () => {
  it("agrupa unidades iguais na mesma linha", () => {
    const cards = buildReshipCards([
      {
        id: "item-1",
        productId: "p1",
        productName: "Vestido",
        productImageUrl: null,
        quantity: 2,
        price: 100,
        pieceSelectionsJson: JSON.stringify([
          { pieceName: "Única", size: "M", color: "Preto" },
        ]),
      },
    ]);
    const grouped = groupSelectedReshipUnits(
      cards,
      cards[0]!.units.map((unit) => unit.key)
    );
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]!.quantity, 2);
    assert.equal(grouped[0]!.orderItemId, "item-1");
  });
});
