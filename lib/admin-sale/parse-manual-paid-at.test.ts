import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseManualPaidAtDate,
  saoPauloCalendarDate,
} from "./parse-manual-paid-at";

const now = new Date("2026-09-08T12:00:00.000-03:00");

describe("parseManualPaidAtDate", () => {
  it("grava o dia escolhido em São Paulo", () => {
    const paidAt = parseManualPaidAtDate("2026-09-01", now);
    assert.ok(paidAt);
    assert.equal(saoPauloCalendarDate(paidAt), "2026-09-01");
  });

  it("rejeita data futura e formato inválido", () => {
    assert.equal(parseManualPaidAtDate("2026-09-09", now), null);
    assert.equal(parseManualPaidAtDate("08/09/2026", now), null);
  });
});
