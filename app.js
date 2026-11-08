// Inicialização do app: configuração, login, rotas por hash, barra de abas,
// indicador de conexão e gatilhos da sincronização.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env.js";
import * as storage from "./storage.js";
import { criarRemoto } from "./supabase.js";
import { criarAuth } from "./auth.js";
import { criarSincronizador } from "./sync.js";
import { DIAS_CACHE_FOTOS } from "./config.js";
import { $, $$, esc, icone, avisar, confirmar } from "./ui.js";
import * as viewLogin from "./views/login.js";
import * as viewNova from "./views/nova.js";
import * as viewVistorias from "./views/vistorias.js";
import * as viewDetalhe from "./views/detalhe.js";

const VIEWS = { nova: viewNova, vistorias: viewVistorias, detalhe: viewDetalhe };
const main = $("#main");
const online = () => navigator.onLine;

let ctx = null;
let viewAtual = null;
let hashAtual = null;
let ignorarHash = false;
let tokenRender = 0;
let noApp = false;

// ---------- Telas especiais ----------
function telaMensagem(titulo, texto) {
  document.body.classList.add("sem-abas");
  main.innerHTML = `
    <div class="tela-centro"><div class="pilha">
      ${icone("alerta", "ic ic-lg")}
      <h1 class="titulo">${esc(titulo)}</h1>
      <p class="texto-2">${esc(texto)}</p>
    </div></div>`;
}

const envConfigurado = () =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) && !SUPABASE_URL.includes("SEU-PROJETO") && !SUPABASE_ANON_KEY.includes("SUA-ANON-KEY");

// ---------- Rotas ----------
function lerRota() {
  const [caminho, qs] = (location.hash.slice(1) || "/nova").split("?");
  const busca = new URLSearchParams(qs || "");
  const m = caminho.match(/^\/vistoria\/([\w-]+)$/);
  if (m) return { nome: "detalhe", params: { id: m[1], busca } };
  if (caminho === "/vistorias") return { nome: "vistorias", params: { busca } };
  return { nome: "nova", params: { busca } };
}

