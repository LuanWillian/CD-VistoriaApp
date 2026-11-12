// Formulário "Registrar recebimento" (conta de loja): conforme ou com divergência,
// descrição e fotos da divergência, assinatura de quem recebe. Tudo o que é
// preenchido fica guardado no aparelho até a confirmação dar certo.
// Resolve com o recebimento gravado no servidor, ou null se fechar sem confirmar.
import { ARQUIVO, arquivoReceb, chaveLocal, formatarMarca } from "../formatos.js";
import { JaRecebidoError, chaveRascunhoReceb, enviarRecebimento } from "../recebimento-envio.js";
import { textoJaRecebido, validarRecebimento } from "../recebimento-dados.js";
import { $, $$, esc, icone } from "../ui.js";
import { abrirTelaAssinatura } from "../assinatura-tela.js";
import { comprimir, escolherFoto } from "../photos.js";

const PADRAO = { abrirAssinatura: abrirTelaAssinatura, escolherFoto, comprimir };

export function abrirFormRecebimento({ vistoria, ctx, deps = {} }) {
  const { abrirAssinatura, escolherFoto: escolher, comprimir: comprimirFoto } = { ...PADRAO, ...deps };
  const usuario = ctx.auth.usuarioAtual();
  const pasta = chaveRascunhoReceb(vistoria.id);
  const urls = [];

  return new Promise((resolver) => {
    let resultado = null;
    let rascunho = { id: crypto.randomUUID(), status: "", descricao: "", fotos: [], assinatura: false };
    let enviando = false;

    const d = document.createElement("dialog");
    d.className = "cheio receb-form";
    d.setAttribute("aria-labelledby", "receb-titulo");
    const veiculo = [formatarMarca(vistoria.marca ?? ""), vistoria.modelo].filter(Boolean).join(" ");
    const sub = [veiculo && esc(veiculo), vistoria.chassi && `<span class="cm-mono">${esc(vistoria.chassi)}</span>`, vistoria.numero && esc(vistoria.numero)].filter(Boolean).join(" · ");
    d.innerHTML = `
      <div class="cheio-topo">
        <div class="cm-form-titulo">
          <h2 id="receb-titulo">Registrar recebimento</h2>
          ${sub ? `<p class="cm-form-sub">${sub}</p>` : ""}
        </div>
        <button type="button" class="btn-topo" data-acao="cancelar" aria-label="Fechar">${icone("x")}</button>
      </div>
      <div class="cheio-corpo pilha">
        <div class="cm-cartao">
          <div class="cm-cartao-cabeca"><h3 id="receb-status-rotulo">Como o carro chegou?</h3></div>
          <div class="cm-cartao-corpo">
            <div class="receb-opcoes" role="radiogroup" aria-labelledby="receb-status-rotulo">
              <button type="button" role="radio" aria-checked="false" data-status="conforme"><span class="cm-radio" aria-hidden="true"></span>${icone("checkCirculo")} Recebido conforme a vistoria</button>
              <button type="button" role="radio" aria-checked="false" data-status="divergencia"><span class="cm-radio" aria-hidden="true"></span>${icone("alerta")} Recebido com divergência</button>
            </div>
            <p class="erro-campo" id="receb-erro-status" aria-live="polite"></p>
          </div>
        </div>
        <div class="campo cm-cartao" hidden>
          <div class="cm-cartao-cabeca"><h3>Divergência</h3></div>
          <div class="cm-cartao-corpo">
            <label class="rotulo" for="receb-descricao">O que está diferente?</label>
            <textarea class="entrada" id="receb-descricao" rows="3" placeholder="Ex.: risco novo na porta traseira direita"></textarea>
            <p class="erro-campo" id="receb-erro-descricao" aria-live="polite"></p>
            <p class="rotulo cm-rotulo-fotos">Fotos da divergência <span class="opcional">opcional, mas ajudam muito</span></p>
            <div class="cm-receb-fotos">
              <div class="miniaturas" id="receb-fotos"></div>
              <button type="button" class="cm-foto-add" data-acao="foto">${icone("camera")}<span>Adicionar foto</span></button>
            </div>
          </div>
        </div>
        <div class="cm-cartao">
          <div class="cm-cartao-cabeca"><h3>Assinatura de quem recebe</h3></div>
          <div class="cm-cartao-corpo">
            <div class="assinatura-ver" id="receb-assinatura-previa"></div>
            <div class="cm-assin-linha">
              <p class="cm-nota">Recebido por: ${esc(usuario.nome || "")} — ${esc(usuario.loja || "")}</p>
              <button type="button" class="btn btn-secundario cm-btn" data-acao="assinar">${icone("editar")} Assinar</button>
            </div>
            <p class="erro-campo" id="receb-erro-assinatura" aria-live="polite"></p>
          </div>
        </div>
        <p class="cm-nota cm-nota-trava">Depois de confirmar não dá para alterar. O CD vê o recebimento na hora.</p>
        <p class="erro-form" id="receb-falha" role="alert" hidden></p>
      </div>
      <div class="cheio-rodape">
        <button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>
        <button type="button" class="btn btn-primario" data-acao="confirmar">Confirmar recebimento</button>
      </div>`;

    const descricao = $("#receb-descricao", d);
    const campoDivergencia = descricao.closest(".campo");
    const blobUrl = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };

    const guardar = () => ctx.storage.salvarRascunhoRecebimento(vistoria.id, rascunho).catch(console.error);
    const ler = (nome) => ctx.storage.obterArquivo(chaveLocal(pasta, nome));

    async function desenhar() {
      $$('[role="radio"]', d).forEach((b) => b.setAttribute("aria-checked", String(b.dataset.status === rascunho.status)));
      campoDivergencia.hidden = rascunho.status !== "divergencia";
      descricao.value = rascunho.descricao;
      const fotos = [];
      for (const id of rascunho.fotos) {
        const blob = await ler(arquivoReceb(id));
        if (blob) fotos.push(`<div class="miniatura"><img src="${blobUrl(blob)}" alt="Foto da divergência"></div>`);
      }
      $("#receb-fotos", d).innerHTML = fotos.join("");
      const ass = rascunho.assinatura ? await ler(ARQUIVO.recebAssinatura) : null;
      $("#receb-assinatura-previa", d).innerHTML = ass ? `<img src="${blobUrl(ass)}" alt="Assinatura de quem recebe">` : "";
    }

    function mostrarErros(erros) {
      for (const campo of ["status", "descricao", "assinatura"]) {
        $(`#receb-erro-${campo}`, d).textContent = erros.find((e) => e.campo === campo)?.mensagem || "";
      }
    }

    function fechar(r) {
      resultado = r;
      d.close();
    }

    async function confirmar() {
      if (enviando) return;
      const erros = validarRecebimento(rascunho);
      mostrarErros(erros);
      if (erros.length) return;
      if (!(await ctx.confirmar({ titulo: "Confirmar recebimento?", texto: "Depois de confirmar não dá para alterar.", ok: "Confirmar" }))) return;
      enviando = true;
      const botao = $('[data-acao="confirmar"]', d);
      botao.disabled = true;
      botao.innerHTML = `${icone("carregando", "ic gira")} Enviando…`;
      const falha = $("#receb-falha", d);
      falha.hidden = true;
      try {
        const r = await enviarRecebimento({ remoto: ctx.remoto, storage: ctx.storage, usuario, vistoria, rascunho });
        ctx.avisar("Recebimento registrado.", "sucesso");
        fechar(r);
      } catch (e) {
        if (e instanceof JaRecebidoError) {
          await ctx.storage.excluirRascunhoRecebimento(vistoria.id);
          ctx.avisar(textoJaRecebido(e.recebimento), "erro");
          fechar(e.recebimento);
          return;
        }
        console.error(e);
        const c = ctx.remoto.classificarErro(e, ctx.online());
        falha.textContent = c.tipo === "rede" || c.tipo === "sessao"
          ? "Não foi possível enviar. Nada foi perdido."
          : (e?.code ? c.mensagem : e.message);
        falha.hidden = false;
        botao.disabled = false;
        botao.textContent = "Tentar de novo";
      } finally {
        enviando = false;
      }
    }

    d.addEventListener("click", async (e) => {
      const radio = e.target.closest("[data-status]");
      if (radio) {
        rascunho.status = radio.dataset.status;
        $("#receb-erro-status", d).textContent = "";
        // A tela muda na hora (a parte síncrona de desenhar); depois grava.
        desenhar();
        await guardar();
        return;
      }
      const acao = e.target.closest("[data-acao]")?.dataset.acao;
      if (acao === "cancelar") d.close();
      if (acao === "confirmar") await confirmar();
      if (acao === "foto") {
        const arquivo = await escolher();
        if (!arquivo) return;
        try {
          const id = crypto.randomUUID();
          await ctx.storage.salvarArquivo(chaveLocal(pasta, arquivoReceb(id)), await comprimirFoto(arquivo));
          rascunho.fotos.push(id);
          await guardar();
          await desenhar();
        } catch (err) {
          ctx.avisar(err.message, "erro");
        }
      }
      if (acao === "assinar") {
        const blob = await abrirAssinatura({ titulo: `Recebido por ${usuario.nome || ""}` });
        if (!blob) return;
        await ctx.storage.salvarArquivo(chaveLocal(pasta, ARQUIVO.recebAssinatura), blob);
        rascunho.assinatura = true;
        $("#receb-erro-assinatura", d).textContent = "";
        await guardar();
        await desenhar();
      }
    });
    descricao.addEventListener("input", () => {
      rascunho.descricao = descricao.value;
      $("#receb-erro-descricao", d).textContent = "";
      guardar();
    });
    d.addEventListener("cancel", (e) => { if (enviando) e.preventDefault(); });
    d.addEventListener("close", () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      d.remove();
      resolver(resultado);
    });

    // Lê o que já foi preenchido ANTES de abrir: a tela nunca aparece vazia e um
    // toque rápido não é sobrescrito pelo rascunho guardado.
    ctx.storage.obterRascunhoRecebimento(vistoria.id).catch(() => null).then((salvo) => {
      if (salvo) rascunho = { ...rascunho, ...salvo };
      document.body.append(d);
      d.showModal();
      return desenhar();
    }).catch(console.error);
  });
}
