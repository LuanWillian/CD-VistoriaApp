import { test } from "node:test";
import assert from "node:assert/strict";
import { criarSincronizador } from "../sync.js";
import { arquivosDaVistoria } from "../formatos.js";

const clone = (o) => (o === undefined ? undefined : structuredClone(o));

function vistoria(id, userId, extra = {}) {
  return {
    id, userId, numero: null, realizadaEm: "2026-11-07T13:00:00.000Z", chassi: "AB123C", marca: "Fiat", modelo: "Uno",
    cor: "Prata", km: 1, combustivel: "Flex", checklist: {}, checklistObs: "", semAvarias: false,
    avarias: [{ id: "d1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: "", fotos: ["f1", "f2"] }],
    vistoriadorNome: "Ana", motoristaNome: "Beto", status: "pendente", erro: null, enviados: [], origem: "local",
    completa: true, avariasQtd: 1, arquivosSalvosEm: null, atualizadoEm: "2026-11-07T13:00:00.000Z", ...extra,
  };
}

function storageFalso(...lista) {
  const vistorias = new Map(), arquivos = new Map(), exclusoes = new Map();
  const st = {
    vistorias, arquivos, exclusoes,
    adicionar(v, { semArquivos = [] } = {}) {
      vistorias.set(v.id, clone(v));
      for (const nome of arquivosDaVistoria(v)) if (!semArquivos.includes(nome)) arquivos.set(`${v.id}/${nome}`, new Blob([nome]));
    },
    listarVistorias: async (u) => [...vistorias.values()].filter((v) => v.userId === u).map(clone)
      .sort((a, b) => b.realizadaEm.localeCompare(a.realizadaEm)),
    obterVistoria: async (id) => clone(vistorias.get(id)),
    salvarVistoria: async (v) => { vistorias.set(v.id, clone(v)); },
    obterArquivo: async (k) => arquivos.get(k),
    listarExclusoes: async (u) => [...exclusoes.values()].filter((e) => e.userId === u),
    removerExclusao: async (id) => { exclusoes.delete(id); },
    excluirVistoriaLocal: async (id) => {
      vistorias.delete(id);
      for (const k of [...arquivos.keys()]) if (k.startsWith(`${id}/`)) arquivos.delete(k);
    },
  };
  for (const v of lista) st.adicionar(v);
  return st;
}

function remotoFalso(opcoes = {}) {
  const chamadas = [];
  const vezes = {};
  const existentes = new Map(Object.entries(opcoes.existentes || {}));
  let seq = 0;
  const talvezFalhar = (metodo) => {
    vezes[metodo] = (vezes[metodo] || 0) + 1;
    const erro = opcoes.falhar?.(metodo, vezes[metodo]);
    if (erro) throw erro;
  };
  return {
    chamadas,
    classificarErro: (e) => e,
    async enviarArquivo(caminho) { chamadas.push(`enviarArquivo:${caminho}`); talvezFalhar("enviarArquivo"); },
    async vistoriaExiste(id) { chamadas.push("vistoriaExiste"); talvezFalhar("vistoriaExiste"); return existentes.get(id) ?? null; },
    async inserirVistoria(v) {
      chamadas.push("inserirVistoria");
      talvezFalhar("inserirVistoria");
      const r = { numero: `VIS-${String(++seq).padStart(6, "0")}` };
      existentes.set(v.id, r);
      return r;
    },
    async gravarAvarias() { chamadas.push("gravarAvarias"); talvezFalhar("gravarAvarias"); },
    async gravarFotosAvaria() { chamadas.push("gravarFotosAvaria"); talvezFalhar("gravarFotosAvaria"); await opcoes.durante?.(); },
    async excluirVistoriaRemota(u, id) { chamadas.push(`excluirVistoriaRemota:${u}:${id}`); talvezFalhar("excluirVistoriaRemota"); },
  };
}

const A = { id: "u1", email: "a@teste" };
const criar = (storage, remoto, extra = {}) => criarSincronizador({
  storage, remoto, usuarioAtual: () => A, estaOnline: () => true, locks: null, ...extra,
});
const rede = { tipo: "rede", mensagem: "Sem conexão com o servidor." };

test("envia na ordem da spec e marca como sincronizada", async () => {
  const st = storageFalso(vistoria("v1", "u1"));
  const rm = remotoFalso();
  const r = await criar(st, rm).sincronizar();
  const caminhos = arquivosDaVistoria(st.vistorias.get("v1")).map((n) => `enviarArquivo:u1/v1/${n}`);
  assert.equal(caminhos.length, 8);
  assert.deepEqual(rm.chamadas, [...caminhos, "vistoriaExiste", "inserirVistoria", "gravarAvarias", "gravarFotosAvaria"]);
  const v = st.vistorias.get("v1");
  assert.equal(v.status, "sincronizada");
  assert.equal(v.numero, "VIS-000001");
  assert.equal(v.erro, null);
  assert.ok(v.arquivosSalvosEm);
  assert.deepEqual(r, { enviadas: 1, erros: 0, exclusoesRecusadas: 0, interrompido: null });
});

test("reenvio não insere de novo", async () => {
  const st = storageFalso(vistoria("v1", "u1"));
  const rm = remotoFalso({ existentes: { v1: { numero: "VIS-000007" } } });
  await criar(st, rm).sincronizar();
  assert.equal(rm.chamadas.includes("inserirVistoria"), false);
  assert.equal(st.vistorias.get("v1").numero, "VIS-000007");
  assert.equal(st.vistorias.get("v1").status, "sincronizada");
});

test("queda de rede no 3º arquivo: guarda o progresso e continua depois", async () => {
  const st = storageFalso(vistoria("v1", "u1"));
  const rm1 = remotoFalso({ falhar: (m, n) => (m === "enviarArquivo" && n === 3 ? rede : null) });
  const r1 = await criar(st, rm1).sincronizar();
  assert.equal(r1.interrompido, "rede");
  assert.equal(st.vistorias.get("v1").status, "pendente");
  assert.equal(st.vistorias.get("v1").enviados.length, 2);
  const rm2 = remotoFalso();
  await criar(st, rm2).sincronizar();
  assert.equal(rm2.chamadas.filter((c) => c.startsWith("enviarArquivo")).length, 6);
  assert.equal(st.vistorias.get("v1").status, "sincronizada");
});

test("sessão expirada mantém pendente e avisa", async () => {
  const st = storageFalso(vistoria("v1", "u1"));
  const rm = remotoFalso({ falhar: (m) => (m === "vistoriaExiste" ? { tipo: "sessao", mensagem: "x" } : null) });
  const s = criar(st, rm);
  const eventos = [];
  s.eventos.addEventListener("mudou", (e) => eventos.push(e.detail));
  const r = await s.sincronizar();
  assert.equal(r.interrompido, "sessao");
  assert.equal(st.vistorias.get("v1").status, "pendente");
  assert.ok(eventos.some((d) => d.sessaoExpirada === true));
});

test("erro do servidor marca erro e segue para a próxima", async () => {
  const st = storageFalso(vistoria("vA", "u1", { realizadaEm: "2026-11-07T10:00:00.000Z" }), vistoria("vB", "u1", { realizadaEm: "2026-11-07T11:00:00.000Z" }));
  const recusa = { tipo: "servidor", mensagem: "O servidor recusou os dados: x." };
  const rm = remotoFalso({ falhar: (m, n) => (m === "gravarAvarias" && n === 1 ? recusa : null) });
  const r = await criar(st, rm).sincronizar();
  assert.equal(st.vistorias.get("vA").status, "erro");
  assert.equal(st.vistorias.get("vA").erro, "O servidor recusou os dados: x.");
  assert.equal(st.vistorias.get("vB").status, "sincronizada");
  assert.deepEqual(r, { enviadas: 1, erros: 1, exclusoesRecusadas: 0, interrompido: null });
});

test("offline não chama o remoto", async () => {
  const st = storageFalso(vistoria("v1", "u1"));
  const rm = remotoFalso();
  const r = await criar(st, rm, { estaOnline: () => false }).sincronizar();
  assert.equal(r.interrompido, "offline");
  assert.equal(rm.chamadas.length, 0);
});

test("single-flight: chamadas simultâneas fazem uma rodada só", async () => {
  const st = storageFalso(vistoria("v1", "u1"));
  const rm = remotoFalso();
  const s = criar(st, rm);
  await Promise.all([s.sincronizar(), s.sincronizar()]);
  assert.equal(rm.chamadas.filter((c) => c === "inserirVistoria").length, 1);
});

test("lock ocupado por outra aba", async () => {
  const st = storageFalso(vistoria("v1", "u1"));
  const rm = remotoFalso();
  const locks = { request: async (_nome, _op, cb) => cb(null) };
  const r = await criar(st, rm, { locks }).sincronizar();
  assert.equal(r.interrompido, "ocupado");
  assert.equal(rm.chamadas.length, 0);
});

test("exclusões primeiro e vistorias excluindo puladas", async () => {
  const st = storageFalso(vistoria("v9", "u1", { status: "excluindo" }), vistoria("v8", "u1", { status: "excluindo" }));
  st.exclusoes.set("v9", { id: "v9", userId: "u1", criadoEm: "2026-11-07T13:00:00.000Z" });
  const rm = remotoFalso();
  await criar(st, rm).sincronizar();
  assert.deepEqual(rm.chamadas, ["excluirVistoriaRemota:u1:v9"]);
  assert.equal(st.exclusoes.size, 0);
  assert.equal(st.vistorias.has("v9"), false);
  assert.equal(st.arquivos.has("v9/frente.jpg"), false);
  assert.equal(st.vistorias.get("v8").status, "excluindo");
});

test("exclusão recusada pelo servidor: a vistoria volta para a lista e sai da fila", async () => {
  const st = storageFalso(vistoria("v9", "u1", { status: "excluindo", numero: "VIS-000009" }));
  st.exclusoes.set("v9", { id: "v9", userId: "u1", criadoEm: "2026-11-07T13:00:00.000Z" });
  const rm = remotoFalso({ falhar: (m) => (m === "excluirVistoriaRemota" ? { tipo: "servidor", mensagem: "O servidor recusou os dados: permissão negada." } : null) });
  const r = await criar(st, rm).sincronizar();
  assert.equal(st.exclusoes.size, 0, "não fica tentando para sempre");
  assert.equal(st.vistorias.get("v9").status, "sincronizada");
  assert.equal(r.exclusoesRecusadas, 1);
});

test("virou excluindo no meio do envio: status não é sobrescrito", async () => {
  const st = storageFalso(vistoria("v1", "u1"));
  const rm = remotoFalso({ durante: async () => { st.vistorias.get("v1").status = "excluindo"; } });
  await criar(st, rm).sincronizar();
  assert.equal(st.vistorias.get("v1").status, "excluindo");
});

test("arquivo local ausente vira erro com o nome do arquivo", async () => {
  const st = storageFalso();
  st.adicionar(vistoria("v1", "u1"), { semArquivos: ["traseira.jpg"] });
  const rm = remotoFalso();
  const r = await criar(st, rm).sincronizar();
  assert.equal(st.vistorias.get("v1").status, "erro");
  assert.equal(st.vistorias.get("v1").erro, "O arquivo \"Traseira\" não foi encontrado neste aparelho.");
  assert.equal(r.erros, 1);
});

test("usuário B não envia vistorias nem exclusões de A", async () => {
  const st = storageFalso(vistoria("v1", "u1"));
  st.exclusoes.set("v2", { id: "v2", userId: "u1", criadoEm: "x" });
  const rm = remotoFalso();
  await criar(st, rm, { usuarioAtual: () => ({ id: "u2", email: "b@teste" }) }).sincronizar();
  assert.equal(rm.chamadas.length, 0);
  assert.equal(st.vistorias.get("v1").status, "pendente");
  assert.equal(st.exclusoes.size, 1);
});

test("sem usuário não sincroniza", async () => {
  const st = storageFalso(vistoria("v1", "u1"));
  const rm = remotoFalso();
  const r = await criar(st, rm, { usuarioAtual: () => null }).sincronizar();
  assert.equal(r.interrompido, "sem-usuario");
  assert.equal(rm.chamadas.length, 0);
});

test("contar pendentes e erros do usuário", async () => {
  const st = storageFalso(
    vistoria("p1", "u1"), vistoria("p2", "u1"), vistoria("e1", "u1", { status: "erro" }),
    vistoria("s1", "u1", { status: "sincronizada" }), vistoria("p3", "u2"),
  );
  assert.deepEqual(await criar(st, remotoFalso()).contar(), { pendentes: 2, erros: 1 });
});

test("pedido feito durante uma rodada gera outra rodada no fim", async () => {
  const st = storageFalso(vistoria("v1", "u1"));
  let s;
  let pediu = false;
  const rm = remotoFalso({
    durante: async () => {
      if (pediu) return;
      pediu = true;
      st.adicionar(vistoria("v2", "u1", { realizadaEm: "2026-11-07T14:00:00.000Z" }));
      s.sincronizar();
    },
  });
  s = criar(st, rm);
  await s.sincronizar();
  assert.equal(st.vistorias.get("v2").status, "sincronizada");
});
