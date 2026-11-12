// Etapa 3 — Avarias: toggle "Veículo sem avarias", lista de cartões e editor
// de avaria em tela cheia (área, tipo, gravidade, descrição e várias fotos).
import { AREAS_AVARIA, TIPOS_AVARIA, GRAVIDADES } from "../config.js";
import { arquivoAvaria } from "../formatos.js";
import { validarAvaria } from "../validacao.js";
import { $, $$, esc, icone } from "../ui.js";
import { comprimir, escolherFoto, verificarCamera, abrirVisualizador, MENSAGEM_CAMERA_NEGADA } from "../photos.js";

const classeGravidade = (g) => String(g || "").toLowerCase();
const opcoes = (lista) => `<option value="">Selecione</option>${lista.map((x) => `<option>${esc(x)}</option>`).join("")}`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export function montar(el, editor, ctx) {
  const urls = [];
  const urlDe = (blob) => {
    const u = URL.createObjectURL(blob);
    urls.push(u);
    return u;
  };

  el.innerHTML = `
    <section class="pilha" aria-labelledby="titulo-etapa">
      <h2 class="titulo" id="titulo-etapa" tabindex="-1">Avarias</h2>
      <button type="button" class="toggle" id="sem-avarias" role="switch" aria-checked="false">
        <span>Veículo sem avarias</span><span class="toggle-trilho" aria-hidden="true"></span>
      </button>
      <div class="lista" id="avarias-lista"></div>
      <button type="button" class="btn btn-primario btn-bloco" data-acao="adicionar">${icone("mais")} Adicionar avaria</button>
    </section>`;

  const lista = $("#avarias-lista", el);
  const toggle = $("#sem-avarias", el);
  let editorAberto = null; // { dialog, podeFechar() }

  async function desenhar() {
    const d = editor.rascunho.dados;
    toggle.setAttribute("aria-checked", String(Boolean(d.semAvarias)));
    // Com "Veículo sem avarias" ligado não faz sentido adicionar avaria: o botão some.
    $('[data-acao="adicionar"]', el).hidden = Boolean(d.semAvarias);
    if (!d.avarias.length) {
      lista.innerHTML = d.semAvarias ? "" : '<p class="texto-2">Nenhuma avaria registrada. Adicione as avarias encontradas ou marque “Veículo sem avarias”.</p>';
      return;
    }
    const cartoes = await Promise.all(d.avarias.map(async (a, i) => {
      const primeira = a.fotos[0] ? await editor.lerArquivo(arquivoAvaria(a.fotos[0])) : null;
      const g = classeGravidade(a.gravidade);
      return `
        <article class="cartao avaria-cartao" data-id="${esc(a.id)}">
          <div class="avaria-faixa ${g}" aria-hidden="true"></div>
          <div class="avaria-corpo">
            <div class="entre">
              <div>
                <p class="pequeno texto-2">Avaria ${i + 1}</p>
                <p class="avaria-titulo">${esc(a.area)} — ${esc(a.tipo)}</p>
              </div>
              ${primeira ? `<img class="avaria-thumb" src="${urlDe(primeira)}" alt="" width="64" height="48">` : ""}
            </div>
            <p><span class="selo selo-${g}">${esc(a.gravidade)}</span> <span class="pequeno texto-2">· ${a.fotos.length ? plural(a.fotos.length, "foto", "fotos") : "sem foto"}</span></p>
            ${a.descricao ? `<p class="pequeno texto-2">${esc(a.descricao.length > 120 ? `${a.descricao.slice(0, 117)}…` : a.descricao)}</p>` : ""}
            <div class="linha-acoes">
              <button type="button" class="btn btn-secundario" data-acao="editar">${icone("editar")} Editar</button>
              <button type="button" class="btn btn-texto" data-acao="remover">${icone("lixeira")} Remover</button>
            </div>
          </div>
        </article>`;
    }));
    lista.innerHTML = cartoes.join("");
  }

  async function apagarFotos(ids) {
    for (const id of ids) await editor.apagarArquivo(arquivoAvaria(id));
  }

  // ---------- Editor de avaria ----------
  function abrirEditor(existente) {
    const nova = !existente;
    const trabalho = existente ? structuredClone(existente) : { id: crypto.randomUUID(), area: "", tipo: "", gravidade: "", descricao: "", fotos: [] };
    const original = JSON.stringify(trabalho);
    const novasFotos = [];
    const removidas = [];
    const urlsFotos = new Map();

    const d = document.createElement("dialog");
    d.className = "cheio";
    d.setAttribute("aria-labelledby", "avaria-titulo");
    d.innerHTML = `
      <div class="cheio-topo">
        <h2 id="avaria-titulo">${nova ? "Nova avaria" : "Editar avaria"}</h2>
        <button type="button" class="btn-topo" data-acao="cancelar" aria-label="Fechar">${icone("x")}</button>
      </div>
      <div class="cheio-corpo pilha">
        <p class="erro-form" id="avaria-erros" role="alert" hidden></p>
        <div class="campo">
          <label class="rotulo" for="avaria-area">Área da avaria</label>
          <select class="entrada" id="avaria-area">${opcoes(AREAS_AVARIA)}</select>
        </div>
        <div class="campo">
          <label class="rotulo" for="avaria-tipo">Tipo da avaria</label>
          <select class="entrada" id="avaria-tipo">${opcoes(TIPOS_AVARIA)}</select>
        </div>
        <fieldset class="campo">
          <legend class="rotulo" id="avaria-gravidade-rotulo">Gravidade</legend>
          <div class="gravidades" role="radiogroup" aria-labelledby="avaria-gravidade-rotulo">
            ${GRAVIDADES.map((g) => `<button type="button" role="radio" aria-checked="false" class="gravidade ${classeGravidade(g.valor)}" data-valor="${g.valor}">${g.valor}</button>`).join("")}
          </div>
        </fieldset>
        <div class="campo">
          <label class="rotulo" for="avaria-descricao">Descrição <span class="opcional">(opcional, mas ajuda no laudo)</span></label>
          <textarea class="entrada" id="avaria-descricao" rows="3" placeholder="Ex.: amassado de 10 cm na parte inferior"></textarea>
        </div>
        <div class="campo">
          <p class="rotulo">Fotos da avaria</p>
          <div class="miniaturas" id="avaria-fotos"></div>
          <button type="button" class="btn btn-secundario" data-acao="foto">${icone("camera")} Adicionar foto</button>
          <p class="ajuda">Recomendado: pelo menos 1 foto.</p>
        </div>
      </div>
      <div class="cheio-rodape">
        <button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>
        <button type="button" class="btn btn-primario" data-acao="salvar">Salvar avaria</button>
      </div>`;

    const area = $("#avaria-area", d);
    const tipo = $("#avaria-tipo", d);
    const descricao = $("#avaria-descricao", d);
    const erros = $("#avaria-erros", d);
    area.value = trabalho.area;
    tipo.value = trabalho.tipo;
    descricao.value = trabalho.descricao;

    const marcarGravidade = () => $$(".gravidade", d).forEach((b) => b.setAttribute("aria-checked", String(b.dataset.valor === trabalho.gravidade)));
    marcarGravidade();

    async function desenharFotos() {
      const caixa = $("#avaria-fotos", d);
      const itens = [];
      for (const id of trabalho.fotos) {
        if (!urlsFotos.has(id)) {
          const blob = await editor.lerArquivo(arquivoAvaria(id));
          if (blob) urlsFotos.set(id, urlDe(blob));
        }
        const src = urlsFotos.get(id);
        if (!src) continue;
        itens.push(`
          <div class="miniatura" data-foto="${id}">
            <button type="button" data-acao="ver" aria-label="Ampliar foto da avaria"><img src="${src}" alt="Foto da avaria"></button>
            <button type="button" class="remover" data-acao="remover-foto" aria-label="Remover esta foto">${icone("x")}</button>
          </div>`);
      }
      caixa.innerHTML = itens.join("");
    }

    const alterado = () => {
      trabalho.area = area.value;
      trabalho.tipo = tipo.value;
      trabalho.descricao = descricao.value;
      return JSON.stringify(trabalho) !== original;
    };

    function fechar() {
      editorAberto = null;
      d.close();
    }

    async function podeFechar() {
      if (alterado() && !(await ctx.confirmar({ titulo: "Descartar as alterações desta avaria?", ok: "Descartar", perigo: true }))) return false;
      await apagarFotos(novasFotos);
      fechar();
      return true;
    }

    async function adicionarFoto() {
      // 1º abre a câmera (iPhone exige que seja no mesmo toque); só depois, sem bloquear, avisa se estiver bloqueada.
      const escolha = escolherFoto();
      verificarCamera().then((estado) => { if (estado === "negada") ctx.avisar(MENSAGEM_CAMERA_NEGADA, "erro"); });
      const arquivo = await escolha;
      if (!arquivo) return;
      try {
        const blob = await comprimir(arquivo);
        const id = crypto.randomUUID();
        await editor.gravarArquivo(arquivoAvaria(id), blob);
        novasFotos.push(id);
        trabalho.fotos.push(id);
        await desenharFotos();
      } catch (e) {
        ctx.avisar(e.message, "erro");
      }
    }

    async function salvar() {
      alterado();
      const problemas = validarAvaria(trabalho);
      if (problemas.length) {
        erros.textContent = problemas.join(". ") + ".";
        erros.hidden = false;
        erros.focus?.();
        return;
      }
      if (!trabalho.fotos.length && !(await ctx.confirmar({ titulo: "Esta avaria está sem foto. Salvar mesmo assim?", ok: "Salvar sem foto", cancelar: "Voltar" }))) return;
      await editor.alterar((dd) => {
        const i = dd.avarias.findIndex((a) => a.id === trabalho.id);
        if (i >= 0) dd.avarias[i] = structuredClone(trabalho);
        else dd.avarias.push(structuredClone(trabalho));
        dd.semAvarias = false;
      }, { imediato: true });
      await apagarFotos(removidas);
      fechar();
      await desenhar();
    }

    d.addEventListener("click", async (e) => {
      const alvo = e.target.closest("[data-acao], .gravidade");
      if (!alvo) return;
      if (alvo.classList.contains("gravidade")) {
        trabalho.gravidade = alvo.dataset.valor;
        marcarGravidade();
        return;
      }
      const acao = alvo.dataset.acao;
      if (acao === "cancelar") await podeFechar();
      if (acao === "salvar") await salvar();
      if (acao === "foto") await adicionarFoto();
      if (acao === "remover-foto") {
        const id = alvo.closest("[data-foto]").dataset.foto;
        trabalho.fotos = trabalho.fotos.filter((f) => f !== id);
        if (novasFotos.includes(id)) await apagarFotos([id]);
        else removidas.push(id);
        await desenharFotos();
      }
      if (acao === "ver") {
        const fotos = trabalho.fotos.filter((id) => urlsFotos.has(id)).map((id) => ({ src: urlsFotos.get(id), legenda: "Foto da avaria" }));
        abrirVisualizador(fotos, trabalho.fotos.indexOf(alvo.closest("[data-foto]").dataset.foto));
      }
    });
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      podeFechar();
    });
    d.addEventListener("close", () => d.remove());

    document.body.append(d);
    d.showModal();
    area.focus();
    desenharFotos();
    editorAberto = { dialog: d, podeFechar };
  }

  // ---------- Ações da etapa ----------
  el.addEventListener("click", async (e) => {
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (e.target.closest("#sem-avarias")) {
      const d = editor.rascunho.dados;
      const ligar = !d.semAvarias;
      if (ligar && d.avarias.length) {
        const n = d.avarias.length;
        if (!(await ctx.confirmar({ titulo: `Remover ${n === 1 ? "a avaria registrada" : `as ${n} avarias registradas`}?`, texto: "Para marcar “Veículo sem avarias”, as avarias e as fotos delas serão apagadas.", ok: "Remover", perigo: true }))) return;
        await apagarFotos(d.avarias.flatMap((a) => a.fotos));
      }
      await editor.alterar((dd) => {
        dd.semAvarias = ligar;
        if (ligar) dd.avarias = [];
      }, { imediato: true });
      await desenhar();
      return;
    }
    if (acao === "adicionar") return abrirEditor(null);
    const id = e.target.closest("[data-id]")?.dataset.id;
    const a = editor.rascunho.dados.avarias.find((x) => x.id === id);
    if (!a) return;
    if (acao === "editar") return abrirEditor(a);
    if (acao === "remover") {
      if (!(await ctx.confirmar({ titulo: `Remover a avaria ${a.area} — ${a.tipo}?`, ok: "Remover", perigo: true }))) return;
      await apagarFotos(a.fotos);
      await editor.alterar((dd) => { dd.avarias = dd.avarias.filter((x) => x.id !== id); }, { imediato: true });
      await desenhar();
    }
  });

  desenhar();

  return {
    podeSair: async () => (editorAberto ? editorAberto.podeFechar() : true),
    desmontar() {
      editorAberto?.dialog.close();
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}
