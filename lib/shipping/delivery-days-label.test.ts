import assert from "node:assert/strict";
import test from "node:test";
import {
  formatEstimatedDeliveryLabel,
  withRestockLeadDays,
} from "@/lib/shipping/delivery-days-label";

test("soma os dias de reposição ao intervalo da transportadora", () => {
  const adjusted = withRestockLeadDays(3, 4, 4);
  assert.deepEqual(adjusted, { min: 7, max: 8 });
  assert.equal(formatEstimatedDeliveryLabel(adjusted.min, adjusted.max), "7 a 8 dias úteis");
});

test("não altera prazo quando não há reposição", () => {
  assert.deepEqual(withRestockLeadDays(2, 3, 0), { min: 2, max: 3 });
});
