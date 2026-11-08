// Etapa 4 — Responsáveis e assinaturas (vistoriador e motorista do reboque).
import { ARQUIVO } from "../formatos.js";
import { $, $$, icone } from "../ui.js";
import { abrirTelaAssinatura } from "../assinatura-tela.js";
import { erroDoCampo } from "./etapa-veiculo.js";

const BLOCOS = [
  { chave: "vistoriador", titulo: "Vistoriador", rotuloNome: "Nome do vistoriador", campo: "vistoriadorNome", arquivo: ARQUIVO.assVistoriador },
  { chave: "motorista", titulo: "Motorista do reboque", rotuloNome: "Nome do motorista do reboque", campo: "motoristaNome", arquivo: ARQUIVO.assMotorista },
];

export function montar(el, editor, ctx) {
  const urls = {}; // URLs das prévias, revogadas ao trocar ou sair
  const tocados = new Set();

  el.innerHTML = `
    <section class="pilha" aria-labelledby="titulo-etapa">
      <div>
        <h2 class="titulo" id="titulo-etapa" tabindex="-1">Responsáveis e assinaturas</h2>
        <p class="texto-2">A data e a hora serão registradas ao finalizar.</p>
      </div>
      ${BLOCOS.map((b) => `
        <div class="secao pilha" data-bloco="${b.chave}">
          <h3 class="subtitulo">${b.titulo}</h3>
          <div class="campo">
            <label class="rotulo" for="${b.chave}-nome">${b.rotuloNome}</label>
            <input class="entrada" id="${b.chave}-nome" type="text" autocomplete="off" autocapitalize="words" aria-describedby="${b.chave}-nome-erro">
            <p class="erro-campo" id="${b.chave}-nome-erro" aria-live="polite"></p>
          </div>
          <div class="campo">
            <p class="rotulo" id="${b.chave}-assinatura-rotulo">Assinatura</p>
            <div class="assinatura-caixa pilha" id="${b.chave}-assinatura" tabindex="-1" role="group" aria-labelledby="${b.chave}-assinatura-rotulo">
              <div class="assinatura-previa" hidden><img alt="Assinatura: ${b.titulo}"></div>
              <div class="linha-acoes">
                <button type="button" class="btn btn-primario" data-assinar="${b.chave}">${icone("editar")} <span>Assinar</span></button>
                <button type="button" class="btn btn-texto" data-limpar="${b.chave}" hidden>${icone("borracha")} Limpar assinatura</button>
              </div>
            </div>
            <p class="erro-campo" id="${b.chave}-assinatura-erro" aria-live="polite"></p>
          </div>
        </div>`).join("")}
    </section>`;

  const mostrarErro = (campo) => {
    const p = $(`#${campo}-erro`, el);
    if (p) p.textContent = tocados.has(campo) ? erroDoCampo(editor.rascunho, campo) : "";
  };

  for (const b of BLOCOS) {
    const nome = $(`#${b.chave}-nome`, el);
    nome.value = editor.rascunho.dados[b.campo];
    nome.addEventListener("input", () => {
      editor.alterar((d) => { d[b.campo] = nome.value; });
      if (tocados.has(`${b.chave}-nome`)) mostrarErro(`${b.chave}-nome`);
    });
    nome.addEventListener("blur", () => {
      tocados.add(`${b.chave}-nome`);
      mostrarErro(`${b.chave}-nome`);
    });

    if (editor.rascunho.dados.assinaturas[b.chave]) {
      editor.lerArquivo(b.arquivo).then((blob) => blob && mostrar(b.chave, blob)).catch(() => {});
    }
  }

  // Nome do vistoriador sugerido com o último usado neste aparelho.
  if (!editor.rascunho.dados.vistoriadorNome) {
    ctx.storage.obterMeta(`ultimoVistoriador:${editor.rascunho.userId}`).then((ultimo) => {
      const input = $("#vistoriador-nome", el);
      if (!ultimo || !input || input.value) return;
      input.value = ultimo;
      editor.alterar((d) => { d.vistoriadorNome = ultimo; }, { sugestao: true });
    }).catch(() => {});
  }

  // Prévia da assinatura gravada (ou volta ao botão "Assinar" quando blob é null).
  function mostrar(chave, blob) {
    const caixa = $(`#${chave}-assinatura`, el);
    if (!caixa) return;
    if (urls[chave]) URL.revokeObjectURL(urls[chave]);
    urls[chave] = blob ? URL.createObjectURL(blob) : null;
    const previa = $(".assinatura-previa", caixa);
    previa.hidden = !blob;
    if (blob) $("img", previa).src = urls[chave];
    else $("img", previa).removeAttribute("src");
    const assinar = $("[data-assinar]", caixa);
    $("span", assinar).textContent = blob ? "Assinar de novo" : "Assinar";
    assinar.classList.toggle("btn-primario", !blob);
    assinar.classList.toggle("btn-secundario", Boolean(blob));
    $("[data-limpar]", caixa).hidden = !blob;
  }

  async function assinar(b) {
    const blob = await abrirTelaAssinatura({ titulo: b.titulo });
    if (!blob) return;
    try {
      await editor.gravarArquivo(b.arquivo, blob, (d) => { d.assinaturas[b.chave] = true; });
      mostrar(b.chave, blob);
    } catch (e) {
      ctx.avisar(e.message, "erro");
    }
    tocados.add(`${b.chave}-assinatura`);
    mostrarErro(`${b.chave}-assinatura`);
  }

  async function limpar(b) {
    const titulo = b.titulo.toLowerCase();
    if (!(await ctx.confirmar({ titulo: `Apagar a assinatura do ${titulo}?`, ok: "Apagar", perigo: true }))) return;
    try {
      await editor.apagarArquivo(b.arquivo, (d) => { d.assinaturas[b.chave] = false; });
      mostrar(b.chave, null);
    } catch (e) {
      ctx.avisar(e.message, "erro");
    }
    tocados.add(`${b.chave}-assinatura`);
    mostrarErro(`${b.chave}-assinatura`);
  }

  el.addEventListener("click", (e) => {
    const chaveAssinar = e.target.closest("[data-assinar]")?.dataset.assinar;
    if (chaveAssinar) return assinar(BLOCOS.find((b) => b.chave === chaveAssinar));
    const chaveLimpar = e.target.closest("[data-limpar]")?.dataset.limpar;
    if (chaveLimpar) return limpar(BLOCOS.find((b) => b.chave === chaveLimpar));
  });

  return {
    mostrarTodos() {
      $$("[data-bloco]", el).forEach((b) => {
        for (const c of [`${b.dataset.bloco}-nome`, `${b.dataset.bloco}-assinatura`]) {
          tocados.add(c);
          mostrarErro(c);
        }
      });
    },
    desmontar() {
      Object.values(urls).forEach((u) => u && URL.revokeObjectURL(u));
    },
  };
}
