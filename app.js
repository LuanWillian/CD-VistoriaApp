// Inicialização do app: configuração, login, rotas por hash, menu inicial,
// indicador de conexão e gatilhos da sincronização.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env.js";
import * as storage from "./storage.js";
import { criarRemoto } from "./supabase.js";
import { criarAuth } from "./auth.js";
import { criarSincronizador } from "./sync.js";
import { DIAS_CACHE_FOTOS } from "./config.js";
import { $, esc, icone, avisar, confirmar } from "./ui.js";
import { aoMudarDispositivo, detectarDispositivo, isDesktopBrowser } from "./dispositivo.js";
import * as viewLogin from "./views/login.js";
import * as viewNova from "./views/nova.js";
import * as viewVistorias from "./views/vistorias.js";
import * as viewDetalhe from "./views/detalhe.js";
import * as viewInicio from "./views/inicio.js";
import * as viewDashboard from "./views/dashboard.js";

const VIEWS = { nova: viewNova, vistorias: viewVistorias, detalhe: viewDetalhe, inicio: viewInicio, dashboard: viewDashboard };

// O menu #/inicio é a página principal em todos os ambientes. A escolha acontece
// aqui, antes de qualquer tela ser desenhada (sem piscar).
// Navegador do computador: não existe iniciar vistoria, então #/nova não existe.
const desktop = isDesktopBrowser();
{
  const tipoNavegacao = performance.getEntriesByType?.("navigation")?.[0]?.type ?? "navigate";
  if (viewInicio.deveAbrirNoMenu(location.hash, tipoNavegacao)) history.replaceState(history.state, "", "#/inicio");
  const bloqueada = viewInicio.redirecionamento(location.hash, desktop);
  if (bloqueada) history.replaceState(history.state, "", bloqueada);
}

// Histórico no app e no celular: o menu fica sempre por baixo de tudo (nível 0). Se
// o app abrir direto numa tela (ex.: recarregado sem histórico salvo), o menu é
// colocado antes dela, para o "voltar" do Android levar até ele. No computador o
// histórico é o normal do navegador.
let nivelAtual = 0;
const comNivel = (nivel) => ({ ...(history.state || {}), nivel });
if (!desktop) {
  if (/^#\/inicio(\?|$)/.test(location.hash)) {
    history.replaceState(comNivel(0), "");
  } else if (Number.isInteger(history.state?.nivel)) {
    nivelAtual = history.state.nivel;
  } else {
    const destino = location.hash;
    history.replaceState(comNivel(0), "", "#/inicio");
    history.pushState({ nivel: 1 }, "", destino);
    nivelAtual = 1;
  }
}
let dispositivo = detectarDispositivo(); // { tipo, instalado, ios }
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
  const [caminho, qs] = (location.hash.slice(1) || "/inicio").split("?");
  const busca = new URLSearchParams(qs || "");
  const m = caminho.match(/^\/vistoria\/([\w-]+)$/);
  if (m) return { nome: "detalhe", params: { id: m[1], busca } };
  if (caminho === "/vistorias") return { nome: "vistorias", params: { busca } };
  if (desktop && caminho === "/dashboard") return { nome: "dashboard", params: { busca } };
  if (!desktop && /^\/nova(\/|$)/.test(caminho)) return { nome: "nova", params: { busca } };
  return { nome: "inicio", params: { busca } }; // #/inicio e qualquer rota desconhecida
}

