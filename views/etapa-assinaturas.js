// Etapa 4 — Responsáveis e assinaturas (vistoriador e motorista do reboque).
import { ARQUIVO } from "../formatos.js";
import { $, $$, icone } from "../ui.js";
import { montarAssinatura } from "../signature.js";
import { erroDoCampo } from "./etapa-veiculo.js";

const BLOCOS = [
  { chave: "vistoriador", titulo: "Vistoriador", rotuloNome: "Nome do vistoriador", campo: "vistoriadorNome", arquivo: ARQUIVO.assVistoriador },
  { chave: "motorista", titulo: "Motorista do reboque", rotuloNome: "Nome do motorista do reboque", campo: "motoristaNome", arquivo: ARQUIVO.assMotorista },
];

export function montar(el, editor, ctx) {
  const pads = {};
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
            <div class="entre">
              <p class="rotulo" id="${b.chave}-assinatura-rotulo">Assinatura</p>
              <button type="button" class="btn btn-texto" data-limpar="${b.chave}">${icone("borracha")} Limpar assinatura</button>
            </div>
            <div class="assinatura-quadro" id="${b.chave}-assinatura" tabindex="-1" role="group" aria-labelledby="${b.chave}-assinatura-rotulo">
              <canvas aria-label="Quadro de assinatura: ${b.titulo}"></canvas>
              <p class="assinatura-dica">Assine aqui</p>
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

    const quadro = $(`#${b.chave}-assinatura`, el);
    const dica = $(".assinatura-dica", quadro);
    const pad = montarAssinatura($("canvas", quadro), {
      aoMudar: async (blob) => {
        dica.hidden = Boolean(blob);
        try {
          if (blob) await editor.gravarArquivo(b.arquivo, blob, (d) => { d.assinaturas[b.chave] = true; });
          else await editor.apagarArquivo(b.arquivo, (d) => { d.assinaturas[b.chave] = false; });
        } catch (e) {
          ctx.avisar(e.message, "erro");
        }
        tocados.add(`${b.chave}-assinatura`);
        mostrarErro(`${b.chave}-assinatura`);
      },
    });
    pads[b.chave] = pad;
    if (editor.rascunho.dados.assinaturas[b.chave]) {
      editor.lerArquivo(b.arquivo).then(async (blob) => {
        if (!blob) return;
        await pad.carregar(blob);
        dica.hidden = true;
      });
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

  el.addEventListener("click", async (e) => {
    const chave = e.target.closest("[data-limpar]")?.dataset.limpar;
    if (!chave) return;
    const pad = pads[chave];
    if (pad.vazio()) return;
    const titulo = BLOCOS.find((b) => b.chave === chave).titulo.toLowerCase();
    if (!(await ctx.confirmar({ titulo: `Apagar a assinatura do ${titulo}?`, ok: "Apagar", perigo: true }))) return;
    pad.limpar();
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
      Object.values(pads).forEach((p) => p.destruir());
    },
  };
}
