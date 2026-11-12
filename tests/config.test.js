import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../config.js";

test("checklist tem os 13 itens na ordem da spec", () => {
  assert.deepEqual(c.CHECKLIST_ITENS, ["Antena", "Calotas", "Manual do proprietário", "Triângulo", "Equipamento de som",
    "Estepe/Kit", "Bateria", "Documento", "Macaco", "Chave de roda", "Extintor", "Tapetes", "Carregador"]);
});

test("listas de avaria e combustível", () => {
  assert.equal(c.AREAS_AVARIA.length, 20);
  assert.equal(c.AREAS_AVARIA.at(-1), "Outro");
  assert.equal(c.TIPOS_AVARIA.length, 10);
  assert.deepEqual(c.COMBUSTIVEIS, ["Gasolina", "Flex", "Diesel", "Elétrico", "Híbrido"]);
  assert.deepEqual(c.GRAVIDADES.map((g) => g.valor), ["Leve", "Moderada", "Grave"]);
  assert.deepEqual(c.FOTOS_VEICULO.map((f) => f.chave), ["frente", "traseira", "chassi"]);
  assert.deepEqual(c.FOTO, { maxLado: 1280, qualidade: 0.7, miniLado: 320 });
});

test("lojas em ordem alfabética pela marca (sem o 'PG Prime'), sem repetição, com a Funilaria Natal", () => {
  const chave = (l) => l.replace(/^PG Prime /, "");
  const ordenadas = [...c.LOJAS].sort((a, b) => chave(a).localeCompare(chave(b), "pt-BR"));
  assert.deepEqual(c.LOJAS, ordenadas);
  assert.equal(new Set(c.LOJAS).size, c.LOJAS.length);
  assert.ok(c.LOJAS.includes("Funilaria Natal"));
  assert.equal(c.LOJAS.length, 12);
});
