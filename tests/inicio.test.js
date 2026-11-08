import { test } from "node:test";
import assert from "node:assert/strict";
import { deveAbrirNoMenu, nivelDaTela } from "../views/inicio.js";

test("abrir o app (sem hash, #/ ou o start_url #/nova) vai para o menu", () => {
  for (const hash of ["", "#", "#/", "#/nova"]) assert.equal(deveAbrirNoMenu(hash, "navigate"), true, hash);
});

test("recarregar ou voltar mantém a tela atual", () => {
  assert.equal(deveAbrirNoMenu("#/nova", "reload"), false);
  assert.equal(deveAbrirNoMenu("#/vistorias", "reload"), false);
  assert.equal(deveAbrirNoMenu("#/nova", "back_forward"), false);
});

test("endereço com tela específica (rascunho, lista, detalhe) não é trocado pelo menu", () => {
  assert.equal(deveAbrirNoMenu("#/nova?rascunho=abc", "navigate"), false);
  assert.equal(deveAbrirNoMenu("#/vistorias", "navigate"), false);
  assert.equal(deveAbrirNoMenu("#/vistoria/123", "navigate"), false);
});

test("sem reload: hash vazio sempre vai para o menu", () => {
  assert.equal(deveAbrirNoMenu("", "reload"), true);
  assert.equal(deveAbrirNoMenu("#/", "reload"), true);
});

test("nível no histórico: menu é 0, cada tela aberta a partir dele soma 1", () => {
  assert.equal(nivelDaTela(undefined, "inicio", 3), 0);
  assert.equal(nivelDaTela(undefined, "vistorias", 0), 1);
  assert.equal(nivelDaTela(undefined, "detalhe", 1), 2);
});

test("entrada que já tem nível (voltar/avançar/recarregar) mantém o dela", () => {
  assert.equal(nivelDaTela({ nivel: 1 }, "vistorias", 2), 1);
  assert.equal(nivelDaTela({ nivel: 0 }, "inicio", 1), 0);
});
