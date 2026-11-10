import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWhatsAppAdReport,
  type WhatsAppAdClickRow,
} from "./whatsapp-ad-report";

const now = new Date("2026-11-10T18:00:00.000Z");

function row(overrides: Partial<WhatsAppAdClickRow>): WhatsAppAdClickRow {
  return {
    id: "click-1",
    phoneKey: "5562982181924",
    clickedAt: new Date("2026-11-09T15:00:00.000Z"),
    sourceId: "ad-1",
    sourceUrl: null,
    headline: "Vestido novo",
    bodyText: null,
    adName: null,
    adsetName: null,
    campaignId: null,
    campaignName: "Closet novembro",
    status: "AVAILABLE",
    sentAt: null,
    order: null,
    ...overrides,
  };
}

describe("buildWhatsAppAdReport", () => {
  it("separa venda, janela aberta e anúncio que mais faturou", () => {
    const report = buildWhatsAppAdReport({
      from: "2026-11-01",
      to: "2026-11-10",
      now,
      rows: [
        row({
          id: "sold",
          status: "USED",
          sentAt: now,
          order: {
            id: "order-1",
            orderNumber: 42,
            total: 200,
            paidAt: new Date("2026-11-09T18:00:00.000Z"),
            status: "paid",
            recipientName: "Ana",
          },
        }),
        row({
          id: "open",
          phoneKey: "5562999990000",
          sourceId: "ad-2",
          headline: "Outro anúncio",
          campaignName: null,
          clickedAt: new Date("2026-11-10T12:00:00.000Z"),
        }),
        row({
          id: "second-sale",
          sourceId: "ad-1",
          status: "USED",
          order: {
            id: "order-2",
            orderNumber: 43,
            total: 50,
            paidAt: new Date("2026-11-10T12:00:00.000Z"),
            status: "paid",
            recipientName: "Bia",
          },
        }),
      ],
    });

    assert.equal(report.conversations, 3);
    assert.equal(report.sales, 2);
    assert.equal(report.revenue, 250);
    assert.equal(report.openWindow, 1);
    assert.equal(report.rankings[0]?.adLabel, "Vestido novo");
    assert.equal(report.rankings[0]?.revenue, 250);
    assert.equal(report.rankings[0]?.sales, 2);
    assert.match(report.insight, /Vestido novo trouxe 100%/);
    const sold = report.recent.find((item) => item.orderNumber === 42);
    assert.equal(sold?.phone, "(62) 98218-1924");
    assert.equal(sold?.hoursToSale, 3);
  });
});
