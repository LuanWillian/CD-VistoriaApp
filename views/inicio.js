// Tela "Menu" (#/inicio): página principal em todos os ambientes. No app instalado
// e no navegador de celular/tablet tem os dois cartões; no navegador do computador
// (ctx.desktop) é o painel de consulta (views/painel.js), sem "Iniciar vistoria".
// Visual do celular (Estilo B, igual ao do computador): saudação, números do dia,
// os atalhos Iniciar vistoria e Vistorias e as últimas vistorias.
import { montar as montarPainel } from "./painel.js";
import { seloDaLista } from "./vistorias.js";
import { situacaoRecebimento, separarRecebimentos } from "../recebimento-dados.js";
import { juntarComServidor, maisRecentesPrimeiro, primeiroNome } from "../painel-dados.js";
import { formatarDataHora, formatarMarca, periodo } from "../formatos.js";
import { esc, icone } from "../ui.js";

// Decide, ao abrir o site, se começa no menu. Abrir pelo link ou pelo
// ícone (abertura nova, "navigate") sem hash, com "#/" ou com "#/nova" sem
// parâmetros sempre vai ao menu — "#/nova" é o start_url do manifest e o
// endereço que ficava no link. Recarregar ("reload") ou voltar ("back_forward")
// mantém a tela; "#/nova?rascunho=…", "#/vistorias" (fora do computador) e afins são respeitados.
export function deveAbrirNoMenu(hash, tipoNavegacao) {
  const h = hash || "";
  if (h === "" || h === "#" || h === "#/") return true;
  return h === "#/nova" && tipoNavegacao === "navigate";
}