function marcarAba(nome) {
  const aba = nome === "detalhe" ? "vistorias" : nome;
  $$(".aba").forEach((a) => {
    if (a.dataset.aba === aba) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

async function renderizar() {
  const token = ++tokenRender;
  try { viewAtual?.desmontar?.(); } catch (e) { console.error(e); }
  viewAtual = null;
  document.body.classList.remove("com-acoes");
  const { nome, params } = lerRota();
  hashAtual = location.hash;
  marcarAba(nome);
  // Cada tela ganha um contêiner novo: os ouvintes dela somem junto com ela.
  const raiz = document.createElement("div");
  main.replaceChildren(raiz);
  window.scrollTo(0, 0);
  try {
    const v = (await VIEWS[nome].montar(raiz, ctx, params)) || {};
    if (token !== tokenRender) {
      v.desmontar?.();
      return;
    }
    viewAtual = v;
  } catch (e) {
    console.error(e);
    if (token === tokenRender) telaMensagem("Algo deu errado", e?.message || String(e));
  }
}

async function aoTrocarHash() {
  if (!noApp) return;
  if (ignorarHash) {
    ignorarHash = false;
    return;
  }
  if (viewAtual?.podeSair && !(await viewAtual.podeSair())) {
    ignorarHash = true;
    location.hash = hashAtual;
    return;
  }
  renderizar();
}

function navegar(hash) {
  if (location.hash === hash) renderizar();
  else location.hash = hash;
}

// ---------- Indicadores ----------
function atualizarIndicadores({ pendentes = 0, erros = 0, sincronizando = false, sessaoExpirada = false } = {}) {
  const status = $("#status-rede");
  const total = pendentes + erros;
  let estado = "online", texto = "Online";
  if (!online()) { estado = "offline"; texto = "Offline"; }
  else if (sincronizando && total) { estado = "enviando"; texto = "Enviando…"; }
  else if (total) { estado = "pendente"; texto = total === 1 ? "1 pendente" : `${total} pendentes`; }
  status.dataset.estado = estado;
  status.textContent = texto;
  const selo = $("#selo-pendentes");
  selo.hidden = !total;
  selo.textContent = String(total);
  selo.setAttribute("aria-label", total === 1 ? "1 vistoria não enviada" : `${total} vistorias não enviadas`);
  $("#faixa-sessao").hidden = !sessaoExpirada;
}

async function sincronizar() {
  if (!ctx || !ctx.auth.usuarioAtual()) return null;
  const r = await ctx.sync.sincronizar().catch((e) => {
    console.error(e);
    return null;
  });
  if (r?.interrompido === "rede") registrarSyncEmSegundoPlano();
  return r;
}

export async function registrarSyncEmSegundoPlano() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    await reg?.sync?.register("enviar-vistorias");
  } catch {
    // Background Sync não existe neste navegador (ex.: iPhone)
  }
}

// ---------- Login e menu ----------
async function mostrarLogin() {
  noApp = false;
  try { viewAtual?.desmontar?.(); } catch { /* nada */ }
  viewAtual = null;
  document.body.classList.add("sem-abas");
  document.body.classList.remove("com-acoes");
  $("#btn-menu").hidden = true;
  $("#status-rede").hidden = true;
  $("#faixa-sessao").hidden = true;
  const raiz = document.createElement("div");
  main.replaceChildren(raiz);
  await viewLogin.montar(raiz, ctx, {});
}

function entrarNoApp() {
  noApp = true;
  document.body.classList.remove("sem-abas");
  $("#btn-menu").hidden = false;
  $("#status-rede").hidden = false;
  if (!location.hash || location.hash === "#") location.replace("#/nova");
  renderizar();
  storage.limparFotosAntigas(DIAS_CACHE_FOTOS).catch(console.error);
  ctx.sync.contar().then((c) => atualizarIndicadores(c)).catch(() => {});
  sincronizar();
  mostrarFaixaInstalar();
}

let menu = null;
function abrirMenu() {
  if (!menu) {
    menu = document.createElement("dialog");
    menu.className = "menu";
    menu.setAttribute("aria-label", "Menu");
    menu.innerHTML = `
      <div class="menu-lista">
        <p class="email" id="menu-email"></p>
        <button type="button" class="menu-item" data-acao="instalar" hidden>${icone("baixar")} Instalar app</button>
        <button type="button" class="menu-item" data-acao="sair">${icone("sair")} Sair</button>
      </div>`;
    menu.addEventListener("click", async (e) => {
      if (e.target === menu) { menu.close(); return; }
      const acao = e.target.closest("[data-acao]")?.dataset.acao;
      if (!acao) return;
      menu.close();
      if (acao === "sair") sairDoApp();
      if (acao === "instalar") window.dispatchEvent(new CustomEvent("vistoria:instalar"));
    });
    document.body.append(menu);
  }
  $("#menu-email", menu).textContent = ctx.auth.usuarioAtual()?.email || "";
  $('[data-acao="instalar"]', menu).hidden = !window.__podeInstalar;
  menu.showModal();
}

async function sairDoApp() {
  const { pendentes, erros } = await ctx.sync.contar();
  const n = pendentes + erros;
  const ok = n
    ? await confirmar({
      titulo: "Sair do app?",
      texto: `Há ${n} ${n === 1 ? "vistoria ainda não enviada. Ela fica guardada" : "vistorias ainda não enviadas. Elas ficam guardadas"} neste aparelho e ${n === 1 ? "será enviada" : "serão enviadas"} quando você entrar de novo. Sair mesmo assim?`,
      ok: "Sair",
      perigo: true,
    })
    : await confirmar({ titulo: "Sair do app?", texto: "Para entrar de novo, você vai precisar de internet.", ok: "Sair" });
  if (!ok) return;
  if (viewAtual?.podeSair && !(await viewAtual.podeSair())) return;
  await ctx.auth.sair();
}

// ---------- Início ----------
async function iniciar() {
  if (!envConfigurado()) {
    telaMensagem("Configure o arquivo env.js (veja o README).", "Preencha SUPABASE_URL e SUPABASE_ANON_KEY com os dados do seu projeto Supabase.");
    return;
  }
  try {
    await storage.obterMeta("usuario");
  } catch (e) {
    telaMensagem("Armazenamento indisponível", e?.message || String(e));
    return;
  }
  if (!globalThis.supabase?.createClient) {
    telaMensagem("Não foi possível carregar o app", "Recarregue a página. Se continuar, confira a conexão no primeiro acesso.");
    return;
  }

  const remoto = criarRemoto({ url: SUPABASE_URL, chave: SUPABASE_ANON_KEY });
  const auth = criarAuth({ remoto, storage, estaOnline: online });
  const sync = criarSincronizador({ storage, remoto, usuarioAtual: auth.usuarioAtual, estaOnline: online });
  ctx = { storage, remoto, auth, sync, navegar, online, confirmar, avisar, sincronizar };

  sync.eventos.addEventListener("mudou", (e) => atualizarIndicadores(e.detail));
  auth.aoMudar((u) => {
    if (u) entrarNoApp();
    else mostrarLogin();
  });

  window.addEventListener("hashchange", aoTrocarHash);
  window.addEventListener("online", () => { atualizarIndicadores(); sincronizar(); });
  window.addEventListener("offline", () => ctx.sync.contar().then(atualizarIndicadores));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sincronizar();
  });
  navigator.serviceWorker?.addEventListener("message", (e) => {
    if (e.data?.tipo === "sincronizar") sincronizar();
  });
  $("#btn-menu").addEventListener("click", abrirMenu);
  $("#btn-entrar-sessao").addEventListener("click", () => mostrarLogin());

  const u = await auth.iniciar();
  if (u) entrarNoApp();
  else mostrarLogin();
}

