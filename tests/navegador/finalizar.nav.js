import { teste, igual, ok, esperar, esperarAte } from "./runner.js";
import { montarEtapa } from "./apoio.js";
import * as storage from "../../storage.js";
import { novoRascunho, arquivosDaVistoria } from "../../formatos.js";
import { CHECKLIST_ITENS } from "../../config.js";
import { criarEditor } from "../../rascunho.js";
import * as nova from "../../views/nova.js";
import * as etapaAssinaturas from "../../views/etapa-assinaturas.js";

const U = { id: "u-teste", email: "teste@local", nome: "Ana Lima" };

function rascunhoCompleto() {
  const r = novoRascunho(U.id, crypto.randomUUID(), new Date().toISOString());
  Object.assign(r.dados, {
    loja: "PG Prime GWM Natal", chassi: "AB123C", marca: "Fiat", modelo: "Uno", cor: "Prata", km: 1000, combustivel: "Flex",
    fotos: { frente: true, traseira: true, chassi: true },
    checklist: Object.fromEntries(CHECKLIST_ITENS.map((i) => [i, "presente"])),
    semAvarias: true, vistoriadorNome: "Nome Digitado", motoristaNome: "Beto Souza",
    assinaturas: { vistoriador: true, motorista: true },
  });
  return r;
}

function ctxFalso() {
  const navegacoes = [];
  return {
    navegacoes,
    storage,
    auth: { usuarioAtual: () => U },
    sync: { sincronizar: async () => ({}) },
    navegar: (h) => navegacoes.push(h),
    avisar: () => {},
    confirmar: async () => true,
  };
}

teste("finalizar: rascunho completo vira vistoria pendente", async () => {
  await storage.apagarBanco();
  const r = rascunhoCompleto();
  await storage.salvarRascunho(r);
  for (const nome of arquivosDaVistoria({ avarias: [] })) await storage.salvarArquivo(`${r.id}/${nome}`, new Blob([nome]));
  const ctx = ctxFalso();
  const editor = criarEditor({ storage, rascunho: r });
  const id = await nova.finalizar(editor, ctx);
  igual(id, r.id);
  const v = await storage.obterVistoria(id);
  igual(v.status, "pendente");
  ok(Date.now() - new Date(v.realizadaEm).getTime() < 5000, "realizadaEm fora da janela");
  igual(await storage.obterRascunho(r.id), undefined);
  igual(v.vistoriadorNome, "Ana Lima", "o nome do vistoriador deve vir da conta");
  igual(ctx.navegacoes, [`#/vistoria/${id}?nova=1`]);
  editor.alterar((d) => { d.cor = "Azul"; }, { imediato: true });
  await editor.descarregar();
  igual(await storage.obterRascunho(r.id), undefined, "o rascunho voltou depois de finalizar");
});

teste("finalizar: dois toques rápidos em Finalizar gravam e abrem a vistoria uma vez só", async () => {
  await storage.apagarBanco();
  const r = rascunhoCompleto();
  r.etapa = 4;
  await storage.salvarRascunho(r);
  for (const nome of arquivosDaVistoria({ avarias: [] })) await storage.salvarArquivo(`${r.id}/${nome}`, new Blob([nome]));
  const ctx = ctxFalso();
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const view = await nova.montar(el, ctx, { busca: new URLSearchParams(`rascunho=${r.id}`) });
  try {
    await esperar(100);
    const b = el.querySelector("#btn-avancar");
    b.click();
    b.click();
    igual(b.disabled, true, "o botão fica travado enquanto finaliza");
    await esperar(400);
    igual(ctx.navegacoes.length, 1, `navegou ${ctx.navegacoes.length} vezes`);
  } finally {
    view.desmontar();
    el.remove();
    history.replaceState(null, "", location.pathname);
  }
});

