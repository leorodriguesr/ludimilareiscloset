import assert from "node:assert/strict";
import test from "node:test";
import { isLocalViaCepResponse } from "@/lib/shipping/local-delivery";

test("aceita Goiânia e Aparecida de Goiânia pelo código IBGE", () => {
  assert.equal(
    isLocalViaCepResponse({
      uf: "GO",
      localidade: "Goiânia",
      ibge: "5208707",
    }),
    true
  );
  assert.equal(
    isLocalViaCepResponse({
      uf: "GO",
      localidade: "Aparecida de Goiânia",
      ibge: "5201405",
    }),
    true
  );
});

test("não confia somente no nome da cidade fora de Goiás", () => {
  assert.equal(
    isLocalViaCepResponse({
      uf: "SP",
      localidade: "Goiânia",
      ibge: "9999999",
    }),
    false
  );
  assert.equal(
    isLocalViaCepResponse({
      erro: true,
      uf: "GO",
      localidade: "Goiânia",
      ibge: "5208707",
    }),
    false
  );
});
