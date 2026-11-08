import { test } from "node:test";
import assert from "node:assert/strict";
import { criarAuth } from "../auth.js";
import { classificarErro } from "../supabase.js";

const U = { id: "u1", email: "a@teste" };

function storageFalso(meta = {}) {
  const m = new Map(Object.entries(meta));
  const chamadas = [];
  return {
    m, chamadas,
    obterMeta: async (k) => m.get(k),
    salvarMeta: async (k, v) => { m.set(k, v); },
    removerMeta: async (k) => { chamadas.push(`removerMeta:${k}`); m.delete(k); },
    limparCacheSincronizado: async (u) => { chamadas.push(`limparCacheSincronizado:${u}`); },
  };
}

function remotoFalso({ sessao = null, erro = null, entrar, sair } = {}) {
  const chamadas = [];
  return {
    chamadas,
    classificarErro,
    obterSessao: async () => ({ sessao, erro }),
    entrar: entrar || (async () => U),
    sair: sair || (async () => { chamadas.push("sair"); }),
    aoMudarSessao: () => () => {},
  };
}

test("com sessão: devolve o usuário e guarda em cache", async () => {
  const st = storageFalso();
  const a = criarAuth({ remoto: remotoFalso({ sessao: { usuario: U } }), storage: st, estaOnline: () => true });
  assert.deepEqual(await a.iniciar(), U);
  assert.deepEqual(st.m.get("usuario"), U);
  assert.deepEqual(a.usuarioAtual(), U);
});

test("offline com token vencido usa o usuário em cache", async () => {
  const st = storageFalso({ usuario: U });
  const erroRede = { name: "AuthRetryableFetchError", status: 0 };
  const a = criarAuth({ remoto: remotoFalso({ erro: erroRede }), storage: st, estaOnline: () => true });
  assert.deepEqual(await a.iniciar(), U);
});

test("sem sessão e sem erro: tela de login", async () => {
  const a = criarAuth({ remoto: remotoFalso(), storage: storageFalso({ usuario: U }), estaOnline: () => true });
  assert.equal(await a.iniciar(), null);
});

test("refresh revogado (erro que não é de rede) exige login mesmo com cache", async () => {
  const st = storageFalso({ usuario: U });
  const a = criarAuth({ remoto: remotoFalso({ erro: { status: 400, code: "refresh_token_not_found" } }), storage: st, estaOnline: () => true });
  assert.equal(await a.iniciar(), null);
});

test("credenciais erradas", async () => {
  const remoto = remotoFalso({ entrar: async () => { throw { status: 400, code: "invalid_credentials" }; } });
  const a = criarAuth({ remoto, storage: storageFalso(), estaOnline: () => true });
  await assert.rejects(a.entrar("a@teste", "x"), { message: "E-mail ou senha incorretos." });
});

test("entrar offline não chama o servidor", async () => {
  let chamou = false;
  const remoto = remotoFalso({ entrar: async () => { chamou = true; return U; } });
  const a = criarAuth({ remoto, storage: storageFalso(), estaOnline: () => false });
  await assert.rejects(a.entrar("a@teste", "x"), { message: "Sem internet: o primeiro acesso precisa de conexão." });
  assert.equal(chamou, false);
});

test("servidor inacessível ao entrar", async () => {
  const remoto = remotoFalso({ entrar: async () => { throw new TypeError("Failed to fetch"); } });
  const a = criarAuth({ remoto, storage: storageFalso(), estaOnline: () => true });
  await assert.rejects(a.entrar("a@teste", "x"), { message: "Sem internet: o primeiro acesso precisa de conexão." });
});

test("outro erro ao entrar", async () => {
  const remoto = remotoFalso({ entrar: async () => { throw { status: 422, code: "email_provider_disabled" }; } });
  const a = criarAuth({ remoto, storage: storageFalso(), estaOnline: () => true });
  await assert.rejects(a.entrar("a@teste", "x"), { message: "Não foi possível entrar. Tente novamente em instantes." });
});

test("entrar com sucesso guarda o usuário e avisa os ouvintes", async () => {
  const st = storageFalso();
  const a = criarAuth({ remoto: remotoFalso(), storage: st, estaOnline: () => true });
  const vistos = [];
  a.aoMudar((u) => vistos.push(u));
  assert.deepEqual(await a.entrar("a@teste", "x"), U);
  assert.deepEqual(st.m.get("usuario"), U);
  assert.deepEqual(vistos, [U]);
});

test("sair limpa só o cache sincronizado, mesmo se o servidor falhar", async () => {
  const st = storageFalso();
  const remoto = remotoFalso({ sessao: { usuario: U }, sair: async () => { throw new TypeError("Failed to fetch"); } });
  const a = criarAuth({ remoto, storage: st, estaOnline: () => true });
  await a.iniciar();
  await a.sair();
  assert.deepEqual(st.chamadas, ["limparCacheSincronizado:u1", "removerMeta:usuario"]);
  assert.equal(a.usuarioAtual(), null);
});
