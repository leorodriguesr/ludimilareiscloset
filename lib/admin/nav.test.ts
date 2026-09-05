import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessAdminSection, visibleAdminNavGroups } from "./nav";

describe("visibleAdminNavGroups", () => {
  it("mostra vitrine e loja para o admin", () => {
    const titles = visibleAdminNavGroups("ADMIN").map((group) => group.title);
    assert.deepEqual(titles, ["Operação", "Vitrine", "Loja"]);
  });

  it("esconde vitrine e loja do gestor", () => {
    const titles = visibleAdminNavGroups("GESTOR").map((group) => group.title);
    assert.deepEqual(titles, ["Operação"]);
  });

  it("esconde trocas da operação do gestor", () => {
    const operacao = visibleAdminNavGroups("GESTOR")[0];
    assert.ok(operacao.items.every((item) => item.id !== "exchanges"));
  });
});

describe("canAccessAdminSection", () => {
  it("bloqueia configurações e usuários para o gestor", () => {
    assert.equal(canAccessAdminSection("GESTOR", "settings"), false);
    assert.equal(canAccessAdminSection("GESTOR", "users"), false);
    assert.equal(canAccessAdminSection("GESTOR", "banner"), false);
    assert.equal(canAccessAdminSection("ADMIN", "settings"), true);
    assert.equal(canAccessAdminSection("GESTOR", "exchanges"), false);
    assert.equal(canAccessAdminSection("ADMIN", "exchanges"), true);
  });
});
