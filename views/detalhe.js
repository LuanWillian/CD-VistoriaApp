// Detalhe da vistoria (somente leitura): dados, fotos, checklist, avarias,
// assinaturas e as ações Baixar PDF, Compartilhar (não existe no computador) e Excluir.
import { CHECKLIST_ITENS, FOTOS_VEICULO } from "../config.js";
import {
  ARQUIVO, arquivoAvaria, arquivosDaVistoria, arquivosDoRecebimento, caminhoDoArquivo, chaveLocal, formatarDataHora, formatarKm,
  formatarMarca, nomeVistoria,
} from "../formatos.js";
import { htmlCardRecebimento } from "./card-recebimento.js";
import { abrirFormRecebimento } from "./form-recebimento.js";
import { situacaoRecebimento } from "../recebimento-dados.js";
import { $, esc, icone, carregandoHtml } from "../ui.js";
import { gerarPdf } from "../pdf.js";
import { emDesktop, ligarAmpliar, miniaturaHtml } from "../photos.js";

const SELO = {
  sincronizada: ["selo-sincronizada", "check", "Sincronizada"],
  pendente: ["selo-pendente", "atualizar", "Pendente"],
  erro: ["selo-erro", "alerta", "Erro ao enviar"],
};
export const seloStatus = (status) => {
  const [classe, ic, texto] = SELO[status] || SELO.pendente;
  return `<span class="selo ${classe}">${icone(ic)} ${texto}</span>`;
};

// Mantém o PDF pronto para a vistoria atual. Se o número oficial chegar durante
// a geração, gera de novo: o laudo nunca fica com o número provisório.
export function criarPdfPronto({ gerar, atual }) {
  let pdf = null;
  let numeroDoPdf;
  let erro = null;
  async function preparar() {
    do {
      const alvo = atual();
      try {
        pdf = await gerar(alvo);
        numeroDoPdf = alvo.numero;
        erro = null;
      } catch (e) {
        pdf = null;
        erro = e;
        return;
      }
    } while (atual().numero !== numeroDoPdf);
  }
  return {
    preparar,
    obter: () => pdf,
    erro: () => erro,
    desatualizado: () => Boolean(pdf) && atual().numero !== numeroDoPdf,
  };
}

function telaSimples(el, titulo, texto, desktop) {
  el.innerHTML = `
    <div class="vazio">
      <p class="titulo">${esc(titulo)}</p>
      <p>${esc(texto)}</p>
      <a class="btn btn-secundario" href="${desktop ? "#/inicio" : "#/vistorias"}">${icone("voltar")} Voltar para ${desktop ? "o início" : "Vistorias"}</a>
    </div>`;
}

