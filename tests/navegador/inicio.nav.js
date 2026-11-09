import { teste, igual, ok, esperar } from "./runner.js";
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

teste("menu: no computador só o cartão Vistorias, e Iniciar vistoria nem existe na página", async () => {
  const t = await montarInicio(true);
  try {
    igual(t.el.querySelector("#btn-iniciar"), null, "o botão não pode existir (nem escondido)");
    igual([...t.el.querySelectorAll("button")].map((b) => b.id), ["btn-vistorias"]);
    ok(!t.el.textContent.includes("Iniciar vistoria"), "o texto Iniciar vistoria não pode aparecer");
    igual(t.el.querySelectorAll(".card-icon").length, 1);
    ok(t.el.querySelector(".icon-gray"), "o ícone do cartão Vistorias (cinza) continua");
    t.el.querySelector("#btn-vistorias").click();
    igual(t.navegacoes, ["#/vistorias"]);
  } finally {
    t.fim();
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
