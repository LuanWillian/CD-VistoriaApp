import { teste, igual, ok, esperar, esperarAte } from "./runner.js";
import * as storage from "../../storage.js";
import { novoRascunho } from "../../formatos.js";
import * as inicio from "../../views/inicio.js";
import * as vistorias from "../../views/vistorias.js";

const EU = { id: "u-eu", email: "eu@teste" };

async function montarInicio(desktop) {
  const navegacoes = [];
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  inicio.montar(el, { desktop, navegar: (h) => navegacoes.push(h) });
  return { el, navegacoes, fim: () => el.remove() };
}

teste("menu: app instalado e celular têm os dois cartões e Iniciar vistoria abre #/nova", async () => {
  const t = await montarInicio(false);
  try {
    ok(t.el.querySelector("#btn-iniciar"), "falta o cartão Iniciar vistoria");
    ok(t.el.querySelector("#btn-vistorias"), "falta o cartão Vistorias");
    t.el.querySelector("#btn-iniciar").click();
    t.el.querySelector("#btn-vistorias").click();
    igual(t.navegacoes, ["#/nova", "#/vistorias"]);
  } finally {
    t.fim();
  }
});

teste("painel (computador): tabela com as vistorias, linha e botão abrem os detalhes e não existe Iniciar vistoria", async () => {
  await storage.apagarBanco();
  const navegacoes = [];
  const v = (id, extra) => ({ ...novoRascunho(EU.id, id, "2026-11-08T10:00:00.000Z"), id, userId: EU.id, realizadaEm: "2026-11-08T10:00:00.000Z", status: "sincronizada", numero: "VIS-00000" + id, chassi: "AB123C", marca: "Jeep", modelo: "<i>Compass</i>", ...extra });
  await storage.salvarVistoria(v("1"));
  await storage.salvarVistoria(v("2", { status: "pendente", realizadaEm: "2026-11-09T10:00:00.000Z" }));
  const ctx = {
    desktop: true, storage, auth: { usuarioAtual: () => EU }, online: () => false, navegar: (h) => navegacoes.push(h),
    sync: { eventos: new EventTarget(), sincronizar: async () => ({}) }, remoto: {},
  };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const tela = await inicio.montar(el, ctx);
  await esperar(150);
  try {
    igual(el.querySelector("#btn-iniciar"), null, "o botão não pode existir");
    igual(el.querySelector("#btn-vistorias"), null, "o cartão único some no computador");
    ok(!el.textContent.includes("Iniciar vistoria") && !el.textContent.includes("Nova vistoria"));
    igual(el.querySelectorAll('a[href^="#/nova"]').length, 0);
    const linhas = [...el.querySelectorAll("#dash-corpo tr")];
    igual(linhas.length, 2);
    ok(linhas[0].textContent.includes("VIS-000002"), "a mais recente vem primeiro");
    igual(el.querySelector("#dash-corpo i"), null, "texto digitado não vira HTML");
    igual(el.querySelector(".dash-metrica"), null, "os cartões de resumo foram removidos");
    igual(el.querySelector("#dash-contador").textContent, "Mostrando 1–2 de 2");
    linhas[0].querySelector("td").click();
    linhas[0].querySelector("a").click();
    igual(navegacoes, ["#/vistoria/2"], "a linha navega; o botão é um link e não navega duas vezes");
  } finally {
    history.replaceState(null, "", location.pathname);
    tela?.desmontar?.();
    el.remove();
  }
});

async function montarLista(desktop) {
  await storage.apagarBanco();
  const r = novoRascunho(EU.id, "r1", new Date().toISOString());
  r.dados.chassi = "AB123C";
  await storage.salvarRascunho(r);
  const ctx = {
    desktop, storage, auth: { usuarioAtual: () => EU }, online: () => true, avisar: () => {}, confirmar: async () => true,
    sync: { eventos: new EventTarget(), sincronizar: async () => ({}) },
    remoto: { listarVistorias: async () => ({ itens: [], temMais: false }), urlsAssinadas: async () => new Map() },
  };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const tela = await vistorias.montar(el, ctx);
  await esperar(150);
  return { el, fim: () => { tela?.desmontar?.(); el.remove(); } };
}

teste("lista: no computador não há rascunho, 'Continuar' nem 'Fazer a primeira vistoria' (nenhum link para #/nova)", async () => {
  const t = await montarLista(true);
  try {
    igual(t.el.querySelectorAll('a[href^="#/nova"]').length, 0, "há link para #/nova no computador");
    igual(t.el.querySelector("#rascunhos").hidden, true);
    ok(t.el.textContent.includes("Nenhuma vistoria ainda"), "o estado vazio deveria aparecer");
  } finally {
    t.fim();
  }
});

teste("lista: no app e no celular continuam o rascunho com Continuar e o link para a primeira vistoria", async () => {
  const t = await montarLista(false);
  try {
    const links = [...t.el.querySelectorAll('a[href^="#/nova"]')].map((a) => a.getAttribute("href"));
    ok(links.includes("#/nova?rascunho=r1"), `faltou Continuar; links: ${links}`);
    ok(links.includes("#/nova?novo=1"), `faltou 'Fazer a primeira vistoria'; links: ${links}`);
  } finally {
    t.fim();
  }
});

teste("menu da conta de loja: só o cartão Recebimentos, com a contagem, em qualquer aparelho", async () => {
  const LOJA = { id: "u-loja", email: "loja@teste", nome: "Davi Loja", papel: "loja", loja: "PG Prime BMW Natal" };
  for (const desktop of [false, true]) {
    const navegacoes = [];
    const el = document.createElement("div");
    document.getElementById("palco").append(el);
    const ctx = {
      desktop, online: () => true, auth: { usuarioAtual: () => LOJA }, navegar: (h) => navegacoes.push(h),
      remoto: { listarParaLoja: async () => [
        { id: "a", realizadaEm: "2026-11-10T10:00:00.000Z", loja: LOJA.loja, recebimento: null },
        { id: "b", realizadaEm: "2026-11-11T10:00:00.000Z", loja: LOJA.loja, recebimento: null },
      ] },
    };
    try {
      inicio.montar(el, ctx);
      await esperarAte(() => el.textContent.includes("2 a receber"));
      ok(el.querySelector("#btn-recebimentos"), "falta o cartão Recebimentos");
      igual(el.querySelector("#btn-iniciar"), null);
      igual(el.querySelector("#btn-vistorias"), null);
      igual(el.querySelector(".dashboard-desktop"), null, "conta de loja não vê o painel do CD");
      el.querySelector("#btn-recebimentos").click();
      igual(navegacoes, ["#/recebimentos"]);
    } finally {
      el.remove();
    }
  }
});

teste("menu da conta de loja sem internet continua sendo o de loja", async () => {
  const LOJA = { id: "u-loja", email: "loja@teste", nome: "Davi Loja", papel: "loja", loja: "PG Prime BMW Natal" };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  let chamou = false;
  try {
    inicio.montar(el, { desktop: false, online: () => false, auth: { usuarioAtual: () => LOJA }, navegar: () => {},
      remoto: { listarParaLoja: async () => { chamou = true; return []; } } });
    await esperar(50);
    ok(el.querySelector("#btn-recebimentos"), "o menu de loja sumiu sem internet");
    igual(el.querySelector("#btn-iniciar"), null);
    igual(chamou, false, "sem internet não consulta o servidor");
  } finally {
    el.remove();
  }
});
