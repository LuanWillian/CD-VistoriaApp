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
    igual(el.querySelector("#dash-contador").textContent, "1–2 de 2 · 25 por página");
    linhas[0].querySelector("td").click();
    linhas[0].querySelector("a").click();
    igual(navegacoes, ["#/vistoria/2"], "a linha navega; o botão é um link e não navega duas vezes");
  } finally {
    history.replaceState(null, "", location.pathname);
    tela?.desmontar?.();
    el.remove();
  }
});

async function montarLista(desktop, itensRemotos = []) {
  await storage.apagarBanco();
  const r = novoRascunho(EU.id, "r1", new Date().toISOString());
  r.dados.chassi = "AB123C";
  await storage.salvarRascunho(r);
  const ctx = {
    desktop, storage, auth: { usuarioAtual: () => EU }, online: () => true, avisar: () => {}, confirmar: async () => true,
    sync: { eventos: new EventTarget(), sincronizar: async () => ({}) },
    remoto: { listarVistorias: async () => ({ itens: itensRemotos, temMais: false }), urlsAssinadas: async () => new Map() },
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

teste("lista do celular: cada cartão mostra o selo do recebimento na loja", async () => {
  const base = { userId: "u-outro", realizadaEm: "2026-11-10T10:00:00.000Z", status: "sincronizada", origem: "remota", completa: false, chassi: "AB123C", marca: "BMW", modelo: "X1", avariasQtd: 0 };
  const t = await montarLista(false, [
    { ...base, id: "a", numero: "VIS-1", loja: "PG Prime BMW Natal", recebimento: null },
    { ...base, id: "b", numero: "VIS-2", loja: "PG Prime BMW Natal", recebimento: { id: "r", userId: "u", status: "divergencia", recebedorNome: "Davi", loja: "PG Prime BMW Natal", recebidoEm: "2026-11-11T10:00:00.000Z", descricao: "x", assinatura: "p", fotos: [] } },
    { ...base, id: "c", numero: "VIS-3", loja: "", recebimento: null },
  ]);
  try {
    const cartao = (id) => t.el.querySelector(`a[href="#/vistoria/${id}"]`).closest("article");
    ok(cartao("a").querySelector(".selo-receb-aguardando"), "falta Aguardando recebimento");
    ok(cartao("b").querySelector(".selo-receb-divergencia"), "falta Com divergência");
    igual(cartao("c").querySelector("[class*='selo-receb']"), null, "vistoria sem loja não tem selo de recebimento");
  } finally {
    t.fim();
  }
});

teste("painel (computador): coluna Recebimento e filtro de recebimento", async () => {
  await storage.apagarBanco();
  const v = (id, extra) => ({ ...novoRascunho(EU.id, id, "2026-11-08T10:00:00.000Z"), id, userId: EU.id, realizadaEm: "2026-11-08T10:00:00.000Z", status: "sincronizada", numero: "VIS-00000" + id, chassi: "AB123C", marca: "Jeep", modelo: "Compass", loja: "PG Prime BMW Natal", ...extra });
  await storage.salvarVistoria(v("1", { recebimento: null }));
  await storage.salvarVistoria(v("2", { recebimento: { id: "r", userId: "u", status: "divergencia", recebedorNome: "D", loja: "PG Prime BMW Natal", recebidoEm: "2026-11-09T10:00:00.000Z", descricao: "x", assinatura: "p", fotos: [] } }));
  const ctx = {
    desktop: true, storage, auth: { usuarioAtual: () => EU }, online: () => false, navegar: () => {},
    sync: { eventos: new EventTarget(), sincronizar: async () => ({}) }, remoto: {},
  };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const tela = await inicio.montar(el, ctx);
  await esperar(150);
  try {
    ok([...el.querySelectorAll(".cb-tabela-vistorias th")].some((th) => th.textContent.trim() === "Recebimento"), "falta a coluna Recebimento");
    ok(el.querySelector("#dash-corpo .selo-receb-aguardando"), "falta o selo Aguardando");
    ok(el.querySelector("#dash-corpo .selo-receb-divergencia"), "falta o selo Com divergência");
    const sel = el.querySelector("#dash-recebimento");
    igual([...sel.options].map((o) => o.text), ["Recebimento", "Recebimento: Aguardando", "Recebimento: Conforme", "Recebimento: Com divergência"]);
    sel.value = "divergencia";
    sel.dispatchEvent(new Event("change"));
    igual(el.querySelectorAll("#dash-corpo tr").length, 1);
  } finally {
    tela?.desmontar?.();
    el.remove();
  }
});

teste("painel (computador): resumo, filtro pelo resumo, X da pílula e seleção de linhas", async () => {
  await storage.apagarBanco();
  const agora = new Date().toISOString();
  const v = (id, extra) => ({ ...novoRascunho(EU.id, id, agora), id, userId: EU.id, realizadaEm: agora, status: "sincronizada", numero: "VIS-00000" + id, chassi: "AB123C", marca: "Jeep", modelo: "Compass", loja: "PG Prime BMW Natal", ...extra });
  await storage.salvarVistoria(v("1", { recebimento: null }));
  await storage.salvarVistoria(v("2", { recebimento: { id: "r", userId: "u", status: "divergencia", recebedorNome: "D", loja: "PG Prime BMW Natal", recebidoEm: agora, descricao: "x", assinatura: "p", fotos: [] } }));
  await storage.salvarVistoria(v("3", { status: "pendente", loja: "" }));
  const ctx = {
    desktop: true, storage, auth: { usuarioAtual: () => EU }, online: () => false, navegar: () => {},
    sync: { eventos: new EventTarget(), sincronizar: async () => ({}) }, remoto: {},
  };
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const tela = await inicio.montar(el, ctx);
  await esperar(150);
  const texto = (id) => el.querySelector(id).textContent;
  try {
    igual([texto("#dash-r-hoje"), texto("#dash-r-aguardando"), texto("#dash-r-divergencia"), texto("#dash-r-pendentes"), texto("#dash-r-total")], ["3", "1", "1", "1", "3"]);
    // Resumo "Com divergência" liga o filtro; a pílula mostra o filtro e fica ativa.
    el.querySelector('[data-receb="divergencia"]').click();
    igual(el.querySelector("#dash-recebimento").value, "divergencia");
    const pilula = el.querySelector("#dash-recebimento").closest("[data-pilula]");
    ok(pilula.hasAttribute("data-ativa"), "a pílula deveria ficar ativa");
    igual(pilula.querySelector(".cb-pilula-texto").textContent, "Recebimento: Com divergência");
    igual(el.querySelectorAll("#dash-corpo tr").length, 1);
    // O X da pílula limpa o filtro.
    pilula.querySelector("[data-fechar-pilula]").click();
    igual(el.querySelector("#dash-recebimento").value, "");
    igual(pilula.hasAttribute("data-ativa"), false);
    igual(el.querySelectorAll("#dash-corpo tr").length, 3);
    // Seleção: barra aparece com a contagem; a caixa do cabeçalho marca a página toda.
    ok(el.querySelector("#dash-selecao").hidden, "barra de seleção deveria começar escondida");
    const caixa = el.querySelector("#dash-corpo [data-sel]");
    caixa.checked = true;
    caixa.dispatchEvent(new Event("change", { bubbles: true }));
    igual(el.querySelector("#dash-selecao").hidden, false);
    igual(texto("#dash-selecionadas"), "1 selecionada");
    ok(caixa.closest("tr").classList.contains("cb-marcada"));
    const todas = el.querySelector("#dash-sel-pagina");
    todas.checked = true;
    todas.dispatchEvent(new Event("change"));
    igual(texto("#dash-selecionadas"), "3 selecionadas");
    igual(texto("#dash-pdf-lote"), "Baixar 3 PDFs");
  } finally {
    tela?.desmontar?.();
    el.remove();
  }
});
