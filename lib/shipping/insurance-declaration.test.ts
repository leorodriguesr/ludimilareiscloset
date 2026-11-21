import assert from "node:assert/strict";
import test from "node:test";
import {
  declaredProductsTotal,
  declaredUnitValue,
  insuranceMatchingDeclaration,
} from "@/lib/shipping/insurance";

test("brinde com preço 0 vira valor monetário mínimo", () => {
  assert.equal(declaredUnitValue(0), 0.01);
  assert.equal(declaredUnitValue(-5), 0.01);
  assert.equal(declaredUnitValue(318), 318);
});

test("Loggi usa o seguro igual à soma declarada, inclusive o brinde", () => {
  const products = [
    { unitary_value: declaredUnitValue(318), quantity: 1 },
    { unitary_value: declaredUnitValue(0), quantity: 1 },
  ];
  const declared = declaredProductsTotal(products);
  assert.equal(declared, 318.01);
  assert.equal(insuranceMatchingDeclaration(31, declared, 318), 318.01);
});

test("serviço sem seguro exato preserva o valor pedido quando ele cobre a declaração", () => {
  assert.equal(insuranceMatchingDeclaration(1, 100, 120), 120);
});
