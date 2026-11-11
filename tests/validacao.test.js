import { test } from "node:test";
import assert from "node:assert/strict";
import { faltandoParaFinalizar, situacaoEtapa, validarAvaria } from "../validacao.js";
import { novoRascunho } from "../formatos.js";
import { CHECKLIST_ITENS } from "../config.js";

function completo() {
  const r = novoRascunho("u1", "v1", "2026-11-07T12:00:00.000Z");
  Object.assign(r.dados, {
    loja: "PG Prime Jeep Natal", chassi: "AB123C", marca: "Fiat", modelo: "Uno", cor: "Prata", km: 1000, combustivel: "Flex",
    fotos: { frente: true, traseira: true, chassi: true },
    checklist: Object.fromEntries(CHECKLIST_ITENS.map((i) => [i, "presente"])),
    semAvarias: true,
    vistoriadorNome: "Ana", motoristaNome: "Beto",
    assinaturas: { vistoriador: true, motorista: true },
  });
  return r;
}

test("rascunho completo não tem pendências", () => {
  assert.deepEqual(faltandoParaFinalizar(completo()), []);
  assert.equal(situacaoEtapa(completo(), 2), "completa");
});

test("chassi vazio ou curto", () => {
  const r = completo();
  r.dados.chassi = "AB1";
  assert.deepEqual(faltandoParaFinalizar(r), [{ etapa: 1, campo: "chassi", mensagem: "O chassi deve ter 6 caracteres (faltam 3)" }]);
  r.dados.chassi = "";
  assert.equal(faltandoParaFinalizar(r)[0].mensagem, "Informe o chassi");
});

test("demais campos e fotos da etapa 1, na ordem", () => {
  const s = completo();
  s.dados.marca = " ";
  s.dados.km = null;
  s.dados.combustivel = null;
  s.dados.fotos.traseira = false;
  assert.deepEqual(faltandoParaFinalizar(s).map((f) => f.mensagem),
    ["Informe a marca", "Informe o km", "Escolha o combustível", "Falta a foto: Traseira"]);
});

test("loja de destino é obrigatória e vem primeiro na etapa 1", () => {
  const r = completo();
  r.dados.loja = "";
  r.dados.marca = "";
  assert.deepEqual(faltandoParaFinalizar(r).map((f) => f.campo), ["loja", "marca"]);
  delete r.dados.loja; // rascunho de antes do campo existir
  assert.equal(faltandoParaFinalizar(r)[0].mensagem, "Escolha a loja de destino");
});

test("checklist sem marcação vira uma linha agrupada", () => {
  const c = completo();
  delete c.dados.checklist["Antena"];
  delete c.dados.checklist["Bateria"];
  delete c.dados.checklist["Macaco"];
  assert.deepEqual(faltandoParaFinalizar(c), [{ etapa: 2, campo: "chk-0", mensagem: "Checklist: 3 itens sem marcação (Antena, Bateria, Macaco)" }]);
  const c1 = completo();
  delete c1.dados.checklist["Tapetes"];
  assert.equal(faltandoParaFinalizar(c1)[0].mensagem, "Checklist: 1 item sem marcação (Tapetes)");
});

test("avarias exigem o toggle ou ao menos uma avaria", () => {
  const a = completo();
  a.dados.semAvarias = false;
  assert.deepEqual(faltandoParaFinalizar(a), [{ etapa: 3, campo: "sem-avarias", mensagem: "Confirme “Veículo sem avarias” ou adicione uma avaria" }]);
  a.dados.avarias = [{ id: "d1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: "", fotos: [] }];
  assert.deepEqual(faltandoParaFinalizar(a), []);
});

test("nomes e assinaturas da etapa 4", () => {
  const z = completo();
  z.dados.vistoriadorNome = "";
  z.dados.assinaturas.motorista = false;
  assert.deepEqual(faltandoParaFinalizar(z).map((f) => f.campo), ["vistoriador-nome", "motorista-assinatura"]);
  assert.match(faltandoParaFinalizar(z)[0].mensagem, /nome de vistoriador não está cadastrado/);
  assert.equal(situacaoEtapa(z, 4), "pendente");
});

test("avaria exige área, tipo e gravidade", () => {
  assert.deepEqual(validarAvaria({ area: "", tipo: "Risco", gravidade: null }), ["Escolha a área da avaria", "Escolha a gravidade"]);
});
