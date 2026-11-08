// Aba "Nova vistoria": formulário em 4 etapas com salvamento automático do
// rascunho, indicador de progresso e botões Voltar/Avançar/Finalizar.
import { novoRascunho } from "../formatos.js";
import { faltandoParaFinalizar, situacaoEtapa } from "../validacao.js";
import { criarEditor } from "../rascunho.js";
import { $, $$, esc, carregandoHtml, icone } from "../ui.js";
import * as etapaVeiculo from "./etapa-veiculo.js";
import * as etapaChecklist from "./etapa-checklist.js";
import * as etapaAvarias from "./etapa-avarias.js";
import * as etapaAssinaturas from "./etapa-assinaturas.js";

const ETAPAS = [
  { n: 1, nome: "Veículo", modulo: etapaVeiculo },
  { n: 2, nome: "Checklist", modulo: etapaChecklist },
  { n: 3, nome: "Avarias", modulo: etapaAvarias },
  { n: 4, nome: "Assinaturas", modulo: etapaAssinaturas },
];

async function carregarRascunho(ctx, usuario, busca) {
  const id = busca.get("rascunho");
  if (id) {
    const r = await ctx.storage.obterRascunho(id);
    if (r && r.userId === usuario.id) return { rascunho: r, novo: false };
  }
  if (!busca.has("novo")) {
    const [maisRecente] = await ctx.storage.listarRascunhos(usuario.id);
    if (maisRecente) return { rascunho: maisRecente, novo: false };
  }
  // Só vai para o banco na primeira alteração (não cria rascunhos vazios).
  return { rascunho: novoRascunho(usuario.id, crypto.randomUUID(), new Date().toISOString()), novo: true };
}

// Diálogo "Falta preencher": cada item leva até a etapa e o campo.
function mostrarFaltas(faltas, { irPara, etapa } = {}) {
  const d = document.createElement("dialog");
  d.setAttribute("aria-labelledby", "falta-titulo");
  const grupos = ETAPAS.filter((e) => faltas.some((f) => f.etapa === e.n));
  d.innerHTML = `
    <div class="dialogo-corpo">
      <h2 id="falta-titulo">Falta preencher</h2>
      <p class="texto-2">Toque em um item para ir até ele.</p>
      ${grupos.map((g) => `
        <div class="falta-grupo">
          <h3>${g.n} ${g.nome}</h3>
          ${faltas.filter((f) => f.etapa === g.n).map((f) => `
            <button type="button" class="falta-item" data-etapa="${f.etapa}" data-campo="${esc(f.campo)}">${icone("alerta")} ${esc(f.mensagem)}</button>`).join("")}
        </div>`).join("")}
    </div>
    <div class="dialogo-acoes"><button type="button" class="btn btn-secundario" data-fechar>Fechar</button></div>`;
  d.addEventListener("click", async (e) => {
    if (e.target.closest("[data-fechar]")) {
      d.close();
      return;
    }
    const item = e.target.closest(".falta-item");
    if (!item) return;
    d.close();
    if (irPara) await irPara(Number(item.dataset.etapa));
    etapa?.()?.mostrarTodos?.();
    const alvo = document.getElementById(item.dataset.campo);
    alvo?.scrollIntoView({ block: "center" });
    alvo?.focus({ preventScroll: true });
  });
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
}

// Valida, grava a vistoria como pendente e leva ao detalhe; o envio começa na hora.
// O nome do vistoriador é sempre o da conta (perfil), nunca o digitado.
export function aplicarNomeDaConta(editor, ctx) {
  const nome = ctx.auth.usuarioAtual()?.nome ?? "";
  if (editor.rascunho.dados.vistoriadorNome !== nome) {
    editor.alterar((d) => { d.vistoriadorNome = nome; }, { sugestao: true });
  }
}

export async function finalizar(editor, ctx, navegacao = {}) {
  aplicarNomeDaConta(editor, ctx);
  await editor.descarregar();
  const faltas = faltandoParaFinalizar(editor.rascunho);
  if (faltas.length) {
    mostrarFaltas(faltas, navegacao);
    return null;
  }
  try {
    editor.encerrar();
    const v = await ctx.storage.finalizarRascunho(editor.rascunho, new Date().toISOString());
    ctx.storage.pedirPersistencia();
    ctx.navegar(`#/vistoria/${v.id}?nova=1`);
    ctx.sync.sincronizar();
    navigator.serviceWorker?.ready.then((reg) => reg.sync?.register("enviar-vistorias")).catch(() => {});
    return v.id;
  } catch (e) {
    editor.reabrir();
    ctx.avisar(e.message, "erro");
    return null;
  }
}

