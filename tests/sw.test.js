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