teste("finalizar: lista o que falta e leva até o campo", async () => {
  await storage.apagarBanco();
  const r = rascunhoCompleto();
  r.dados.fotos.traseira = false;
  r.dados.motoristaNome = "";
  r.etapa = 4;
  await storage.salvarRascunho(r);
  const ctx = ctxFalso();
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const view = await nova.montar(el, ctx, { busca: new URLSearchParams(`rascunho=${r.id}`) });
  try {
    await esperar(100);
    igual(el.querySelector("h1").textContent.trim(), "Nova vistoria");
    ok(el.querySelector("#nova-sub").textContent.includes("Etapa 4 de 4"), "falta a etapa no subtítulo");
    el.querySelector("#btn-avancar").click();
    await esperar(150);
    const d = document.querySelector("dialog[open]");
    ok(d, "o diálogo Falta preencher não abriu");
    igual(d.querySelector("h2").textContent.trim(), "Falta preencher");
    igual([...d.querySelectorAll(".falta-grupo h3")].map((h) => h.textContent.trim()), ["1 Veículo", "4 Assinaturas"]);
    [...d.querySelectorAll(".falta-item")].find((b) => b.textContent.includes("Falta a foto: Traseira")).click();
    await esperar(300);
    ok(!document.querySelector("dialog[open]"), "o diálogo não fechou");
    igual(el.querySelector("#titulo-dados").textContent.trim(), "Dados do veículo", "deveria voltar à etapa 1");
    igual(document.activeElement?.id, "foto-traseira");
  } finally {
    view.desmontar();
    el.remove();
    history.replaceState(null, "", location.pathname);
  }
});

teste("etapa 4: nome do vistoriador vem da conta e não é editável", async () => {
  const t = await montarEtapa(etapaAssinaturas, { usuario: { id: "u-teste", nome: "Ana Lima" }, preparar: (r) => { r.dados.vistoriadorNome = "Outro"; } });
  try {
    ok(!t.el.querySelector("input#vistoriador-nome"), "o nome do vistoriador não pode ser um campo editável");
    igual(t.el.querySelector("#vistoriador-nome").textContent.trim(), "Ana Lima");
    igual(t.editor.rascunho.dados.vistoriadorNome, "Ana Lima");
    igual(t.el.querySelector("#vistoriador-nome-erro").textContent, "");
  } finally {
    await t.fim();
  }
});

teste("etapa 4: conta sem nome cadastrado mostra o aviso", async () => {
  const t = await montarEtapa(etapaAssinaturas, { usuario: { id: "u-teste", nome: null } });
  try {
    igual(t.editor.rascunho.dados.vistoriadorNome, "");
    ok(/não está cadastrado/.test(t.el.querySelector("#vistoriador-nome-erro").textContent), "falta o aviso de nome não cadastrado");
  } finally {
    await t.fim();
  }
});

