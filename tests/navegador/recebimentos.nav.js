import { teste, igual, ok, esperar } from "./runner.js";
import * as recebimentos from "../../views/recebimentos.js";

const LOJA = { id: "u-loja", email: "loja@teste", nome: "Davi Loja", papel: "loja", loja: "PG Prime BMW Natal" };
const base = { userId: "u-v", status: "sincronizada", loja: "PG Prime BMW Natal", recebimento: null, marca: "BMW", modelo: "X1" };
const recebido = (status, quando) => ({
  id: `r-${quando}`, userId: "u-loja", status, recebedorNome: "Davi Loja", loja: "PG Prime BMW Natal", recebidoEm: quando,
  descricao: status === "divergencia" ? "x" : "", assinatura: "p", fotos: [],
});
const ITENS = [
  { ...base, id: "a", numero: "VIS-000001", chassi: "AAA111", realizadaEm: "2026-11-11T10:00:00.000Z" },
  { ...base, id: "b", numero: "VIS-000002", chassi: "778699", marca: "BAIC", modelo: "<i>Xr5</i>", realizadaEm: "2026-11-09T10:00:00.000Z" },
  { ...base, id: "c", numero: "VIS-000003", chassi: "CCC333", realizadaEm: "2026-11-08T10:00:00.000Z", recebimento: recebido("conforme", "2026-11-10T10:00:00.000Z") },
];

async function montar({ usuario = LOJA, online = true, itens = ITENS } = {}) {
  let chamadas = 0;
  const navegacoes = [];
  const ctx = {
    online: () => online, auth: { usuarioAtual: () => usuario }, navegar: (h) => navegacoes.push(h),
    remoto: {
      listarParaLoja: async () => { chamadas++; return itens; },
      urlsAssinadas: async () => new Map(),
      classificarErro: () => ({ mensagem: "Sem conexão com o servidor." }),
    },
  };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const tela = await recebimentos.montar(el, ctx);
  await esperar(80);
  return { el, navegacoes, chamadas: () => chamadas, fim: () => { tela?.desmontar?.(); el.remove(); } };
}

const abas = (el) => [...el.querySelectorAll('[role="tab"]')].map((a) => a.textContent.trim());
const cartoes = (el) => [...el.querySelectorAll("#receb-lista a[href^='#/recebimento/']")].map((a) => a.getAttribute("href"));

teste("recebimentos: abas com contagem; A receber com as mais antigas primeiro", async () => {
  const t = await montar();
  try {
    igual(abas(t.el), ["A receber (2)", "Recebidos (1)"]);
    igual(cartoes(t.el), ["#/recebimento/b", "#/recebimento/a"]);
    igual(t.el.querySelector("#receb-lista i"), null, "texto com HTML não vira tag");
    t.el.querySelectorAll('[role="tab"]')[1].click();
    igual(cartoes(t.el), ["#/recebimento/c"]);
    ok(t.el.querySelector("#receb-lista .selo-receb-conforme"), "falta o selo Conforme");
    ok(t.el.querySelector("#receb-lista").textContent.includes("Davi Loja"), "falta quem recebeu");
  } finally {
    t.fim();
  }
});

teste("recebimentos: busca pelo chassi", async () => {
  const t = await montar();
  try {
    const busca = t.el.querySelector("#receb-busca");
    igual(busca.getAttribute("placeholder"), "Buscar pelo chassi...");
    busca.value = "7786";
    busca.dispatchEvent(new Event("input"));
    await esperar(300);
    igual(cartoes(t.el), ["#/recebimento/b"]);
    busca.value = "zzz";
    busca.dispatchEvent(new Event("input"));
    await esperar(300);
    ok(t.el.textContent.includes("Nenhum carro encontrado para essa busca."), "falta o aviso de busca vazia");
  } finally {
    t.fim();
  }
});

teste("recebimentos: listas vazias", async () => {
  const t = await montar({ itens: [] });
  try {
    ok(t.el.textContent.includes("Nenhum carro a receber."));
    t.el.querySelectorAll('[role="tab"]')[1].click();
    ok(t.el.textContent.includes("Nenhum carro recebido ainda."));
  } finally {
    t.fim();
  }
});

teste("recebimentos: sem internet não consulta e avisa", async () => {
  const t = await montar({ online: false });
  try {
    ok(t.el.textContent.includes("Sem internet. Os recebimentos precisam de conexão."));
    igual(t.chamadas(), 0);
  } finally {
    t.fim();
  }
});

teste("recebimentos: conta de loja sem loja cadastrada", async () => {
  const t = await montar({ usuario: { ...LOJA, loja: null } });
  try {
    ok(t.el.textContent.includes("Sua conta não tem loja cadastrada. Peça ao administrador."));
    igual(t.chamadas(), 0);
  } finally {
    t.fim();
  }
});
