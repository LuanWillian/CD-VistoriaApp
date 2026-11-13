import { test } from "node:test";
import assert from "node:assert/strict";
import {
  linhaDaVistoria, linhasDasAvarias, linhasDasFotos, vistoriaDaLinha, itemDoDashboard, classificarErro, escaparBusca, criarRemoto,
  recebimentoDaLinha, linhaDoRecebimento,
} from "../supabase.js";

const v = {
  id: "v1", userId: "u1", loja: "PG Prime BMW Natal", chassi: "AB123C", marca: "Fiat", modelo: "Uno", cor: "Prata", km: 1000,
  combustivel: "Flex", checklist: { Antena: "presente" }, checklistObs: "", semAvarias: false,
  vistoriadorNome: "Ana", motoristaNome: "Beto", realizadaEm: "2026-11-07T13:00:00.000Z",
  avarias: [{ id: "d1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: "x", fotos: ["f1"] }],
};

test("linha da vistoria em snake_case com caminhos no bucket e sem número", () => {
  assert.deepEqual(linhaDaVistoria(v), {
    id: "v1", user_id: "u1", loja: "PG Prime BMW Natal", chassi: "AB123C", marca: "Fiat", modelo: "Uno", cor: "Prata", km: 1000,
    combustivel: "Flex", checklist: { Antena: "presente" }, checklist_obs: "", sem_avarias: false,
    vistoriador_nome: "Ana", motorista_nome: "Beto", realizada_em: "2026-11-07T13:00:00.000Z",
    foto_frente: "u1/v1/frente.jpg", foto_traseira: "u1/v1/traseira.jpg", foto_chassi: "u1/v1/chassi.jpg",
    assinatura_vistoriador: "u1/v1/assinatura_vistoriador.png", assinatura_motorista: "u1/v1/assinatura_motorista.png",
  });
  assert.equal("numero" in linhaDaVistoria(v), false);
  assert.equal(linhaDaVistoria({ ...v, loja: "" }).loja, null, "sem loja vai como null");
});

test("linha do dashboard: só os campos dos indicadores, com as avarias", () => {
  const item = itemDoDashboard({
    id: "v1", numero: "VIS-1", realizada_em: "2026-11-07T13:00:00+00:00", chassi: "AB123C", marca: "Jeep", modelo: "Compass",
    loja: null, damages: [{ area: "Capô", tipo: "Risco", gravidade: "Leve" }],
  });
  assert.deepEqual(item, {
    id: "v1", numero: "VIS-1", realizadaEm: "2026-11-07T13:00:00.000Z", chassi: "AB123C", marca: "Jeep", modelo: "Compass",
    loja: "", recebimento: null, avarias: [{ area: "Capô", tipo: "Risco", gravidade: "Leve" }],
  });
});

test("loja vem do banco; vistoria antiga sem loja fica vazia", () => {
  const base = { id: "v1", user_id: "u1", numero: "VIS-1", realizada_em: "2026-11-07T13:00:00Z", chassi: "AB123C", marca: "Fiat", modelo: "Uno" };
  assert.equal(vistoriaDaLinha({ ...base, loja: "PG Prime Audi Natal" }).loja, "PG Prime Audi Natal");
  assert.equal(vistoriaDaLinha({ ...base, loja: null }).loja, "");
});

test("linhas de avarias e de fotos de avaria", () => {
  assert.deepEqual(linhasDasAvarias(v), [{ id: "d1", inspection_id: "v1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: "x" }]);
  assert.deepEqual(linhasDasFotos(v), [{ id: "f1", damage_id: "d1", path: "u1/v1/avaria_f1.jpg" }]);
});

test("linha da lista vira vistoria remota incompleta com contagem de avarias", () => {
  const lista = vistoriaDaLinha({
    id: "v1", user_id: "u1", numero: "VIS-000001", realizada_em: "2026-11-07T13:00:00+00:00",
    chassi: "AB123C", marca: "Fiat", modelo: "Uno", foto_frente: "u1/v1/frente.jpg", damages: [{ count: 2 }],
  });
  assert.equal(lista.origem, "remota");
  assert.equal(lista.completa, false);
  assert.equal(lista.avariasQtd, 2);
  assert.equal(lista.status, "sincronizada");
  assert.equal(lista.realizadaEm, "2026-11-07T13:00:00.000Z");
  assert.equal(lista.userId, "u1");
});

test("linha completa traz avarias com os ids das fotos", () => {
  const completa = vistoriaDaLinha({
    ...linhaDaVistoria(v), numero: "VIS-000001", realizada_em: "2026-11-07T13:00:00+00:00",
    damages: [{ id: "d1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: null, damage_photos: [{ id: "f1", path: "u1/v1/avaria_f1.jpg" }] }],
  });
  assert.equal(completa.completa, true);
  assert.deepEqual(completa.avarias, [{ id: "d1", area: "Capô", tipo: "Risco", gravidade: "Leve", descricao: "", fotos: ["f1"] }]);
  assert.equal(completa.avariasQtd, 1);
  assert.equal(completa.km, 1000);
  assert.equal(completa.vistoriadorNome, "Ana");
});

test("classificação de erros", () => {
  assert.equal(classificarErro(new TypeError("Failed to fetch")).tipo, "rede");
  assert.equal(classificarErro({ name: "AuthRetryableFetchError" }).tipo, "rede");
  assert.equal(classificarErro({ status: 503 }).tipo, "rede");
  assert.equal(classificarErro({ status: 429 }).tipo, "rede");
  assert.equal(classificarErro({ status: 401 }).tipo, "sessao");
  assert.equal(classificarErro({ code: "PGRST301" }).tipo, "sessao");
  assert.equal(classificarErro({ code: "42501", message: "new row violates row-level security" }).tipo, "servidor");
  assert.equal(classificarErro({ status: 400 }, false).tipo, "rede");
  assert.match(classificarErro({ code: "23514" }).mensagem, /recusou/);
  assert.equal(classificarErro(new TypeError("Failed to fetch")).mensagem, "Sem conexão com o servidor.");
  assert.equal(classificarErro({ status: 401 }).mensagem, "Sua sessão expirou. Entre novamente para enviar as vistorias pendentes.");
});

test("busca sem caracteres que quebram o filtro or()", () => {
  assert.equal(escaparBusca(" Gol, (G5) 100%* "), "Gol G5 100");
  assert.equal(escaparBusca('a"b\\c'), "a b c");
});

function clienteFalso(chamadas, arquivos, { apagadas = null } = {}) {
  return {
    auth: {},
    from: (tabela) => ({
      delete: () => ({
        eq: (coluna, valor) => ({
          select: async (campos) => {
            chamadas.push(`delete ${tabela} ${coluna}=${valor}`);
            return { data: apagadas ?? [{ [campos]: valor }], error: null };
          },
        }),
      }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: apagadas && apagadas.length === 0 ? { id: "v1" } : null, error: null }) }),
      }),
    }),
    storage: {
      from: (bucket) => ({
        list: async (pasta) => {
          chamadas.push(`list ${bucket} ${pasta}`);
          return { data: arquivos, error: null };
        },
        remove: async (caminhos) => {
          chamadas.push(`remove ${bucket} ${caminhos.join(",")}`);
          return { data: [], error: null };
        },
      }),
    },
  };
}

test("excluirVistoriaRemota apaga a linha e depois os arquivos", async () => {
  const chamadas = [];
  const remoto = criarRemoto({ url: "u", chave: "k", criarCliente: () => clienteFalso(chamadas, [{ name: "frente.jpg" }, { name: "chassi.jpg" }]) });
  await remoto.excluirVistoriaRemota("u1", "v1");
  assert.deepEqual(chamadas, ["delete inspections id=v1", "list vistorias u1/v1", "remove vistorias u1/v1/frente.jpg,u1/v1/chassi.jpg"]);
});

test("excluirVistoriaRemota sem arquivos não chama remove", async () => {
  const chamadas = [];
  const remoto = criarRemoto({ url: "u", chave: "k", criarCliente: () => clienteFalso(chamadas, []) });
  await remoto.excluirVistoriaRemota("u1", "v1");
  assert.deepEqual(chamadas, ["delete inspections id=v1", "list vistorias u1/v1"]);
});

test("excluirVistoriaRemota: se o banco recusar sem erro (0 linhas e a vistoria continua lá), avisa e não apaga os arquivos", async () => {
  const chamadas = [];
  const remoto = criarRemoto({ url: "u", chave: "k", criarCliente: () => clienteFalso(chamadas, [{ name: "frente.jpg" }], { apagadas: [] }) });
  const e = await remoto.excluirVistoriaRemota("u1", "v1").catch((err) => err);
  assert.equal(classificarErro(e).tipo, "servidor");
  assert.match(classificarErro(e).mensagem, /permissão negada/);
  assert.deepEqual(chamadas, ["delete inspections id=v1"]);
});

test("sair offline (signOut com erro) apaga a sessão salva e para a renovação", async () => {
  const guardado = new Map([["sb-127-auth-token", "x"], ["sb-127-auth-token-code-verifier", "y"], ["outra-chave", "z"]]);
  const anterior = globalThis.localStorage;
  globalThis.localStorage = {
    get length() { return guardado.size; },
    key: (i) => [...guardado.keys()][i] ?? null,
    removeItem: (k) => guardado.delete(k),
  };
  let parou = false;
  const cliente = { auth: { signOut: async () => ({ error: { name: "AuthRetryableFetchError", status: 0 } }), stopAutoRefresh: () => { parou = true; } } };
  try {
    await criarRemoto({ url: "u", chave: "k", criarCliente: () => cliente }).sair();
    assert.deepEqual([...guardado.keys()], ["outra-chave"]);
    assert.equal(parou, true);
  } finally {
    globalThis.localStorage = anterior;
  }
});

test("listarTodasVistorias busca em blocos de 1000 até acabar, sem teto (2500 vistorias = 3 blocos)", async () => {
  const total = 2500;
  const faixas = [];
  const linha = (i) => ({ id: `v${i}`, user_id: "u1", numero: `VIS-${i}`, realizada_em: "2026-11-07T13:00:00Z", chassi: "AB123C", marca: "Jeep", modelo: "Compass", loja: null, foto_frente: "x", damages: [{ count: 0 }] });
  const consulta = {
    select() { return this; },
    order() { return this; },
    async range(de, ate) {
      faixas.push([de, ate]);
      return { data: Array.from({ length: Math.max(0, Math.min(ate, total - 1) - de + 1) }, (_, k) => linha(de + k)), error: null };
    },
  };
  const remoto = criarRemoto({ url: "u", chave: "k", criarCliente: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => consulta, storage: { from: () => ({}) } }) });
  const itens = await remoto.listarTodasVistorias();
  assert.equal(itens.length, total);
  assert.deepEqual(faixas, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(itens[2499].id, "v2499");
});

// ---------- Recebimento na loja ----------
const linhaReceb = {
  id: "r1", inspection_id: "v1", user_id: "uL", recebedor_nome: "João Silva", loja: "PG Prime BMW Natal",
  status: "divergencia", descricao: "Risco novo", assinatura: "uL/v1/receb_assinatura.png", recebido_em: "2026-11-12T14:05:00+00:00",
  recebimento_fotos: [{ id: "f1", path: "uL/v1/receb_f1.jpg" }],
};
const recebEsperado = {
  id: "r1", userId: "uL", status: "divergencia", recebedorNome: "João Silva", loja: "PG Prime BMW Natal",
  recebidoEm: "2026-11-12T14:05:00.000Z", descricao: "Risco novo", assinatura: "uL/v1/receb_assinatura.png", fotos: ["f1"],
};

test("recebimento do banco: objeto, lista de um ou nada", () => {
  assert.deepEqual(recebimentoDaLinha(linhaReceb), recebEsperado);
  assert.deepEqual(recebimentoDaLinha([linhaReceb]), recebEsperado);
  assert.equal(recebimentoDaLinha(null), null);
  assert.equal(recebimentoDaLinha([]), null);
  assert.deepEqual(recebimentoDaLinha({ ...linhaReceb, descricao: null, recebimento_fotos: undefined }).fotos, []);
});

test("linha do recebimento para o banco: sem nome, loja nem data (o servidor preenche)", () => {
  assert.deepEqual(linhaDoRecebimento({ id: "r1", status: "conforme", descricao: "  ", assinatura: "uL/v1/receb_assinatura.png" }, "v1"),
    { id: "r1", inspection_id: "v1", status: "conforme", descricao: null, assinatura: "uL/v1/receb_assinatura.png" });
});

test("vistoria e item do dashboard trazem o recebimento", () => {
  const base = { id: "v1", user_id: "u1", numero: "VIS-1", realizada_em: "2026-11-07T13:00:00Z", chassi: "AB123C", marca: "Fiat", modelo: "Uno" };
  assert.deepEqual(vistoriaDaLinha({ ...base, recebimentos: linhaReceb }).recebimento, recebEsperado);
  assert.equal(vistoriaDaLinha(base).recebimento, null);
  assert.deepEqual(itemDoDashboard({ ...base, recebimentos: [linhaReceb] }).recebimento, recebEsperado);
});

test("vistoria excluída pelo CD (23503) tem mensagem própria", () => {
  assert.equal(classificarErro({ code: "23503" }).mensagem, "Esta vistoria foi excluída pelo CD.");
  assert.equal(classificarErro({ code: "23503" }).tipo, "servidor");
});

test("obterPerfil devolve nome, papel e loja", async () => {
  const pedidos = [];
  const cliente = {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (tabela) => ({
      select: (campos) => ({
        eq: (col, val) => ({
          maybeSingle: async () => {
            pedidos.push([tabela, campos, col, val]);
            return { data: { nome: "Davi Loja", papel: "loja", loja: "PG Prime BMW Natal" }, error: null };
          },
        }),
      }),
    }),
    storage: { from: () => ({}) },
  };
  const remoto = criarRemoto({ url: "u", chave: "k", criarCliente: () => cliente });
  assert.deepEqual(await remoto.obterPerfil("uL"), { nome: "Davi Loja", papel: "loja", loja: "PG Prime BMW Natal" });
  assert.deepEqual(pedidos, [["perfis", "nome, papel, loja", "id", "uL"]]);
});

test("excluirVistoriaRemota também apaga os arquivos do recebimento na pasta da loja", async () => {
  const chamadas = [];
  const remoto = criarRemoto({ url: "u", chave: "k", criarCliente: () => clienteFalso(chamadas, [{ name: "frente.jpg" }]) });
  await remoto.excluirVistoriaRemota("u1", "v1", { donoRecebimento: "uL" });
  assert.deepEqual(chamadas, [
    "delete inspections id=v1", "list vistorias u1/v1", "remove vistorias u1/v1/frente.jpg",
    "list vistorias uL/v1", "remove vistorias uL/v1/frente.jpg",
  ]);
});

test("lista do celular (listarVistorias) traz o recebimento de cada vistoria", async () => {
  let campos = "";
  const consulta = {
    select(c) { campos = c; return this; },
    order() { return this; }, or() { return this; }, gte() { return this; }, lt() { return this; },
    async range() {
      return { data: [{ id: "v1", user_id: "u1", numero: "VIS-45", realizada_em: "2026-11-12T10:31:00Z", chassi: "AB123C", marca: "BMW", modelo: "X7",
        loja: "PG Prime BMW Natal", foto_frente: "x", damages: [{ count: 0 }], recebimentos: linhaReceb }], error: null };
    },
  };
  const remoto = criarRemoto({ url: "u", chave: "k", criarCliente: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => consulta, storage: { from: () => ({}) } }) });
  const { itens } = await remoto.listarVistorias({});
  assert.match(campos, /recebimentos\(/);
  assert.equal(itens[0].recebimento.status, "divergencia");
});
