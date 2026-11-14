import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gerarEnv } from "../scripts/gerar-env.js";

function pastaTemporaria() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "vistoria-env-"));
  fs.writeFileSync(path.join(raiz, "env.js"), 'export const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";\n');
  fs.writeFileSync(path.join(raiz, "sw.js"), '// topo\nconst CACHE_VERSION = "v1";\nconst CACHE = `vistoria-${CACHE_VERSION}`;\n');
  return raiz;
}

test("gera env.js e carimba a versão do cache com o commit", () => {
  const raiz = pastaTemporaria();
  const r = gerarEnv({ env: { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "k1", COMMIT_REF: "0123456789abcdef" }, raiz });
  const env = fs.readFileSync(path.join(raiz, "env.js"), "utf8");
  assert.match(env, /^export const SUPABASE_URL = "https:\/\/abc\.supabase\.co";$/m);
  assert.match(env, /^export const SUPABASE_ANON_KEY = "k1";$/m);
  const sw = fs.readFileSync(path.join(raiz, "sw.js"), "utf8");
  assert.match(sw, /^const CACHE_VERSION = "v-01234567";$/m);
  assert.match(sw, /^const CACHE = `vistoria-\$\{CACHE_VERSION\}`;$/m);
  assert.deepEqual(r, { versao: "v-01234567" });
});

test("no Cloudflare Pages a versão usa o commit do CF_PAGES_COMMIT_SHA", () => {
  const r = gerarEnv({ env: { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "k1", CF_PAGES_COMMIT_SHA: "fedcba9876543210" }, raiz: pastaTemporaria() });
  assert.deepEqual(r, { versao: "v-fedcba98" });
});

test("sem COMMIT_REF a versão usa o horário e muda a cada deploy", () => {
  const r = gerarEnv({ env: { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "k1" }, raiz: pastaTemporaria() });
  assert.match(r.versao, /^v-[0-9a-z]{8}$/);
});

test("sem as variáveis o build falha com mensagem clara", () => {
  assert.throws(
    () => gerarEnv({ env: { SUPABASE_URL: "https://abc.supabase.co" }, raiz: pastaTemporaria() }),
    /Defina SUPABASE_URL e SUPABASE_ANON_KEY/,
  );
});
