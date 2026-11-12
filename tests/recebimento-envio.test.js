import { test } from "node:test";
import assert from "node:assert/strict";
import { JaRecebidoError, enviarRecebimento } from "../recebimento-envio.js";
import { classificarErro } from "../supabase.js";

const USUARIO = { id: "uL", nome: "Davi Loja", papel: "loja", loja: "PG Prime BMW Natal" };
const VISTORIA = { id: "v1", userId: "uV", loja: "PG Prime BMW Natal" };
const RASCUNHO = { id: "r1", status: "divergencia", descricao: "Risco novo na porta", fotos: ["f1"], assinatura: true };

function storageFalso(arquivos = { "receb-v1/receb_assinatura.png": "ASS", "receb-v1/receb_f1.jpg": "FOTO" }) {
  const chamadas = [];
  return {
    chamadas,
    obterArquivo: async (chave) => arquivos[chave],
    excluirRascunhoRecebimento: async (id) => { chamadas.push(`excluirRascunho ${id}`); },
  };
}

function remotoFalso({ existente = null, falharInsert = null, depoisDoInsert } = {}) {
  const chamadas = [];
  let noServidor = existente;
  return {
    chamadas,
    async obterRecebimento(id) { chamadas.push(`obter ${id}`); return noServidor; },
    async enviarArquivo(caminho, blob) { chamadas.push(`arquivo ${caminho} ${blob}`); },
    async inserirRecebimento(r, id) {
      chamadas.push(`inserir ${r.id} ${id} ${r.status} ${r.assinatura}`);
      if (falharInsert) { const e = falharInsert; falharInsert = null; throw e; }
      noServidor = depoisDoInsert || { ...r, userId: "uL", recebedorNome: "Davi Loja", loja: USUARIO.loja, recebidoEm: "2026-11-12T14:05:00.000Z", fotos: [] };
      return noServidor;
    },
    async gravarFotosRecebimento(r, id) {
      chamadas.push(`fotos ${r.fotos.join(",")} ${id} ${r.userId}`);
      noServidor = { ...noServidor, fotos: r.fotos };
    },
  };
}

test("caminho feliz: arquivos, recebimento, fotos e rascunho apagado, nessa ordem", async () => {
  const remoto = remotoFalso();
  const storage = storageFalso();
  const r = await enviarRecebimento({ remoto, storage, usuario: USUARIO, vistoria: VISTORIA, rascunho: RASCUNHO });
  assert.deepEqual(remoto.chamadas, [
    "obter v1",
    "arquivo uL/v1/receb_assinatura.png ASS",
    "arquivo uL/v1/receb_f1.jpg FOTO",
    "inserir r1 v1 divergencia uL/v1/receb_assinatura.png",
    "fotos f1 v1 uL",
    "obter v1",
  ]);
  assert.deepEqual(storage.chamadas, ["excluirRascunho v1"]);
  assert.equal(r.id, "r1");
  assert.deepEqual(r.fotos, ["f1"]);
});

test("reenvio depois de cair no meio usa o mesmo id e não duplica", async () => {
  const remoto = remotoFalso({ falharInsert: new TypeError("Failed to fetch") });
  const storage = storageFalso();
  await assert.rejects(enviarRecebimento({ remoto, storage, usuario: USUARIO, vistoria: VISTORIA, rascunho: RASCUNHO }), TypeError);
  assert.deepEqual(storage.chamadas, [], "rascunho fica guardado quando falha");
  const r = await enviarRecebimento({ remoto, storage, usuario: USUARIO, vistoria: VISTORIA, rascunho: RASCUNHO });
  assert.equal(r.id, "r1");
  assert.equal(remoto.chamadas.filter((c) => c.startsWith("inserir")).length, 2, "a 1ª tentativa falhou antes de gravar");
});

test("se o insert gravou mas a resposta se perdeu, o reenvio não insere de novo", async () => {
  const remoto = remotoFalso({ existente: { id: "r1", userId: "uL", status: "divergencia", fotos: [] } });
  const r = await enviarRecebimento({ remoto, storage: storageFalso(), usuario: USUARIO, vistoria: VISTORIA, rascunho: RASCUNHO });
  assert.equal(remoto.chamadas.filter((c) => c.startsWith("inserir")).length, 0);
  assert.equal(r.id, "r1");
});

test("já recebido por outra pessoa: JaRecebidoError com o recebimento, sem enviar nada", async () => {
  const outro = { id: "rX", userId: "uOutro", recebedorNome: "Bia", recebidoEm: "2026-11-12T10:00:00.000Z", status: "conforme", fotos: [] };
  const remoto = remotoFalso({ existente: outro });
  const e = await enviarRecebimento({ remoto, storage: storageFalso(), usuario: USUARIO, vistoria: VISTORIA, rascunho: RASCUNHO })
    .catch((err) => err);
  assert.ok(e instanceof JaRecebidoError);
  assert.equal(e.recebimento, outro);
  assert.deepEqual(remoto.chamadas, ["obter v1"]);
});

test("corrida: outra pessoa gravou entre a consulta e o insert (23505) vira JaRecebidoError", async () => {
  const outro = { id: "rX", userId: "uOutro", recebedorNome: "Bia", recebidoEm: "2026-11-12T10:00:00.000Z", status: "conforme", fotos: [] };
  const remoto = remotoFalso({ falharInsert: { code: "23505" } });
  const obterOriginal = remoto.obterRecebimento;
  let consultas = 0;
  remoto.obterRecebimento = async (id) => (++consultas === 1 ? obterOriginal(id) : outro);
  const e = await enviarRecebimento({ remoto, storage: storageFalso(), usuario: USUARIO, vistoria: VISTORIA, rascunho: RASCUNHO })
    .catch((err) => err);
  assert.ok(e instanceof JaRecebidoError);
  assert.equal(e.recebimento.id, "rX");
});

test("vistoria excluída pelo CD: o erro do banco chega com a mensagem própria", async () => {
  const remoto = remotoFalso({ falharInsert: { code: "23503" } });
  const e = await enviarRecebimento({ remoto, storage: storageFalso(), usuario: USUARIO, vistoria: VISTORIA, rascunho: RASCUNHO })
    .catch((err) => err);
  assert.equal(classificarErro(e).mensagem, "Esta vistoria foi excluída pelo CD.");
});

test("sem a assinatura no aparelho: erro claro e nada é enviado", async () => {
  const remoto = remotoFalso();
  await assert.rejects(
    enviarRecebimento({ remoto, storage: storageFalso({}), usuario: USUARIO, vistoria: VISTORIA, rascunho: RASCUNHO }),
    { message: "Falta a assinatura de quem recebeu." });
  assert.deepEqual(remoto.chamadas, ["obter v1"]);
});
