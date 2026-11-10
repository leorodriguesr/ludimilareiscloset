import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { whatsappPurchaseBody, type WhatsAppPurchaseEvent } from "./capi";
import { brPhoneKeys, canonicalPhoneKeys } from "./phone-keys";
import { decideWhatsAppPurchase, type WhatsAppClickCandidate } from "./purchase-match";
import {
  parseWhatsAppAdReferrals,
  whatsappSignatureValid,
} from "./whatsapp-referral";

const now = new Date("2026-11-10T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;

function click(overrides: Partial<WhatsAppClickCandidate>): WhatsAppClickCandidate {
  return {
    id: "click-1",
    ctwaClid: "clid-1",
    clickedAt: new Date(now.getTime() - day),
    status: "AVAILABLE",
    orderId: null,
    sentAt: null,
    ...overrides,
  };
}

describe("brPhoneKeys", () => {
  it("casa o número com e sem o nono dígito e o DDI", () => {
    const fromWhatsapp = brPhoneKeys("5562982181924");
    const fromOrder = brPhoneKeys("(62) 98218-1924");
    const withoutNine = brPhoneKeys("6282181924");
    assert.deepEqual(fromWhatsapp, fromOrder);
    assert.ok(fromWhatsapp.includes("5562982181924"));
    assert.ok(withoutNine.includes("5562982181924"));
  });

  it("não inventa nono dígito em telefone fixo", () => {
    assert.deepEqual(brPhoneKeys("6232145678"), ["556232145678"]);
    assert.equal(canonicalPhoneKeys("oi"), null);
  });
});

describe("decideWhatsAppPurchase", () => {
  it("escolhe o clique mais recente dentro de 7 dias", () => {
    const decision = decideWhatsAppPurchase(
      [
        click({ id: "old", ctwaClid: "old", clickedAt: new Date(now.getTime() - 2 * day) }),
        click({ id: "new", ctwaClid: "new", clickedAt: new Date(now.getTime() - day) }),
      ],
      "order-1",
      now
    );
    assert.equal(decision.action, "claim");
    if (decision.action === "claim") assert.equal(decision.click.id, "new");
  });

  it("ignora clique usado e clique fora da janela", () => {
    const decision = decideWhatsAppPurchase(
      [
        click({ status: "USED", orderId: "order-antiga" }),
        click({
          id: "expired",
          ctwaClid: "expired",
          clickedAt: new Date(now.getTime() - 8 * day),
        }),
      ],
      "order-2",
      now
    );
    assert.equal(decision.action, "skip");
  });

  it("não reenvia a compra que já foi para a Meta", () => {
    const decision = decideWhatsAppPurchase(
      [click({ status: "USED", orderId: "order-1", sentAt: now })],
      "order-1",
      now
    );
    assert.equal(decision.action, "skip");
  });

  it("tenta de novo o mesmo clique se o envio falhou", () => {
    const decision = decideWhatsAppPurchase(
      [click({ status: "USED", orderId: "order-1", sentAt: null })],
      "order-1",
      now
    );
    assert.equal(decision.action, "retry");
  });
});

describe("parseWhatsAppAdReferrals", () => {
  it("lê o ctwa_clid da mensagem vinda do anúncio", () => {
    const referrals = parseWhatsAppAdReferrals({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "5562982181924",
                    timestamp: "1762700000",
                    text: { body: "oi" },
                    referral: {
                      source_type: "ad",
                      source_id: "ad-1",
                      source_url: "https://fb.me/abc",
                      ctwa_clid: "clid-abc",
                    },
                  },
                  { from: "5562982181924", timestamp: "1762700001", type: "text" },
                ],
              },
            },
          ],
        },
      ],
    });
    assert.equal(referrals.length, 1);
    assert.equal(referrals[0]?.ctwaClid, "clid-abc");
    assert.equal(referrals[0]?.waId, "5562982181924");
    assert.equal(referrals[0]?.sourceId, "ad-1");
  });
});

describe("whatsappSignatureValid", () => {
  it("aceita a assinatura da Meta e rejeita corpo alterado", () => {
    const body = '{"object":"whatsapp_business_account"}';
    const secret = "app-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    assert.equal(whatsappSignatureValid(body, signature, secret), true);
    assert.equal(whatsappSignatureValid(`${body} `, signature, secret), false);
  });
});

describe("whatsappPurchaseBody", () => {
  it("monta o Purchase preso ao ctwa_clid", () => {
    const event: WhatsAppPurchaseEvent = {
      ctwaClid: "clid-abc",
      eventId: "wa-purchase-order-1",
      eventTime: now,
      value: 189.9,
    };
    const body = whatsappPurchaseBody(event, {
      datasetId: "dataset",
      accessToken: "token",
      wabaId: "waba",
      graphVersion: "v23.0",
      testEventCode: null,
    });
    const data = body.data as Array<Record<string, unknown>>;
    assert.equal(data[0]?.event_name, "Purchase");
    assert.equal(data[0]?.action_source, "business_messaging");
    assert.equal(data[0]?.messaging_channel, "whatsapp");
    assert.deepEqual(data[0]?.user_data, {
      whatsapp_business_account_id: "waba",
      ctwa_clid: "clid-abc",
    });
    assert.deepEqual(data[0]?.custom_data, { currency: "BRL", value: 189.9 });
  });
});