async function renderizar() {
  const token = ++tokenRender;
  try { viewAtual?.desmontar?.(); } catch (e) { console.error(e); }
  viewAtual = null;
  document.body.classList.remove("com-acoes");
  // Computador: #/nova não existe (digitado, favorito ou voltar/avançar do histórico).
  // replaceState, para a rota bloqueada não ficar no histórico.
  const bloqueada = viewInicio.redirecionamento(location.hash, desktop);
  if (bloqueada) history.replaceState(history.state, "", bloqueada);
  const { nome, params } = lerRota();
  // No menu não aparece a seta de voltar ao menu.
  document.body.classList.toggle("na-inicio", nome === "inicio");
  marcarNavTopo(nome);
  if (!desktop) {
    nivelAtual = viewInicio.nivelDaTela(history.state, nome, nivelAtual);
    if (history.state?.nivel !== nivelAtual) history.replaceState(comNivel(nivelAtual), "");
  }
  hashAtual = location.hash;
  // Cada tela ganha um contêiner novo: os ouvintes dela somem junto com ela.
  const raiz = document.createElement("div");
  main.replaceChildren(raiz);
  window.scrollTo(0, 0);
  try {
    const v = (await VIEWS[nome].montar(raiz, ctx, params)) || {};
    // Uma tela pode trocar o endereço ao montar (ex.: #/nova?rascunho=…): o nível fica.
    if (!desktop && token === tokenRender && history.state?.nivel !== nivelAtual) history.replaceState(comNivel(nivelAtual), "");
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
  document.body.classList.remove("com-acoes");
  tituloComoLinkDoMenu(false);
  $("#btn-menu").hidden = true;
  $("#topo-nav").hidden = true;
  $("#status-rede").hidden = true;
  $("#faixa-sessao").hidden = true;
  const raiz = document.createElement("div");
  main.replaceChildren(raiz);
  await viewLogin.montar(raiz, ctx, {});
}

// Computador: links "Vistorias" (painel do menu) e "Dashboard" no topo.
function marcarNavTopo(nome) {
  for (const a of document.querySelectorAll("#topo-nav [data-rota]")) {
    if (a.dataset.rota === nome) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

// O título "CD Vistoria" vira o caminho de volta ao menu (em todos os ambientes).
function tituloComoLinkDoMenu(ligar) {
  const titulo = $(".topo-titulo");
  titulo.innerHTML = ligar
    ? `<a class="topo-link" href="#/inicio" aria-label="CD Vistoria — voltar ao menu">${icone("voltar", "ic topo-voltar")}<span>CD Vistoria</span></a>`
    : "CD Vistoria";
}

// App e celular: voltar ao menu pelo título volta no próprio histórico até o menu
// (nível 0), sem empilhar entradas; assim, no menu, o "voltar" do Android sai do
// app. No computador o link funciona como um link comum (o voltar do navegador
// segue normal).
function irParaMenu() {
  if (nivelAtual > 0 && history.state?.nivel === nivelAtual) history.go(-nivelAtual);
  else location.replace("#/inicio");
}
if (!desktop) {
  $(".topo-titulo").addEventListener("click", (e) => {
    if (!e.target.closest(".topo-link")) return;
    e.preventDefault();
    if (noApp) irParaMenu();
  });
}

// Botão da conta no topo: nome do vistoriador (do perfil) + ícone de pessoa.
// O nome aparece só no navegador do computador; no celular e no app instalado
// fica só o ícone. Sem nome no perfil, também fica só o ícone.
function mostrarUsuarioNoTopo() {
  const u = ctx.auth.usuarioAtual();
  const nome = String(u?.nome ?? "").trim();
  const curto = desktop ? nome : "";
  $("#topo-nome").textContent = curto;
  $("#topo-nome").hidden = !curto;
  $("#btn-menu").setAttribute("aria-label", nome ? `Conta de ${nome}: abrir menu` : "Conta: abrir menu");
}

function entrarNoApp() {
  noApp = true;
  tituloComoLinkDoMenu(true);
  mostrarUsuarioNoTopo();
  $("#btn-menu").hidden = false;
  $("#topo-nav").hidden = !desktop;
  $("#status-rede").hidden = false;
  if (!location.hash || location.hash === "#") location.replace("#/inicio");
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
        <div class="email"><p class="menu-nome" id="menu-nome"></p><p id="menu-email"></p></div>
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
  $("#menu-nome", menu).textContent = ctx.auth.usuarioAtual()?.nome || "";
  $("#menu-nome", menu).hidden = !ctx.auth.usuarioAtual()?.nome;
  $("#menu-email", menu).textContent = ctx.auth.usuarioAtual()?.email || "";
  // Navegador do computador: sem opção de instalar o app.
  $('[data-acao="instalar"]', menu).hidden = desktop || !window.__podeInstalar;
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
  ctx = { storage, remoto, auth, sync, navegar, online, confirmar, avisar, sincronizar, desktop };

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
    // Havia uma versão rodando? (no primeiro acesso não há o que atualizar)
    const tinhaVersao = Boolean(navigator.serviceWorker.controller);
    const reg = await navigator.serviceWorker.register("sw.js");
    let recarregando = false;
    const avisar = () => { $("#faixa-versao").hidden = false; };
    const recarregar = async () => {
      if (recarregando) return;
      recarregando = true;
      if (viewAtual?.podeSair) await viewAtual.podeSair(); // grava o rascunho antes de recarregar
      location.reload();
    };
    // Versão antiga que ainda espera (sw.js de antes desta mudança): oferece atualizar.
    if (reg.waiting && tinhaVersao) avisar();
    $("#btn-atualizar-versao").addEventListener("click", () => {
      if (reg.waiting) reg.waiting.postMessage({ tipo: "SKIP_WAITING" });
      else recarregar();
    });
    // A versão nova assumiu (o sw.js novo faz isso sozinho ao instalar): recarrega
    // na hora, a não ser no meio de uma vistoria — aí mostra "Atualizar".
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!tinhaVersao) return;
      if (location.hash.startsWith("#/nova")) avisar();
      else recarregar();
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
const faixaInstalarFechada = () => {
  try { return localStorage.getItem("faixaInstalarFechada") === "1"; } catch { return false; }
};

// A faixa só aparece em celular/tablet ainda não instalado (nunca no computador).
function mostrarFaixaInstalar() {
  if (desktop) {
    $("#faixa-instalar").hidden = true;
    return;
  }
  if (!noApp || dispositivo.instalado || faixaInstalarFechada()) return;
  if (eventoInstalar) {
    $("#faixa-instalar-texto").textContent = "Instale o app para usar sem internet e abrir direto da tela inicial.";
    $("#btn-instalar-faixa").hidden = false;
    $("#faixa-instalar").hidden = false;
  } else if (dispositivo.ios) {
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

aoMudarDispositivo((d) => {
  dispositivo = d;
  mostrarFaixaInstalar();
});

registrarServiceWorker();
iniciar();
