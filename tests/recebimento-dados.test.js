import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUS_RECEBIMENTO, buscarRecebimentos, contarRecebimentos, separarRecebimentos, situacaoRecebimento,
  textoJaRecebido, validarRecebimento,
} from "../recebimento-dados.js";

const rec = (status, recebidoEm = "2026-11-12T12:00:00.000Z", extra = {}) => ({
  id: `r-${recebidoEm}`, userId: "uL", status, recebedorNome: "João Silva", loja: "PG Prime BMW Natal", recebidoEm,
  descricao: status === "divergencia" ? "Risco novo" : "", assinatura: "p", fotos: [], ...extra,
});
const v = (id, extra = {}) => ({
  id, numero: `VIS-${id}`, realizadaEm: "2026-11-10T10:00:00.000Z", chassi: "AB123C", marca: "BMW", modelo: "X1",
  loja: "PG Prime BMW Natal", recebimento: null, ...extra,
});

test("rótulos dos status", () => {
  assert.deepEqual(STATUS_RECEBIMENTO, { conforme: "Conforme vistoria", divergencia: "Com divergência", aguardando: "Aguardando recebimento" });
});

test("situação: aguardando, conforme, divergência e sem loja", () => {
  assert.equal(situacaoRecebimento(v("1")), "aguardando");
  assert.equal(situacaoRecebimento(v("2", { recebimento: rec("conforme") })), "conforme");
  assert.equal(situacaoRecebimento(v("3", { recebimento: rec("divergencia") })), "divergencia");
  assert.equal(situacaoRecebimento(v("4", { loja: "" })), null);
  assert.equal(situacaoRecebimento(v("5", { loja: null })), null);
});

test("validação: escolha, descrição na divergência e assinatura", () => {
  assert.deepEqual(validarRecebimento({ status: "divergencia", descricao: " ", assinatura: true }),
    [{ campo: "descricao", mensagem: "Descreva o que está diferente." }]);
  assert.deepEqual(validarRecebimento({ status: "conforme", descricao: "", assinatura: true }), []);
  assert.deepEqual(validarRecebimento({ status: "", descricao: "", assinatura: false }), [
    { campo: "status", mensagem: "Escolha como o carro chegou." },
    { campo: "assinatura", mensagem: "Falta a assinatura de quem recebeu." },
  ]);
});

test("separar: a receber (mais antigas primeiro) e recebidos (mais recentes primeiro); sem loja fica fora", () => {
  const itens = [
    v("a", { realizadaEm: "2026-11-11T10:00:00.000Z" }),
    v("b", { realizadaEm: "2026-11-09T10:00:00.000Z" }),
    v("c", { recebimento: rec("conforme", "2026-11-10T10:00:00.000Z") }),
    v("d", { recebimento: rec("divergencia", "2026-11-12T10:00:00.000Z") }),
    v("e", { loja: "" }),
  ];
  const { aReceber, recebidos } = separarRecebimentos(itens);
  assert.deepEqual(aReceber.map((x) => x.id), ["b", "a"]);
  assert.deepEqual(recebidos.map((x) => x.id), ["d", "c"]);
});

test("busca por chassi, marca, modelo e número, sem acento", () => {
  const itens = [v("1", { chassi: "778699", marca: "BAIC", modelo: "Xr5" }), v("2", { marca: "Jeep", modelo: "Renegade" })];
  assert.deepEqual(buscarRecebimentos(itens, "778699").map((x) => x.id), ["1"]);
  assert.deepEqual(buscarRecebimentos(itens, "baic").map((x) => x.id), ["1"]);
  assert.deepEqual(buscarRecebimentos(itens, "vis-2").map((x) => x.id), ["2"]);
  assert.equal(buscarRecebimentos(itens, "  ").length, 2);
});

test("contagem ignora vistorias sem loja", () => {
  const itens = [v("1"), v("2"), v("3", { recebimento: rec("conforme") }), v("4", { recebimento: rec("divergencia") }), v("5", { loja: "" })];
  assert.deepEqual(contarRecebimentos(itens), { aguardando: 2, conforme: 1, divergencia: 1 });
});

test("texto de já recebido", () => {
  assert.equal(textoJaRecebido({ recebedorNome: "João Silva", recebidoEm: new Date(2026, 10, 12, 14, 5).toISOString() }),
    "Este carro já foi recebido por João Silva em 12/11 às 14:05.");
});
