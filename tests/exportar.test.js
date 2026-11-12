import { test } from "node:test";
import assert from "node:assert/strict";
import { gerarCsv, linhasDeVistorias, dataDoArquivo } from "../exportar.js";

test("CSV: BOM, separador ; e CRLF", () => {
  assert.equal(gerarCsv([["a", "b"], [1, 2]]), "﻿a;b\r\n1;2\r\n");
});

test("CSV: ; aspas e quebra de linha vão entre aspas; aspas internas dobradas", () => {
  assert.equal(gerarCsv([['Disse "oi"; tchau', "linha1\nlinha2", null]]), '﻿"Disse ""oi""; tchau";"linha1\nlinha2";\r\n');
});

test("CSV: texto que parece fórmula não roda no Excel", () => {
  assert.equal(gerarCsv([["=SOMA(A1)", "+55", "-3", "@x", "normal"]]), "﻿'=SOMA(A1);'+55;'-3;'@x;normal\r\n");
});

const VISTORIA = {
  id: "1", numero: "VIS-000010", realizadaEm: new Date(2026, 10, 12, 9, 5).toISOString(), marca: "bmw", modelo: "X1",
  chassi: "AB123C", loja: "PG Prime BMW Natal", status: "sincronizada",
  avarias: [{ gravidade: "Leve" }, { gravidade: "Grave" }],
  recebimento: { status: "divergencia" },
};

test("linhasDeVistorias (painel): Status, sem gravidade", () => {
  const [cab, linha] = linhasDeVistorias([VISTORIA]);
  assert.deepEqual(cab, ["Nº", "Data/Hora", "Marca", "Modelo", "Chassi", "Loja de destino", "Avarias", "Status", "Recebimento"]);
  assert.deepEqual(linha, ["VIS-000010", "12/11/2026 09:05", "BMW", "X1", "AB123C", "PG Prime BMW Natal", 2, "Sincronizada", "Com divergência"]);
});

test("linhasDeVistorias (dashboard): gravidade máxima no lugar do Status", () => {
  const [cab, linha] = linhasDeVistorias([VISTORIA], { painel: false });
  assert.equal(cab[7], "Gravidade máxima");
  assert.equal(linha[7], "Grave");
});

test("linhasDeVistorias: lista do servidor traz só a contagem de avarias", () => {
  const [, linha] = linhasDeVistorias([{ ...VISTORIA, avarias: [], avariasQtd: 3 }]);
  assert.equal(linha[6], 3);
});

test("linhasDeVistorias: sem loja e sem avaria", () => {
  const [, linha] = linhasDeVistorias([{ id: "2", numero: "VIS-000011", realizadaEm: new Date(2026, 0, 2, 8, 0).toISOString(), marca: "Jeep", modelo: "Compass", chassi: "ZZ999Z", loja: "", status: "pendente", avarias: [] }]);
  assert.deepEqual(linha.slice(5), ["Sem loja informada", 0, "Pendente", ""]);
});

test("dataDoArquivo: aaaa-mm-dd", () => {
  assert.equal(dataDoArquivo(new Date(2026, 0, 5)), "2026-01-05");
});