export async function montar(el, ctx, params) {
  const { id } = params;
  // modo "loja": conta de loja conferindo o carro (sem PDF, Compartilhar e Excluir).
  const modoLoja = params.modo === "loja";
  const nova = params.busca.has("nova");
  const usuario = ctx.auth.usuarioAtual();
  const urls = [];
  let ativo = true;
  el.innerHTML = carregandoHtml();

  // ---------- Carregamento ----------
  async function baixarCompleta() {
    const completa = await ctx.remoto.obterVistoriaCompleta(id);
    for (const nome of [...arquivosDaVistoria(completa), ...arquivosDoRecebimento(completa)]) {
      try {
        const blob = await ctx.remoto.baixarArquivo(caminhoDoArquivo(completa, nome));
        await ctx.storage.salvarArquivo(chaveLocal(id, nome), blob);
      } catch {
        // arquivo indisponível agora: a tela usa URL assinada e o PDF tenta de novo depois
      }
    }
    const v = { ...completa, completa: true, arquivosSalvosEm: new Date().toISOString() };
    await ctx.storage.salvarVistoria(v);
    return v;
  }

  let v = await ctx.storage.obterVistoria(id);
  // Todos veem as vistorias já enviadas; a que ainda está só neste aparelho
  // (pendente ou com erro) de outra pessoa continua privada.
  if (v && v.userId !== usuario.id && v.status !== "sincronizada") v = null;
  // Excluir só existe no navegador do computador (qualquer conta pode excluir). No app
  // instalado e no navegador de celular/tablet a opção não aparece.
  const podeExcluir = () => ctx.desktop && !modoLoja;
  try {
    if ((!v || (v.origem === "remota" && !v.completa)) && ctx.online()) v = await baixarCompleta();
    // O recebimento na loja acontece depois do envio: com internet, sempre o do servidor.
    else if (v?.numero && ctx.online() && ctx.remoto.obterRecebimento) {
      v = { ...v, recebimento: await ctx.remoto.obterRecebimento(id) };
      await ctx.storage.salvarVistoria(v);
    }
  } catch (e) {
    console.error(e);
  }
  if (!ativo) return {};
  if (!v) {
    telaSimples(el, "Vistoria não encontrada", ctx.online() ? "Ela pode ter sido excluída." : "Conecte-se à internet para ver esta vistoria.", ctx.desktop);
    return {};
  }
  if (v.origem === "remota" && !v.completa) {
    telaSimples(el, "Vistoria ainda não baixada", "Conecte-se à internet para ver esta vistoria.", ctx.desktop);
    return {};
  }
  if (v.status === "excluindo") {
    telaSimples(el, "Vistoria excluída", "A exclusão será concluída no servidor quando houver internet.", ctx.desktop);
    return {};
  }

  // ---------- Imagens: blob local, senão URL assinada ----------
  const fontes = new Map();
  async function carregarFontes() {
    const faltando = [];
    for (const nome of [...arquivosDaVistoria(v), ...arquivosDoRecebimento(v)]) {
      const blob = await ctx.storage.obterArquivo(chaveLocal(id, nome));
      if (blob) {
        const u = URL.createObjectURL(blob);
        urls.push(u);
        fontes.set(nome, u);
      } else {
        faltando.push(nome);
      }
    }
    if (faltando.length && ctx.online() && v.numero) {
      try {
        const assinadas = await ctx.remoto.urlsAssinadas(faltando.map((n) => caminhoDoArquivo(v, n)));
        faltando.forEach((n) => {
          const u = assinadas.get(caminhoDoArquivo(v, n));
          if (u) fontes.set(n, u);
        });
      } catch { /* sem imagens remotas agora */ }
    }
  }

  async function obterImagem(nome) {
    const local = await ctx.storage.obterArquivo(chaveLocal(id, nome));
    if (local) return local;
    if (!ctx.online() || !v.numero) return null;
    try {
      const blob = await ctx.remoto.baixarArquivo(caminhoDoArquivo(v, nome));
      await ctx.storage.salvarArquivo(chaveLocal(id, nome), blob);
      return blob;
    } catch {
      return null;
    }
  }

  await carregarFontes();
  if (!ativo) return {};

  // ---------- HTML ----------
  const img = (nome, legenda) => (fontes.get(nome)
    ? miniaturaHtml(fontes.get(nome), legenda)
    : `<div class="miniatura"><span class="sem-foto" role="img" aria-label="${esc(legenda)}: foto indisponível">${icone("imagem", "ic ic-lg")}</span></div>`);

  const situacao = (item) => ({ presente: '<span class="presente">Ok</span>', ausente: '<span class="ausente">Ausente</span>' })[v.checklist?.[item]] || "—";
  const itens = [...CHECKLIST_ITENS, ...Object.keys(v.checklist || {}).filter((i) => !CHECKLIST_ITENS.includes(i))];

  function htmlAvarias() {
    if (v.semAvarias || !v.avarias.length) return '<p class="texto-2">Veículo sem avarias registradas.</p>';
    return `<div class="lista">${v.avarias.map((a, i) => `
      <article class="cartao avaria-cartao">
        <div class="avaria-faixa ${a.gravidade.toLowerCase()}" aria-hidden="true"></div>
        <div class="avaria-corpo">
          <p class="pequeno texto-2">Avaria ${i + 1}</p>
          <p class="avaria-titulo">${esc(a.area)} — ${esc(a.tipo)}</p>
          <p><span class="selo selo-${a.gravidade.toLowerCase()}">${esc(a.gravidade)}</span></p>
          ${a.descricao ? `<p>${esc(a.descricao)}</p>` : ""}
          ${a.fotos.length ? `<div class="miniaturas">${a.fotos.map((f, j) => img(arquivoAvaria(f), `Avaria ${i + 1}, foto ${j + 1}`)).join("")}</div>` : '<p class="pequeno texto-2">Sem foto.</p>'}
        </div>
      </article>`).join("")}</div>`;
  }

  function desenhar() {
    const cardReceb = htmlCardRecebimento(v, fontes);
    const podeReceber = modoLoja && situacaoRecebimento(v) === "aguardando";
    const veiculo = [formatarMarca(v.marca ?? ""), v.modelo].filter(Boolean).join(" ");
    const temKm = v.km !== null && v.km !== undefined && v.km !== "";
    // Computador: nome do veículo em destaque e uma linha com chassi, cor, km, combustível e loja.
    const heroi = !ctx.desktop ? "" : `
          <p class="det-veiculo">${esc(veiculo || "Veículo")}</p>
          <p class="det-meta">${[
    v.chassi ? `<span class="det-meta-chassi">${esc(v.chassi)}</span>` : "",
    v.cor ? `<span>${esc(v.cor)}</span>` : "",
    temKm ? `<span>${formatarKm(v.km)} km</span>` : "",
    v.combustivel ? `<span>${esc(v.combustivel)}</span>` : "",
    v.loja ? `<span class="det-meta-loja">${icone("loja", "ic det-meta-ic")}${esc(v.loja)}</span>` : "",
  ].join("")}</p>`;

    const secLoja = v.loja ? `<section class="secao det-loja" aria-labelledby="h-loja">
          <h2 id="h-loja">Loja de destino</h2>
          <p class="loja-destino"><span class="loja-icone" aria-hidden="true">${icone("loja")}</span><span>${esc(v.loja)}</span></p>
        </section>` : "";
    const secDados = `<section class="secao det-dados" aria-labelledby="h-dados">
          <h2 id="h-dados">Dados do veículo</h2>
          <dl class="dados">
            ${[["Chassi", v.chassi], ["Marca", formatarMarca(v.marca ?? "")], ["Modelo", v.modelo], ["Cor", v.cor], ["Km", `${formatarKm(v.km)} km`], ["Combustível", v.combustivel]]
              .map(([k, val]) => `<div><dt>${k}</dt><dd>${esc(val ?? "—")}</dd></div>`).join("")}
          </dl>
        </section>`;
    const secFotos = `<section class="secao det-fotos" aria-labelledby="h-fotos">
          <h2 id="h-fotos">Fotos do veículo</h2>
          <div class="fotos-detalhe">
            ${FOTOS_VEICULO.map((f) => `<figure>${img(ARQUIVO[f.chave], f.rotulo)}<figcaption>${f.rotulo}</figcaption></figure>`).join("")}
          </div>
        </section>`;
    const ausentes = itens.filter((i) => v.checklist?.[i] === "ausente").length;
    const secChecklist = `<section class="secao det-checklist" aria-labelledby="h-checklist">
          <h2 id="h-checklist">Checklist${ctx.desktop ? ` <span class="det-contagem">${ausentes ? `${ausentes} ${ausentes === 1 ? "ausente" : "ausentes"}` : "tudo ok"}</span>` : ""}</h2>
          <ul class="lista-checklist">${itens.map((i) => `<li><span>${esc(i)}</span>${situacao(i)}</li>`).join("")}</ul>
          ${v.checklistObs ? `<p class="pequeno"><strong>Observação:</strong> ${esc(v.checklistObs)}</p>` : ""}
        </section>`;
    const secAvarias = `<section class="secao det-avarias" aria-labelledby="h-avarias">
          <h2 id="h-avarias">Avarias${ctx.desktop && !v.semAvarias && v.avarias.length ? ` <span class="det-contagem">${v.avarias.length}</span>` : ""}</h2>
          ${htmlAvarias()}
        </section>`;
    const secAssin = `<section class="secao det-assin" aria-labelledby="h-assinaturas">
          <h2 id="h-assinaturas">Assinaturas</h2>
          <div class="assinaturas">
            ${[[ARQUIVO.assVistoriador, v.vistoriadorNome, "Vistoriador"], [ARQUIVO.assMotorista, v.motoristaNome, "Motorista do reboque"]].map(([arq, nomePessoa, funcao]) => `
              <div>
                <div class="assinatura-ver">${fontes.get(arq) ? `<img src="${fontes.get(arq)}" alt="Assinatura: ${esc(nomePessoa)}">` : ""}</div>
                <p><strong>${esc(nomePessoa)}</strong></p>
                <p class="pequeno texto-2">${funcao} · ${formatarDataHora(v.realizadaEm)}</p>
              </div>`).join("")}
          </div>
        </section>`;

    // A ordem dos blocos no HTML é a mesma em todo lugar (ordem de leitura).
    // Computador: os blocos vão em dois invólucros; o CSS põe a lateral (loja,
    // dados, recebimento) à direita e a principal (fotos, checklist, avarias,
    // assinaturas) à esquerda, sem buracos entre os blocos.
    const corpo = ctx.desktop
      ? `<div class="detalhe-corpo det-colunas">
        <div class="det-lateral">${secLoja}${secDados}${cardReceb}</div>
        <div class="det-principal">${secFotos}${secChecklist}${secAvarias}${secAssin}</div>
      </div>`
      : `<div class="detalhe-corpo${v.loja ? " com-loja" : ""}${cardReceb ? " com-receb" : ""}">
        ${secLoja}${secDados}${cardReceb}
        <div class="det-dir">${secFotos}${secChecklist}</div>
        ${secAvarias}${secAssin}
      </div>`;

    el.innerHTML = `
      <div class="pilha detalhe-pagina">
        ${modoLoja
    ? `<a class="btn btn-texto" href="#/recebimentos">${icone("voltar")} Recebimentos</a>`
    : `<a class="btn btn-texto" href="${ctx.desktop ? "#/inicio" : "#/vistorias"}">${icone("voltar")} ${ctx.desktop ? "Início" : "Vistorias"}</a>`}
        <div id="faixa-nova" role="status" aria-live="polite"></div>
        <div class="pilha detalhe-cabeca">
        <header class="cartao detalhe-topo">
          <div class="entre">
            <h1 class="titulo" id="detalhe-numero">${esc(nomeVistoria(v))}</h1>
            <span id="detalhe-selo">${seloStatus(v.status)}</span>
          </div>${heroi}
          <p class="texto-2">Realizada em ${formatarDataHora(v.realizadaEm)}</p>
          <div id="detalhe-erro"></div>
        </header>
        <div class="acoes-detalhe"${modoLoja ? " hidden" : ""}>
          ${modoLoja ? "" : `<button type="button" class="btn btn-primario" id="btn-baixar" disabled>${icone("pdf")} Preparando PDF…</button>`}
          ${ctx.desktop || modoLoja ? "" : `<button type="button" class="btn btn-secundario" id="btn-compartilhar" disabled>${icone("compartilhar")} Compartilhar</button>`}
          ${nova && !ctx.desktop ? `<a class="btn btn-secundario" href="#/nova?novo=1">${icone("mais")} Nova vistoria</a>` : ""}
          ${podeExcluir() ? `<button type="button" class="btn btn-perigo" id="btn-excluir">${icone("lixeira")} Excluir</button>` : ""}
        </div>
        </div>
        ${corpo}
        ${podeReceber ? `<div class="receb-acao"><button type="button" class="btn btn-primario btn-bloco" id="btn-receber">${icone("check")} Registrar recebimento</button></div>` : ""}
      </div>`;
  }

  desenhar();
  // No computador (tela larga com mouse) a foto abre no visualizador grande.
  ligarAmpliar(el, { grande: () => ctx.desktop && emDesktop() });

  // ---------- Status e faixa de envio ----------
  let sincronizando = false;
  function atualizarStatus() {
    $("#detalhe-numero", el).textContent = nomeVistoria(v);
    $("#detalhe-selo", el).innerHTML = seloStatus(v.status);
    $("#detalhe-erro", el).innerHTML = v.status === "erro"
      ? `<div class="faixa-status erro">${icone("alerta")} <span>${esc(v.erro || "Erro ao enviar.")}</span>
           <button type="button" class="btn btn-secundario" id="btn-tentar">Tentar novamente</button></div>`
      : "";
    if (!nova) return;
    let classe = "pendente", texto = "Vistoria salva. Enviando…";
    if (v.status === "sincronizada") { classe = "ok"; texto = `Vistoria enviada: ${v.numero}`; }
    else if (v.status === "erro") { classe = "erro"; texto = "Vistoria salva no aparelho, mas o envio falhou."; }
    else if (!ctx.online()) texto = "Sem internet: será enviada quando a conexão voltar.";
    else if (!sincronizando) texto = "Vistoria salva. Aguardando envio…";
    $("#faixa-nova", el).innerHTML = `<div class="faixa-status ${classe}">${icone(classe === "ok" ? "check" : classe === "erro" ? "alerta" : "nuvem")} ${esc(texto)}</div>`;
  }

  // ---------- PDF pronto antes do toque (exigência do compartilhamento no iPhone) ----------
  const btnBaixar = () => $("#btn-baixar", el);
  const btnCompartilhar = () => $("#btn-compartilhar", el);
  const pdfPronto = criarPdfPronto({ gerar: (alvo) => gerarPdf(alvo, obterImagem), atual: () => v });
  async function prepararPdf() {
    if (!btnBaixar()) return; // modo loja: sem PDF
    btnBaixar().disabled = true;
    if (btnCompartilhar()) btnCompartilhar().disabled = true;
    btnBaixar().innerHTML = `${icone("carregando", "ic gira")} Preparando PDF…`;
    await pdfPronto.preparar();
    if (!ativo) return;
    btnBaixar().disabled = false;
    if (btnCompartilhar()) btnCompartilhar().disabled = false;
    btnBaixar().innerHTML = `${icone("pdf")} Baixar PDF`;
  }

  async function garantirPdf() {
    if (!pdfPronto.obter()) await prepararPdf();
    const pdf = pdfPronto.obter();
    if (!pdf) {
      ctx.avisar(pdfPronto.erro()?.message || "Não foi possível gerar o PDF.", "erro");
      return null;
    }
    return pdf;
  }

  function baixar(p) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(p.blob);
    a.download = p.nomeArquivo;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  // ---------- Ações ----------
  el.addEventListener("click", async (e) => {
    const alvo = e.target.closest("button");
    if (!alvo) return;
    if (alvo.id === "btn-baixar") {
      const p = await garantirPdf();
      if (p) baixar(p);
    }
    if (alvo.id === "btn-compartilhar") {
      const p = await garantirPdf();
      if (!p) return;
      const arquivo = new File([p.blob], p.nomeArquivo, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: `Laudo ${nomeVistoria(v)}` });
        } catch (err) {
          if (err?.name !== "AbortError") ctx.avisar("Não foi possível compartilhar o PDF.", "erro");
        }
      } else {
        baixar(p);
        ctx.avisar("Compartilhamento indisponível neste navegador; o PDF foi baixado.");
      }
    }
    if (alvo.id === "btn-tentar") ctx.sincronizar ? ctx.sincronizar() : ctx.sync.sincronizar();
    if (alvo.id === "btn-excluir") await excluir();
    if (alvo.id === "btn-receber") await receber();
  });

  // Conta de loja: registra o recebimento e mostra o card já preenchido.
  async function receber() {
    const r = await abrirFormRecebimento({ vistoria: v, ctx, deps: ctx.depsRecebimento });
    if (!r || !ativo) return;
    v = { ...v, recebimento: r };
    await ctx.storage.salvarVistoria(v);
    await carregarFontes();
    if (!ativo) return;
    desenhar();
    atualizarStatus();
  }

  async function excluir() {
    if (!podeExcluir()) return; // só no computador
    const ok = await ctx.confirmar({
      titulo: `Excluir a vistoria ${nomeVistoria(v)}?`,
      texto: "Isso apaga também as fotos e assinaturas no servidor e não pode ser desfeito.",
      ok: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    const atual = (await ctx.storage.obterVistoria(id)) || v;
    const soNoAparelho = !ctx.online() && atual.origem === "local" && !atual.numero && !(atual.enviados || []).length;
    if (soNoAparelho) {
      await ctx.storage.excluirVistoriaLocal(id);
    } else {
      await ctx.storage.salvarVistoria({ ...atual, status: "excluindo" });
      // userId: quem exclui (a fila é por conta); donoId: de quem é a pasta de arquivos no servidor.
      await ctx.storage.enfileirarExclusao({
        id, userId: usuario.id, donoId: atual.userId, donoRecebimento: atual.recebimento?.userId || v.recebimento?.userId || null,
        criadoEm: new Date().toISOString(),
      });
      (ctx.sincronizar || ctx.sync.sincronizar)();
    }
    ctx.avisar("Vistoria excluída.", "sucesso");
    ctx.navegar(ctx.desktop ? "#/inicio" : "#/vistorias");
  }

  const aoMudar = async (e) => {
    sincronizando = Boolean(e.detail?.sincronizando);
    const nova2 = await ctx.storage.obterVistoria(id);
    if (!ativo || !nova2 || nova2.status === "excluindo") return;
    v = { ...v, ...nova2 };
    atualizarStatus();
    if (btnBaixar() && pdfPronto.desatualizado() && !btnBaixar().disabled) prepararPdf();
  };
  ctx.sync.eventos.addEventListener("mudou", aoMudar);

  atualizarStatus();
  prepararPdf();

  return {
    desmontar() {
      ativo = false;
      ctx.sync.eventos.removeEventListener("mudou", aoMudar);
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}