teste("etapa 4: assinatura gravada e limpa", async () => {
  const t = await montarEtapa(etapaAssinaturas);
  try {
    ok(!t.el.querySelector("canvas"), "a etapa não deve ter quadro de assinatura embutido");
    const assinar = t.el.querySelector('[data-assinar="vistoriador"]');
    ok(assinar && /Assinar/.test(assinar.textContent), "falta o botão Assinar");

    // Cancelar não grava nada.
    assinar.click();
    ok(await esperarAte(() => document.querySelector("dialog.assinar[open]")), "a tela de assinatura não abriu");
    let tela = document.querySelector("dialog.assinar[open]");
    tela.querySelector('[data-acao="cancelar"]').click();
    await esperarAte(() => !document.querySelector("dialog.assinar"));
    igual(t.editor.rascunho.dados.assinaturas.vistoriador, false);

    assinar.click();
    ok(await esperarAte(() => document.querySelector("dialog.assinar[open]")), "a tela não abriu de novo");
    tela = document.querySelector("dialog.assinar[open]");
    const confirmar = tela.querySelector('[data-acao="confirmar"]');
    ok(confirmar.disabled, "confirmar deve começar desabilitado");
    const canvas = tela.querySelector("canvas");
    const r = canvas.getBoundingClientRect();
    const ev = (tipo, x, y) => canvas.dispatchEvent(new PointerEvent(tipo, { bubbles: true, pointerId: 3, button: 0, buttons: 1, clientX: r.left + x, clientY: r.top + y }));
    ev("pointerdown", 40, 60);
    for (let i = 1; i < 8; i++) ev("pointermove", 40 + i * 25, 60 + (i % 2) * 30);
    ev("pointerup", 220, 80);
    ok(await esperarAte(() => !confirmar.disabled), "confirmar não habilitou após o traço");
    confirmar.click();
    ok(await esperarAte(() => t.editor.rascunho.dados.assinaturas.vistoriador), "assinatura não marcada");
    ok(!document.querySelector("dialog.assinar"), "a tela de assinatura não fechou");
    const png = await t.editor.lerArquivo("assinatura_vistoriador.png");
    ok(png, "PNG da assinatura não gravado");
    igual(png.type, "image/png");
    ok(await esperarAte(() => t.el.querySelector("#vistoriador-assinatura img")?.getAttribute("src")), "prévia não apareceu");
    ok(/Assinar de novo/.test(assinar.textContent), "botão deveria virar Assinar de novo");
    const previa = t.el.querySelector("#vistoriador-assinatura .assinatura-previa").getBoundingClientRect();
    await esperarAte(() => t.el.querySelector("#vistoriador-assinatura img").complete);
    const img = t.el.querySelector("#vistoriador-assinatura img").getBoundingClientRect();
    ok(img.bottom <= previa.bottom && img.right <= previa.right, "a prévia vaza para fora da caixa");
    [...t.el.querySelectorAll("[data-limpar]")].find((b) => b.dataset.limpar === "vistoriador").click();
    ok(await esperarAte(() => t.editor.rascunho.dados.assinaturas.vistoriador === false), "assinatura não foi limpa");
    igual(await t.editor.lerArquivo("assinatura_vistoriador.png"), undefined);
    ok(t.el.querySelector("#motorista-nome") && t.el.querySelector("#motorista-assinatura"), "bloco do motorista ausente");
  } finally {
    await t.fim();
  }
});

teste("nova vistoria: ir e voltar entre as etapas não repete os cliques (um editor, uma assinatura, um erro a menos)", async () => {
  await storage.apagarBanco();
  const r = rascunhoCompleto();
  r.dados.semAvarias = false;
  r.etapa = 1;
  await storage.salvarRascunho(r);
  const confirmacoes = [];
  const ctx = { ...ctxFalso(), confirmar: async (o) => { confirmacoes.push(o.titulo); return false; } };
  const erros = [];
  const pegar = (e) => erros.push(String(e.error || e.message));
  window.addEventListener("error", pegar);
  const el = document.createElement("div");
  document.getElementById("palco").append(el);
  const view = await nova.montar(el, ctx, { busca: new URLSearchParams(`rascunho=${r.id}`) });
  const ir = async (n) => { el.querySelector(`.etapas [data-etapa="${n}"]`).click(); await esperar(120); };
  try {
    await ir(2); await ir(3); await ir(2); await ir(3); await ir(4); await ir(3);
    el.querySelector('[data-acao="adicionar"]').click();
    await esperar(150);
    igual(document.querySelectorAll("dialog[open]").length, 1, "Adicionar avaria abriu mais de um editor");
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    await esperar(80);
    await ir(2);
    el.querySelector('[data-acao="limpar"]').click();
    await esperar(150);
    igual(confirmacoes.length, 1, "Limpar pediu confirmação mais de uma vez");
    await ir(1);
    el.querySelector('#combustivel [data-valor="Diesel"]').click();
    await esperar(80);
    igual(erros, [], "clique na etapa 1 gerou erro de JavaScript");
  } finally {
    window.removeEventListener("error", pegar);
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    view.desmontar();
    el.remove();
    history.replaceState(null, "", location.pathname);
  }
});