// ---------- Service Worker: offline e aviso de nova versão ----------
async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    let pediuAtualizacao = false;
    const avisar = () => { $("#faixa-versao").hidden = false; };
    if (reg.waiting && navigator.serviceWorker.controller) avisar();
    reg.addEventListener("updatefound", () => {
      const novo = reg.installing;
      novo?.addEventListener("statechange", () => {
        if (novo.state === "installed" && navigator.serviceWorker.controller) avisar();
      });
    });
    $("#btn-atualizar-versao").addEventListener("click", async () => {
      pediuAtualizacao = true;
      if (viewAtual?.podeSair) await viewAtual.podeSair(); // grava o rascunho antes de recarregar
      reg.waiting?.postMessage({ tipo: "SKIP_WAITING" });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (pediuAtualizacao) location.reload();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  } catch (e) {
    console.error("Service Worker não registrado:", e);
  }
}

// ---------- Instalar app ----------
let eventoInstalar = null;
const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const faixaInstalarFechada = () => {
  try { return localStorage.getItem("faixaInstalarFechada") === "1"; } catch { return false; }
};

function mostrarFaixaInstalar() {
  if (!noApp || instalado() || faixaInstalarFechada()) return;
  if (eventoInstalar) {
    $("#faixa-instalar-texto").textContent = "Instale o app para usar sem internet e abrir direto da tela inicial.";
    $("#btn-instalar-faixa").hidden = false;
    $("#faixa-instalar").hidden = false;
  } else if (ehIOS) {
    $("#faixa-instalar-texto").textContent = "Para instalar: toque em Compartilhar e depois em Adicionar à Tela de Início.";
    $("#btn-instalar-faixa").hidden = true;
    $("#faixa-instalar").hidden = false;
  }
}

async function instalarApp() {
  if (!eventoInstalar) return;
  eventoInstalar.prompt();
  await eventoInstalar.userChoice.catch(() => null);
  eventoInstalar = null;
  window.__podeInstalar = false;
  $("#faixa-instalar").hidden = true;
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  eventoInstalar = e;
  window.__podeInstalar = true;
  mostrarFaixaInstalar();
});
window.addEventListener("appinstalled", () => { $("#faixa-instalar").hidden = true; });
window.addEventListener("vistoria:instalar", instalarApp);
$("#btn-instalar-faixa").addEventListener("click", instalarApp);
$("#btn-fechar-instalar").addEventListener("click", () => {
  $("#faixa-instalar").hidden = true;
  try { localStorage.setItem("faixaInstalarFechada", "1"); } catch { /* sem armazenamento: só esconde */ }
});

registrarServiceWorker();
iniciar();
