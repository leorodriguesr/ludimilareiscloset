import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  META_CUSTOMER_LIST_HEADER,
  buildMetaCustomerListCsv,
  type MetaCustomerOrder,
} from "./meta-customer-list";

function order(overrides: Partial<MetaCustomerOrder> = {}): MetaCustomerOrder {
  return {
    userId: null,
    email: null,
    userEmail: null,
    phone: "62999998888",
    conversationPhone: null,
    userPhone: null,
    recipientName: "Ana Silva",
    userName: null,
    cep: "74210010",
    city: "Goiânia",
    state: "Goiás",
    total: 200,
    paidAt: new Date("2026-11-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("buildMetaCustomerListCsv", () => {
  it("usa o cabeçalho do arquivo de exemplo da Meta", () => {
    const { csv } = buildMetaCustomerListCsv([order()]);
    assert.equal(csv.split("\n")[0], META_CUSTOMER_LIST_HEADER);
  });

  it("junta compras da mesma cliente e soma o valor", () => {
    const { csv, customers } = buildMetaCustomerListCsv([
      order({ total: 200, paidAt: new Date("2026-10-01T12:00:00.000Z") }),
      order({
        phone: "+55 (62) 99999-8888",
        total: 250.5,
        city: "Aparecida de Goiânia",
        paidAt: new Date("2026-11-02T12:00:00.000Z"),
      }),
    ]);
    assert.equal(customers, 1);
    const line = csv.trim().split("\n")[1];
    assert.match(line, /\+55 62 99999-8888/);
    assert.match(line, /,450\.5$/);
    assert.match(line, /,Ana,Silva,/);
    assert.match(line, /,74210-010,Aparecida de Goiania,GO,BR,/);
  });

  it("une pedidos da mesma conta mesmo com telefones diferentes", () => {
    const { customers, csv } = buildMetaCustomerListCsv([
      order({ userId: "user-1", phone: "62999998888", total: 100 }),
      order({
        userId: "user-1",
        phone: "11988887777",
        recipientName: "Ana Souza",
        total: 80,
        paidAt: new Date("2026-11-10T12:00:00.000Z"),
      }),
    ]);
    assert.equal(customers, 1);
    assert.match(csv, /\+55 11 98888-7777/);
    assert.match(csv, /\+55 62 99999-8888/);
    assert.match(csv, /,180\n$/);
  });

  it("ignora e-mail interno e pedido sem contato", () => {
    const { customers } = buildMetaCustomerListCsv([
      order({
        phone: null,
        email: "ana@venda-avulsa.local",
        recipientName: "Sem contato",
      }),
      order({ phone: "123", email: null, recipientName: "Curto" }),
    ]);
    assert.equal(customers, 0);
  });

  it("coloca até três telefones e aspas quando o nome tem vírgula removida", () => {
    const { csv } = buildMetaCustomerListCsv([
      order({
        phone: "62911112222",
        conversationPhone: "62922223333",
        userPhone: "62933334444",
        email: "Ana@Email.com",
        userEmail: "outra@email.com",
      }),
    ]);
    const line = csv.trim().split("\n")[1];
    assert.match(line, /^ana@email.com,outra@email.com,,/);
    assert.equal(
      line.split(",").filter((part) => part.startsWith("+55")).length,
      3
    );
  });
});
