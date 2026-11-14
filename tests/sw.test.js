import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Roda o sw.js num contexto falso e devolve o tratador de fetch.
function carregarSw({ fetch, emCache }) {
  const tratadores = {};
  const contexto = {
    self: { addEventListener: (t, fn) => { tratadores[t] = fn; }, location: { origin: "http://app" } },
    caches: { match: async () => emCache, open: async () => ({ put: async () => {} }) },
    fetch, URL, Request: class { constructor(u) { this.url = u; } }, Promise, console,
    setTimeout: (fn) => setTimeout(fn, 0),
  };
  vm.runInNewContext(fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8"), contexto);
  return tratadores.fetch;
}

test("env.js com rede travada cai para a cópia em cache", async () => {
  const aoBuscar = carregarSw({ fetch: () => new Promise(() => {}), emCache: "env-em-cache" });
  let resposta;
  aoBuscar({ request: { method: "GET", url: "http://app/env.js", mode: "cors" }, respondWith: (p) => { resposta = p; } });
  const limite = new Promise((_, rej) => setTimeout(() => rej(new Error("env.js travou esperando a rede")), 1000).unref());
  assert.equal(await Promise.race([resposta, limite]), "env-em-cache");
});

test("versão nova assume sozinha ao instalar (Chrome não fica preso na antiga)", async () => {
  const tratadores = {};
  let pulouEspera = false;
  const contexto = {
    self: { addEventListener: (t, fn) => { tratadores[t] = fn; }, location: { origin: "http://app" }, skipWaiting: () => { pulouEspera = true; } },
    caches: { open: async () => ({ addAll: async () => {} }) },
    fetch: async () => ({}), URL, Request: class { constructor(u) { this.url = u; } }, Promise, console, setTimeout,
  };
  vm.runInNewContext(fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8"), contexto);
  let espera;
  tratadores.install({ waitUntil: (p) => { espera = p; } });
  await espera;
  assert.equal(pulouEspera, true, "install deveria chamar self.skipWaiting() depois de guardar os arquivos");
});

test("abrir o app: página inicial guardada por redirecionamento (Cloudflare) é entregue limpa, sem ERR_FAILED", async () => {
  const tratadores = {};
  let chaveBuscada = null;
  class RespostaFalsa {
    constructor(corpo, opcoes = {}) { this.body = corpo; this.status = opcoes.status ?? 200; this.headers = opcoes.headers; this.redirected = false; }
  }
  const guardada = { body: "<html>", status: 200, statusText: "OK", headers: {}, redirected: true };
  const contexto = {
    self: { addEventListener: (t, fn) => { tratadores[t] = fn; }, location: { origin: "http://app" } },
    caches: { match: async (chave) => { chaveBuscada = chave; return guardada; } },
    fetch: async () => { throw new Error("sem rede"); }, URL, Request: class { constructor(u) { this.url = u; } },
    Response: RespostaFalsa, Promise, console, setTimeout,
  };
  vm.runInNewContext(fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8"), contexto);
  let resposta;
  tratadores.fetch({ request: { method: "GET", url: "http://app/", mode: "navigate" }, respondWith: (p) => { resposta = p; } });
  const r = await resposta;
  assert.equal(chaveBuscada, "./", "a página inicial fica guardada como ./ (o endereço que não redireciona)");
  assert.equal(r.redirected, false, "resposta redirecionada derruba a navegação no Chrome");
  assert.equal(r.body, "<html>");
});
