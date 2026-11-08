import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { criarEditor } from "../rascunho.js";
import { novoRascunho } from "../formatos.js";

function storageFalso() {
  const salvos = [];
  const arquivos = new Map();
  return {
    salvos, arquivos,
    salvarRascunho: async (r) => { salvos.push(structuredClone(r)); },
    salvarArquivo: async (k, b) => { arquivos.set(k, b); },
    obterArquivo: async (k) => arquivos.get(k),
    excluirArquivo: async (k) => { arquivos.delete(k); },
  };
}

const esvaziar = () => new Promise((r) => setImmediate(r));
let relogio = 0;
const agora = () => `2026-11-07T12:00:${String(++relogio).padStart(2, "0")}.000Z`;

test("alterações seguidas viram uma gravação 400 ms depois da última", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const st = storageFalso();
    const ed = criarEditor({ storage: st, rascunho: novoRascunho("u1", "r1", "x"), agora });
    ed.alterar((d) => { d.marca = "F"; });
    mock.timers.tick(300);
    ed.alterar((d) => { d.marca = "Fiat"; });
    mock.timers.tick(399);
    await esvaziar();
    assert.equal(st.salvos.length, 0);
    assert.equal(ed.temPendente(), true);
    mock.timers.tick(1);
    await esvaziar();
    assert.equal(st.salvos.length, 1);
    assert.equal(st.salvos[0].dados.marca, "Fiat");
    assert.equal(ed.temPendente(), false);
  } finally {
    mock.timers.reset();
  }
});

test("alteração imediata grava na hora e atualiza atualizadoEm", async () => {
  const st = storageFalso();
  const ed = criarEditor({ storage: st, rascunho: novoRascunho("u1", "r1", "x"), agora });
  await ed.alterar((d) => { d.combustivel = "Flex"; }, { imediato: true });
  assert.equal(st.salvos.length, 1);
  assert.equal(st.salvos[0].dados.combustivel, "Flex");
  assert.match(st.salvos[0].atualizadoEm, /^2026-11-07T12:00:/);
  assert.notEqual(st.salvos[0].atualizadoEm, "x");
});

test("descarregar grava o que estava agendado", async () => {
  const st = storageFalso();
  const ed = criarEditor({ storage: st, rascunho: novoRascunho("u1", "r1", "x"), agora });
  ed.alterar((d) => { d.cor = "Prata"; });
  await ed.descarregar();
  assert.equal(st.salvos.length, 1);
  assert.equal(st.salvos[0].dados.cor, "Prata");
  assert.equal(ed.temPendente(), false);
});

test("gravarArquivo salva o Blob com a chave do rascunho e grava a marca", async () => {
  const st = storageFalso();
  const ed = criarEditor({ storage: st, rascunho: novoRascunho("u1", "r1", "x"), agora });
  const blob = new Blob(["foto"]);
  await ed.gravarArquivo("frente.jpg", blob, (d) => { d.fotos.frente = true; });
  assert.equal(st.arquivos.get("r1/frente.jpg"), blob);
  assert.equal(st.salvos.at(-1).dados.fotos.frente, true);
  assert.equal(await ed.lerArquivo("frente.jpg"), blob);
  await ed.apagarArquivo("frente.jpg", (d) => { d.fotos.frente = false; });
  assert.equal(st.arquivos.has("r1/frente.jpg"), false);
  assert.equal(st.salvos.at(-1).dados.fotos.frente, false);
});

test("irPara grava a etapa e os ouvintes recebem as mudanças", async () => {
  const st = storageFalso();
  const ed = criarEditor({ storage: st, rascunho: novoRascunho("u1", "r1", "x"), agora });
  const vistos = [];
  const parar = ed.aoMudar((r) => vistos.push(r.dados.marca));
  ed.alterar((d) => { d.marca = "Ford"; });
  await ed.irPara(3);
  assert.equal(st.salvos.at(-1).etapa, 3);
  assert.deepEqual(vistos, ["Ford"]);
  parar();
  ed.alterar((d) => { d.marca = "VW"; });
  assert.deepEqual(vistos, ["Ford"]);
  await ed.descarregar();
});

test("falha ao gravar chega em aoErro", async () => {
  const st = storageFalso();
  st.salvarRascunho = async () => { throw new Error("Armazenamento do aparelho cheio."); };
  const erros = [];
  const ed = criarEditor({ storage: st, rascunho: novoRascunho("u1", "r1", "x"), agora, aoErro: (e) => erros.push(e.message) });
  await ed.alterar((d) => { d.cor = "Azul"; }, { imediato: true });
  assert.deepEqual(erros, ["Armazenamento do aparelho cheio."]);
});

test("depois de encerrar, nada mais é gravado (rascunho finalizado não volta)", async () => {
  const st = storageFalso();
  const ed = criarEditor({ storage: st, rascunho: novoRascunho("u1", "r1", "x"), agora });
  ed.encerrar();
  await ed.alterar((d) => { d.cor = "Azul"; }, { imediato: true });
  ed.alterar((d) => { d.cor = "Verde"; });
  await ed.irPara(2);
  await ed.descarregar();
  assert.equal(st.salvos.length, 0);
  assert.equal(ed.temPendente(), false);
});

test("reabrir volta a gravar (finalização que falhou)", async () => {
  const st = storageFalso();
  const ed = criarEditor({ storage: st, rascunho: novoRascunho("u1", "r1", "x"), agora });
  ed.encerrar();
  ed.reabrir();
  await ed.alterar((d) => { d.cor = "Azul"; }, { imediato: true });
  assert.equal(st.salvos.length, 1);
});