// Computador: não existe iniciar vistoria nem a lista separada (o painel do menu já
// lista as vistorias), então #/nova e #/vistorias (e subrotas) vão para o menu.
// Devolve o hash de destino, ou null se a rota pode ficar como está.
// Fora do computador não existe o dashboard: #/dashboard também vai para o menu.
// Conta de loja: só existem o menu e as telas de recebimento (em qualquer aparelho);
// as telas de recebimento não existem para vistoriadores.
export function redirecionamento(hash, desktop, papel = "vistoriador") {
  const h = hash || "";
  if (papel === "loja") return /^#\/(nova|vistorias|vistoria|dashboard)([/?]|$)/.test(h) ? "#/inicio" : null;
  // papel null = conta ainda desconhecida (abertura do app): as telas de recebimento
  // esperam; depois do login a rota é conferida de novo com o papel certo.
  if (/^#\/(recebimentos|recebimento)([/?]|$)/.test(h)) return papel === null ? null : "#/inicio";
  if (desktop) return /^#\/(nova|vistorias)([/?]|$)/.test(h) ? "#/inicio" : null;
  return /^#\/dashboard([/?]|$)/.test(h) ? "#/inicio" : null;
}

// Histórico no app e no celular: o menu é sempre o nível 0 (primeira entrada),
// e cada tela aberta a partir dele fica um nível acima. Assim o "voltar" do
// Android chega ao menu e, do menu, sai do app. Entradas que já têm nível
// (voltar, avançar, recarregar) mantêm o seu.
export function nivelDaTela(estado, nome, nivelAnterior) {
  if (Number.isInteger(estado?.nivel)) return estado.nivel;
  return nome === "inicio" ? 0 : nivelAnterior + 1;
}

// Conta de loja (qualquer aparelho): um cartão só, "Recebimentos", com a contagem.
function montarLoja(el, ctx) {
  const usuario = ctx.auth?.usuarioAtual?.();
  const nome = primeiroNome(usuario?.nome);
  el.innerHTML = `
    <section class="cm-inicio" aria-labelledby="home-titulo">
      <div>
        <h1 class="cm-h1" id="home-titulo">${nome ? `Olá, ${esc(nome)}` : "Olá!"}</h1>
        <p class="cm-sub">${usuario?.loja ? `${icone("fachada")} ${esc(usuario.loja)}` : "Carros enviados pelo CD para a sua loja."}</p>
      </div>
      <button class="cm-cartao cm-acao" id="btn-recebimentos" type="button">
        <span class="cm-acao-ic cm-acao-escuro" aria-hidden="true">${icone("fachada")}</span>
        <span class="cm-acao-texto"><span class="cm-acao-titulo">Recebimentos</span><span class="cm-acao-sub" id="receb-contagem">Ver os carros a receber</span></span>
        ${icone("avancar", "ic cm-acao-seta")}
      </button>
    </section>`;
  el.querySelector("#btn-recebimentos").addEventListener("click", () => ctx.navegar("#/recebimentos"));
  let ativo = true;
  if (ctx.online()) {
    ctx.remoto.listarParaLoja().then((itens) => {
      if (!ativo) return;
      const n = separarRecebimentos(itens).aReceber.length;
      el.querySelector("#receb-contagem").textContent = n ? `${n} a receber` : "Nada a receber";
    }).catch(console.error);
  }
  return { desmontar() { ativo = false; } };
}

// Faixa colorida à esquerda das últimas vistorias: a mesma situação do selo.
function corDaLinha(v) {
  if (v.status === "erro") return "erro";
  if (v.status !== "sincronizada") return "pendente";
  return { aguardando: "pendente", divergencia: "erro" }[situacaoRecebimento(v)] || "ok";
}

// Mesma regra das telas Vistorias e do painel: o servidor manda; do aparelho só
// entram as ainda não enviadas. Sem internet: as do aparelho + as já enviadas guardadas.
async function lerVistorias(ctx, usuario) {
  const locais = (await ctx.storage.listarVistorias(usuario.id)).filter((v) => v.status !== "excluindo");
  if (ctx.online?.() && ctx.remoto?.listarTodasVistorias) {
    try {
      const remotos = await ctx.remoto.listarTodasVistorias();
      const porId = new Map(remotos.map((v) => [v.id, v]));
      for (const v of locais) {
        if (porId.has(v.id)) porId.set(v.id, juntarComServidor(porId.get(v.id), v));
        else if (v.status !== "sincronizada") porId.set(v.id, v);
      }
      return [...porId.values()].filter((v) => v.status !== "excluindo");
    } catch (e) {
      console.error(e);
    }
  }
  const doAparelho = new Map(locais.map((v) => [v.id, v]));
  for (const v of await ctx.storage.listarSincronizadas()) if (!doAparelho.has(v.id)) doAparelho.set(v.id, v);
  return [...doAparelho.values()].filter((v) => v.status !== "excluindo");
}

// Celular e app instalado (vistoriador): saudação, números, os dois atalhos e as últimas vistorias.
function montarCelular(el, ctx) {
  const usuario = ctx.auth?.usuarioAtual?.();
  const nome = primeiroNome(usuario?.nome);
  el.innerHTML = `
    <section class="cm-inicio" aria-labelledby="home-titulo">
      <div>
        <h1 class="cm-h1" id="home-titulo">${nome ? `Olá, ${esc(nome)}` : "Olá!"}</h1>
        <p class="cm-sub">O que você quer fazer agora?</p>
      </div>
      <div class="cm-cartao cm-resumo" id="inicio-resumo" hidden>
        <div class="cm-resumo-item"><span class="cm-resumo-rot">${icone("prancheta", "ic cm-ic-escuro")}Hoje</span><strong id="resumo-hoje">0</strong></div>
        <div class="cm-resumo-item"><span class="cm-resumo-rot">${icone("nuvemEnviar", "ic cm-ic-pendente")}A enviar</span><strong id="resumo-enviar">0</strong></div>
        <div class="cm-resumo-item"><span class="cm-resumo-rot">${icone("fachada", "ic cm-ic-pendente")}Na loja</span><strong><span id="resumo-loja">0</span> <span class="cm-resumo-extra">aguardando</span></strong></div>
      </div>
      <button class="cm-cartao cm-acao" id="btn-iniciar" type="button">
        <span class="cm-acao-ic cm-acao-escuro" aria-hidden="true">${icone("carro")}</span>
        <span class="cm-acao-texto"><span class="cm-acao-titulo">Iniciar vistoria</span><span class="cm-acao-sub">Registrar vistoria de saída</span></span>
        <span class="cm-acao-botao" aria-hidden="true">${icone("mais")}Nova</span>
      </button>
      <button class="cm-cartao cm-acao" id="btn-vistorias" type="button">
        <span class="cm-acao-ic" aria-hidden="true">${icone("lista")}</span>
        <span class="cm-acao-texto"><span class="cm-acao-titulo">Vistorias</span><span class="cm-acao-sub">Ver todas as vistorias feitas</span></span>
        ${icone("avancar", "ic cm-acao-seta")}
      </button>
      <div id="inicio-ultimas-bloco" hidden>
        <div class="cm-linha-titulo"><h2>Últimas vistorias</h2><a class="cm-link" href="#/vistorias">Ver todas</a></div>
        <div class="cm-cartao cm-ultimas" id="inicio-ultimas"></div>
      </div>
    </section>`;

  el.querySelector("#btn-iniciar").addEventListener("click", () => ctx.navegar("#/nova"));
  el.querySelector("#btn-vistorias").addEventListener("click", () => ctx.navegar("#/vistorias"));

  let ativo = true;
  async function carregar() {
    if (!ctx.storage || !usuario) return;
    const itens = await lerVistorias(ctx, usuario);
    if (!ativo) return;
    const { de } = periodo("hoje", new Date());
    const hoje = itens.filter((v) => v.realizadaEm >= de).length;
    const enviar = itens.filter((v) => v.status !== "sincronizada").length;
    const naLoja = itens.filter((v) => situacaoRecebimento(v) === "aguardando").length;
    el.querySelector("#resumo-hoje").textContent = String(hoje);
    el.querySelector("#resumo-enviar").textContent = String(enviar);
    el.querySelector("#resumo-loja").textContent = String(naLoja);
    el.querySelector("#inicio-resumo").hidden = false;
    const ultimas = maisRecentesPrimeiro(itens).slice(0, 3);
    el.querySelector("#inicio-ultimas-bloco").hidden = !ultimas.length;
    el.querySelector("#inicio-ultimas").innerHTML = ultimas.map((v) => `
      <a class="cm-ultima" href="#/vistoria/${esc(v.id)}">
        <span class="cm-faixa cm-faixa-${corDaLinha(v)}" aria-hidden="true"></span>
        <span class="cm-ultima-texto">
          <span class="cm-ultima-titulo">${esc([formatarMarca(v.marca ?? ""), v.modelo].filter(Boolean).join(" ") || "Veículo")}</span>
          <span class="cm-ultima-sub"><span class="cm-mono">${esc(v.chassi || "—")}</span> · ${formatarDataHora(v.realizadaEm)}</span>
        </span>
        ${seloDaLista(v)}
      </a>`).join("");
  }
  carregar().catch(console.error);
  return { desmontar() { ativo = false; } };
}

export function montar(el, ctx) {
  if (ctx.auth?.usuarioAtual()?.papel === "loja") return montarLoja(el, ctx);
  // Navegador do computador: a página principal é o painel de consulta.
  if (ctx.desktop) return montarPainel(el, ctx);
  return montarCelular(el, ctx);
}