export async function montar(el, ctx, params) {
  const usuario = ctx.auth.usuarioAtual();
  el.innerHTML = carregandoHtml();
  const { rascunho, novo } = await carregarRascunho(ctx, usuario, params.busca);
  history.replaceState(null, "", `#/nova?rascunho=${rascunho.id}`);

  const editor = criarEditor({ storage: ctx.storage, rascunho, novo, aoErro: (e) => ctx.avisar(e.message, "erro") });
  aplicarNomeDaConta(editor, ctx);
  document.body.classList.add("com-acoes");
  el.innerHTML = `
    <h1 class="sr-only">Nova vistoria</h1>
    <nav class="etapas" aria-label="Etapas da vistoria">
      ${ETAPAS.map((e) => `
        <button type="button" class="etapa-btn" data-etapa="${e.n}">
          <span class="etapa-num" aria-hidden="true">${e.n}</span>${e.nome}
        </button>`).join("")}
    </nav>
    <div id="etapa-conteudo"></div>
    <div class="barra-acoes">
      <button type="button" class="btn btn-secundario" id="btn-voltar">${icone("voltar")} Voltar</button>
      <button type="button" class="btn btn-primario" id="btn-avancar">Avançar ${icone("avancar")}</button>
    </div>`;

  const conteudo = $("#etapa-conteudo", el);
  const btnVoltar = $("#btn-voltar", el);
  const btnAvancar = $("#btn-avancar", el);
  let etapaAtual = null;
  let n = Math.min(Math.max(rascunho.etapa || 1, 1), 4);

  function atualizarIndicador() {
    $$(".etapa-btn", el).forEach((b) => {
      const e = Number(b.dataset.etapa);
      const sit = situacaoEtapa(editor.rascunho, e);
      b.dataset.situacao = sit;
      if (e === n) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
      const nome = ETAPAS[e - 1].nome;
      b.setAttribute("aria-label", `Etapa ${e}: ${nome}${sit === "completa" ? ", completa" : ""}${e === n ? ", atual" : ""}`);
      $(".etapa-num", b).innerHTML = sit === "completa" && e !== n ? icone("check", "ic") : String(e);
    });
  }

  async function irPara(novo, { focar = true } = {}) {
    if (etapaAtual?.podeSair && !(await etapaAtual.podeSair())) return false;
    etapaAtual?.desmontar?.();
    n = novo;
    editor.irPara(n);
    conteudo.replaceChildren();
    etapaAtual = ETAPAS[n - 1].modulo.montar(conteudo, editor, ctx) || {};
    btnVoltar.disabled = n === 1;
    btnAvancar.innerHTML = n === 4 ? `${icone("check")} Finalizar vistoria` : `Avançar ${icone("avancar")}`;
    atualizarIndicador();
    if (focar) {
      window.scrollTo(0, 0);
      $("#titulo-etapa", conteudo)?.focus({ preventScroll: true });
    }
    return true;
  }

  $(".etapas", el).addEventListener("click", (e) => {
    const b = e.target.closest("[data-etapa]");
    if (b) irPara(Number(b.dataset.etapa));
  });
  btnVoltar.addEventListener("click", () => n > 1 && irPara(n - 1));
  btnAvancar.addEventListener("click", async () => {
    if (n < 4) return irPara(n + 1);
    return finalizar(editor, ctx, { irPara: (etapa) => irPara(etapa, { focar: false }), etapa: () => etapaAtual });
  });

  const pararIndicador = editor.aoMudar(atualizarIndicador);
  const aoOcultar = () => { if (document.visibilityState === "hidden") editor.descarregar(); };
  const aoSair = () => editor.descarregar();
  const antesDeFechar = (e) => {
    if (!editor.temPendente()) return;
    editor.descarregar();
    e.preventDefault();
    e.returnValue = "";
  };
  document.addEventListener("visibilitychange", aoOcultar);
  window.addEventListener("pagehide", aoSair);
  window.addEventListener("beforeunload", antesDeFechar);

  await irPara(n, { focar: false });

  return {
    async podeSair() {
      if (etapaAtual?.podeSair && !(await etapaAtual.podeSair())) return false;
      await editor.descarregar();
      return true;
    },
    desmontar() {
      pararIndicador();
      etapaAtual?.desmontar?.();
      editor.descarregar();
      document.removeEventListener("visibilitychange", aoOcultar);
      window.removeEventListener("pagehide", aoSair);
      window.removeEventListener("beforeunload", antesDeFechar);
      document.body.classList.remove("com-acoes");
    },
  };
}
