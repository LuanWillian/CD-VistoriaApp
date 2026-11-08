// Etapa 4 — Responsáveis e assinaturas (vistoriador e motorista do reboque).
// O nome do vistoriador vem da conta (perfil cadastrado pelo administrador) e
// não pode ser editado; o do motorista do reboque é digitado.
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
            ${b.chave === "vistoriador" ? `
            <p class="rotulo" id="vistoriador-nome-rotulo">${b.rotuloNome}</p>
            <p class="nome-da-conta" id="vistoriador-nome" tabindex="-1" aria-labelledby="vistoriador-nome-rotulo" aria-describedby="vistoriador-nome-dica vistoriador-nome-erro"></p>
            <p class="texto-2 dica" id="vistoriador-nome-dica">Vem da sua conta. Para corrigir, fale com o administrador.</p>` : `
            <label class="rotulo" for="${b.chave}-nome">${b.rotuloNome}</label>
            <input class="entrada" id="${b.chave}-nome" type="text" autocomplete="off" autocapitalize="words" aria-describedby="${b.chave}-nome-erro">`}
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

  // Nome do vistoriador: sempre o da conta. Sem nome cadastrado, o aviso aparece já.
  const nomeDaConta = ctx.auth.usuarioAtual()?.nome ?? "";
  if (editor.rascunho.dados.vistoriadorNome !== nomeDaConta) {
    editor.alterar((d) => { d.vistoriadorNome = nomeDaConta; }, { sugestao: true });
  }
  $("#vistoriador-nome", el).textContent = nomeDaConta || "—";
  if (!nomeDaConta) {
    tocados.add("vistoriador-nome");
    mostrarErro("vistoriador-nome");
  }

  for (const b of BLOCOS) {
    if (editor.rascunho.dados.assinaturas[b.chave]) {
      editor.lerArquivo(b.arquivo).then((blob) => blob && mostrar(b.chave, blob)).catch(() => {});
    }
    if (b.chave === "vistoriador") continue;
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
