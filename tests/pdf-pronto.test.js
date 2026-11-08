import { test } from "node:test";
import assert from "node:assert/strict";
import { criarPdfPronto } from "../views/detalhe.js";

test("se o número oficial chega durante a geração, o PDF é gerado de novo", async () => {
  let atual = { id: "v1", numero: null };
  const gerados = [];
  const gerar = async (v) => {
    gerados.push(v.numero);
    if (gerados.length === 1) atual = { ...atual, numero: "VIS-000001" }; // chegou durante a geração
    await new Promise((r) => setTimeout(r, 5));
    return { nomeArquivo: "x.pdf", numero: v.numero };
  };
  const p = criarPdfPronto({ gerar, atual: () => atual });
  await p.preparar();
  assert.deepEqual(gerados, [null, "VIS-000001"]);
  assert.equal(p.obter().numero, "VIS-000001");
});
