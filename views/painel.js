// Painel do navegador do computador (#/inicio quando ctx.desktop): saudação,
// título do atalho escolhido na barra lateral, busca, filtros, seleção (PDF de
// várias vistorias), relatório de carros enviados (mensagem do WhatsApp) e tabela
// de vistorias. Só consulta: não existe iniciar vistoria aqui. Os dados são
// os da tela Vistorias (servidor quando há conexão, senão o que está guardado no aparelho).
// As contagens por situação ficam na barra lateral (views/lateral.js).
import { ITENS_POR_PAGINA_PAINEL, LOJAS, NOME_PADRAO_PAINEL } from "../config.js";
import { SEM_LOJA, marcasDisponiveis } from "../dashboard-dados.js";
import { formatarDataHora, formatarMarca, nomeVistoria } from "../formatos.js";
import {
  calcularMetricas, enderecoDasVistorias, filtrarVistorias, filtrosDoEndereco, juntarComServidor, maisRecentesPrimeiro,
  numerosDePagina, paginar, primeiroNome,
} from "../painel-dados.js";
import { contarRecebimentos } from "../recebimento-dados.js";
import { baixarBlob, qtdAvarias } from "../exportar.js";
import { criarObterImagem, vistoriaParaPdf } from "../vistoria-completa.js";
import { gerarPdf } from "../pdf.js";
import { $, $$, icone } from "../ui.js";
import { seloRecebimento } from "./card-recebimento.js";
import { abrirRelatorioEnvios } from "./relatorio-envios.js";
import { atualizarPilula, ligarPilulas, pilulaSelect } from "./pilulas.js";
import { atalhoAtivo, atualizarLateral, filtrosDoAtalho, tituloDoAtalho } from "./lateral.js";

// Mesmos períodos do dashboard, mais "Todo o período" (o padrão da lista).
const PERIODOS = [["todos", "Todo o período"], ["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["personalizado", "Personalizado"]];
const hojeCampo = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const semPrefixo = (loja) => String(loja ?? "").replace(/^PG Prime /, "");
const num = (n) => Number(n).toLocaleString("pt-BR");
const hora = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// Ordem da lista filtrada, para o Anterior/Próxima do detalhe (views/detalhe.js).
export const CHAVE_ORDEM = "cd-vistoria:ordem-da-lista";

// Situação na lista: a vistoria ainda não enviada mostra o envio; a enviada, o recebimento na loja.
function seloSituacao(v) {
  if (v.status === "erro") return `<span class="selo selo-erro">${icone("alerta")} Erro ao enviar</span>`;
  if (v.status !== "sincronizada") return `<span class="selo selo-pendente">${icone("nuvemEnviar")} Pendente de envio</span>`;
  return seloRecebimento(v, { curto: true });
}

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export async function montar(raiz, ctx, params = {}) {
  const usuario = ctx.auth.usuarioAtual();
  const estado = {
    busca: "", periodo: "todos", de: hojeCampo(new Date(Date.now() - 29 * 86400000)), ate: hojeCampo(),
    marca: "", loja: "", recebimento: "", pagina: 0, itens: [], remotos: null, carregando: true,
    selecionadas: new Set(), atualizadoEm: null, gerandoPdf: false,
  };
  let ativo = true;
  let geracao = 0;

  raiz.innerHTML = `
    <div class="cb-painel dashboard-desktop">
      <div class="cb-pagina-cabeca">
        <div>
          <p class="cb-ola" id="dash-saudacao"></p>
          <h1 class="cb-h1 cb-h1-grande" id="dash-titulo">Todas as vistorias</h1>
          <p class="cb-sub" id="dash-status" role="status"></p>
        </div>
        <div class="cb-acoes">
          <button type="button" class="cb-btn cb-btn-alto" id="dash-atualizar">${icone("recarregar")} Atualizar</button>
          <!-- Botão "Relatório de carros enviados" escondido para um teste do usuário (18/11/2026); volta depois. -->
        </div>
      </div>
      <section class="cb-cartao cb-tabela-cartao" aria-labelledby="dash-titulo">
        <div class="cb-ferramentas">
          <div class="cb-busca">${icone("busca")}<input id="dash-busca" type="search" placeholder="Buscar por chassi, marca ou modelo" aria-label="Buscar vistorias" autocomplete="off"></div>
          <span class="cb-divisor" aria-hidden="true"></span>
          ${pilulaSelect({ id: "dash-periodo", rotulo: "Período", opcoes: PERIODOS, valor: "todos", iconeNome: "calendario", sempreAtiva: true })}
          ${pilulaSelect({ id: "dash-marca", rotulo: "Marca", opcoes: [["", "Marca"]], fechar: true })}
          ${pilulaSelect({ id: "dash-loja", rotulo: "Loja de destino", opcoes: [["", "Loja de destino"], ...LOJAS.map((l) => [l, l]), [SEM_LOJA, SEM_LOJA]], fechar: true })}
          <button type="button" class="cb-link cb-limpar" data-limpar hidden>Limpar filtros</button>
          <span class="cb-ordem">Mais recentes primeiro</span>
        </div>
        <div class="cb-datas" id="dash-datas" hidden>
          <label>De <input class="cb-data" type="date" id="dash-de"></label>
          <label>Até <input class="cb-data" type="date" id="dash-ate"></label>
        </div>
        <div class="cb-rolagem-lista">
        <table class="cb-tabela cb-tabela-vistorias">
          <thead>
            <tr>
              <th scope="col" class="cb-col-sel"><input type="checkbox" id="dash-sel-pagina" aria-label="Selecionar as vistorias desta página"></th>
              <th scope="col">Vistoria</th><th scope="col">Data e hora</th><th scope="col">Veículo</th><th scope="col">Chassi</th>
              <th scope="col">Loja de destino</th><th scope="col">Avarias</th><th scope="col">Situação</th>
              <th scope="col"><span class="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody id="dash-corpo"></tbody>
        </table>
        </div>
        <div class="cb-vazio" id="dash-vazio" hidden></div>
        <nav class="cb-paginacao" id="dash-paginacao" aria-label="Paginação" hidden>
          <span id="dash-contador" role="status"></span>
          <span class="cb-paginas">
            <button type="button" class="cb-pag" id="dash-anterior" aria-label="Página anterior">${icone("voltar")}</button>
            <span class="cb-paginas" id="dash-numeros"></span>
            <button type="button" class="cb-pag" id="dash-proxima" aria-label="Próxima página">${icone("avancar")}</button>
          </span>
        </nav>
      </section>
      <div class="cb-selecao" id="dash-selecao" role="region" aria-label="Vistorias selecionadas" hidden>
        <span id="dash-selecionadas"></span>
        <span class="cb-selecao-div" aria-hidden="true"></span>
        <button type="button" class="cb-selecao-pdf" id="dash-pdf-lote">${icone("pdf")}<span id="dash-pdf-texto">Baixar PDF</span></button>
        <button type="button" class="cb-selecao-limpar" id="dash-limpar-sel">Limpar</button>
      </div>
    </div>`;

  ligarPilulas(raiz);
  $("#dash-saudacao", raiz).textContent = `Olá, ${primeiroNome(usuario?.nome) || NOME_PADRAO_PAINEL}`;
  const corpo = $("#dash-corpo", raiz);

  // ---------- Dados ----------
  async function lerLocais() {
    const locais = (await ctx.storage.listarVistorias(usuario.id)).filter((v) => v.status !== "excluindo");
    if (ctx.online() && estado.remotos) {
      // Mesma regra da tela Vistorias: o servidor manda; do aparelho só entram as ainda não enviadas.
      const porId = new Map(estado.remotos.map((v) => [v.id, v]));
      for (const v of locais) {
        if (porId.has(v.id)) porId.set(v.id, juntarComServidor(porId.get(v.id), v));
        else if (v.status !== "sincronizada") porId.set(v.id, v);
      }
      return [...porId.values()].filter((v) => v.status !== "excluindo");
    }
    const doAparelho = new Map(locais.map((v) => [v.id, v]));
    for (const v of await ctx.storage.listarSincronizadas()) if (!doAparelho.has(v.id)) doAparelho.set(v.id, v);
    return [...doAparelho.values()].filter((v) => v.status !== "excluindo");
  }

  // Busca TODAS as vistorias do servidor (blocos de 1000, sem teto) e guarda de
  // uma vez as que faltam no aparelho, para o painel funcionar offline depois.
  async function buscarRemotos() {
    estado.remotos = null;
    if (!ctx.online()) return;
    try {
      const todos = await ctx.remoto.listarTodasVistorias();
      estado.remotos = todos;
      estado.atualizadoEm = new Date();
      await ctx.storage.guardarSeAusentes(todos);
    } catch (e) {
      console.error(e);
    }
  }

  // ---------- Desenho ----------
  function linha(v) {
    const tr = el("tr");
    tr.dataset.id = v.id;
    const marcada = estado.selecionadas.has(v.id);
    tr.classList.toggle("cb-marcada", marcada);

    const sel = el("td", "cb-col-sel");
    const rotulo = el("label", "cb-sel");
    const caixa = el("input");
    caixa.type = "checkbox";
    caixa.checked = marcada;
    caixa.dataset.sel = v.id;
    caixa.setAttribute("aria-label", `Selecionar a vistoria ${nomeVistoria(v)}`);
    rotulo.append(caixa);
    sel.append(rotulo);

    const id = el("td", `cb-mono cb-col-id ${v.status === "sincronizada" ? "cb-cinza-escuro" : "cb-pendente-texto"}`, nomeVistoria(v));
    // Data forte e hora em cinza.
    const data = el("td", "cb-tnum cb-col-data");
    const [dia, horaTexto] = formatarDataHora(v.realizadaEm).split(" ");
    data.append(el("span", "", dia), " ", el("span", "cb-cinza", horaTexto));
    const veiculo = el("td", "cb-col-veiculo");
    const marca = formatarMarca(v.marca ?? "");
    if (marca) veiculo.append(el("strong", "", marca));
    if (v.modelo) veiculo.append(marca ? " " : "", el("span", "cb-cinza-escuro", v.modelo));
    if (!marca && !v.modelo) veiculo.textContent = "—";
    veiculo.title = veiculo.textContent;
    // Chassi: os 6 últimos em destaque (os mesmos da mensagem de carros enviados).
    const chassi = el("td", "cb-mono cb-col-chassi");
    const c = String(v.chassi ?? "");
    if (c) chassi.append(el("span", "cb-cinza", c.slice(0, -6)), el("strong", "cb-chassi-fim", c.slice(-6)));
    else chassi.textContent = "—";
    const loja = el("td", "cb-col-loja", semPrefixo(v.loja) || "—");
    const n = qtdAvarias(v);
    const avarias = el("td", "cb-tnum");
    if (n) avarias.append(el("strong", "cb-avarias-n", String(n)));
    else avarias.append(el("span", "cb-apagado", "—"));
    const situacao = el("td");
    situacao.insertAdjacentHTML("beforeend", seloSituacao(v) || '<span class="cb-cinza">—</span>'); // texto fixo do app
    const acoes = el("td", "cb-col-acao");
    const ver = el("a", "cb-abrir");
    ver.href = `#/vistoria/${encodeURIComponent(v.id)}`;
    ver.title = "Abrir";
    ver.setAttribute("aria-label", `Abrir a vistoria ${nomeVistoria(v)}`);
    ver.insertAdjacentHTML("beforeend", icone("avancar"));
    acoes.append(ver);
    tr.append(sel, id, data, veiculo, chassi, loja, avarias, situacao, acoes);
    return tr;
  }

  // Barra lateral: contagens de todas as vistorias carregadas e o atalho dos filtros atuais.
  function desenharLateral() {
    const m = calcularMetricas(estado.itens);
    const r = contarRecebimentos(estado.itens);
    const atalho = atalhoAtivo(estado);
    atualizarLateral({
      contagens: estado.carregando && !estado.itens.length ? null : { todas: estado.itens.length, hoje: m.hoje, ...r },
      ativo: atalho,
    });
    $("#dash-titulo", raiz).textContent = tituloDoAtalho(atalho);
  }

  function desenharSubtitulo() {
    const m = calcularMetricas(estado.itens);
    const base = estado.itens.length
      ? `${num(estado.itens.length)} ${estado.itens.length === 1 ? "vistoria registrada" : "vistorias registradas"} no CD · ${num(m.hoje)} hoje`
      : "Todas as vistorias registradas no CD";
    $("#dash-status", raiz).textContent = !ctx.online()
      ? `${base} · offline: mostrando as guardadas neste aparelho`
      : estado.atualizadoEm ? `${base} · atualizado às ${hora(estado.atualizadoEm)}` : base;
  }

  function desenharSelecao() {
    const n = estado.selecionadas.size;
    $("#dash-selecao", raiz).hidden = n === 0;
    const texto = $("#dash-selecionadas", raiz);
    texto.replaceChildren(el("strong", "", num(n)), ` ${n === 1 ? "selecionada" : "selecionadas"}`);
    const caixas = $$("[data-sel]", corpo);
    const marcadas = caixas.filter((c) => c.checked).length;
    const todas = $("#dash-sel-pagina", raiz);
    todas.checked = caixas.length > 0 && marcadas === caixas.length;
    todas.indeterminate = marcadas > 0 && marcadas < caixas.length;
    if (!estado.gerandoPdf) $("#dash-pdf-texto", raiz).textContent = n === 1 ? "Baixar PDF" : `Baixar ${num(n)} PDFs`;
  }

  // "Limpar filtros" só aparece com algum filtro além do atalho da barra lateral.
  const temFiltroExtra = () => Boolean(estado.busca.trim() || estado.marca || estado.loja || (estado.recebimento && estado.periodo !== "todos"));

  const filtrados = () => maisRecentesPrimeiro(filtrarVistorias(estado.itens, estado));

  function desenharPaginas(p) {
    const numeros = $("#dash-numeros", raiz);
    numeros.replaceChildren(...numerosDePagina(p.pagina, p.paginas).map((i) => {
      if (i === null) return el("span", "cb-pag-salto", "…");
      const b = el("button", "cb-pag", num(i + 1));
      b.type = "button";
      b.dataset.pagina = String(i);
      if (i === p.pagina) b.setAttribute("aria-current", "page");
      b.setAttribute("aria-label", `Página ${i + 1}`);
      return b;
    }));
  }

  function desenharTabela() {
    const lista = filtrados();
    const p = paginar(lista, estado.pagina, ITENS_POR_PAGINA_PAINEL);
    estado.pagina = p.pagina;
    corpo.replaceChildren(...p.itens.map(linha));
    // Ordem da lista para o Anterior/Próxima do detalhe.
    try { sessionStorage.setItem(CHAVE_ORDEM, JSON.stringify(lista.map((v) => v.id))); } catch { /* sem sessionStorage */ }

    const vazio = $("#dash-vazio", raiz);
    vazio.replaceChildren();
    vazio.hidden = p.total > 0 || estado.carregando;
    if (!vazio.hidden) {
      if (estado.itens.length) {
        vazio.append(el("p", "", "Nenhuma vistoria encontrada."));
        const limpar = el("button", "cb-btn", "Limpar filtros");
        limpar.type = "button";
        limpar.dataset.limpar = "";
        vazio.append(limpar);
      } else {
        vazio.append(el("p", "", "Nenhuma vistoria ainda."));
      }
    }
    if (estado.carregando && !estado.itens.length) {
      vazio.hidden = false;
      vazio.append(el("p", "", "Carregando…"));
    }
    const pag = $("#dash-paginacao", raiz);
    pag.hidden = p.total === 0;
    $("#dash-contador", raiz).textContent = `${p.de}–${p.ate} de ${num(p.total)} · ${ITENS_POR_PAGINA_PAINEL} por página`;
    $("#dash-anterior", raiz).disabled = p.pagina <= 0;
    $("#dash-proxima", raiz).disabled = p.pagina >= p.paginas - 1;
    desenharPaginas(p);
    $("[data-limpar]", raiz).hidden = !temFiltroExtra();
    desenharLateral();
    desenharSubtitulo();
    desenharSelecao();
  }

  // Marcas das vistorias carregadas (a escolhida continua na lista mesmo sem itens).
  function atualizarMarcas() {
    const sel = $("#dash-marca", raiz);
    const marcas = marcasDisponiveis(estado.itens);
    if (estado.marca && !marcas.includes(estado.marca)) marcas.push(estado.marca);
    sel.replaceChildren(new Option("Marca", ""), ...marcas.map((m) => new Option(m, m)));
    sel.value = estado.marca;
    atualizarPilula(sel);
  }

  async function atualizarDados() {
    const minha = ++geracao;
    const itens = await lerLocais();
    if (!ativo || minha !== geracao) return;
    estado.itens = itens;
    estado.carregando = false;
    // A seleção só guarda vistorias que ainda estão na lista.
    const ids = new Set(itens.map((v) => v.id));
    for (const id of estado.selecionadas) if (!ids.has(id)) estado.selecionadas.delete(id);
    atualizarMarcas();
    desenharTabela();
  }

  async function recarregar() {
    $("#dash-atualizar", raiz).disabled = true;
    await buscarRemotos();
    if (!ativo) return;
    await atualizarDados();
    if (ativo) $("#dash-atualizar", raiz).disabled = false;
  }

  // ---------- PDF de várias ----------

  async function baixarPdfs() {
    if (estado.gerandoPdf || !estado.selecionadas.size) return;
    const ids = maisRecentesPrimeiro(estado.itens.filter((v) => estado.selecionadas.has(v.id))).map((v) => v.id);
    const botao = $("#dash-pdf-lote", raiz);
    const texto = $("#dash-pdf-texto", raiz);
    estado.gerandoPdf = true;
    botao.disabled = true;
    const falhas = [];
    let feitos = 0;
    for (const [i, id] of ids.entries()) {
      texto.textContent = `Gerando PDF ${i + 1} de ${ids.length}…`;
      try {
        let atual = await vistoriaParaPdf(ctx, id, usuario.id);
        const pdf = await gerarPdf(atual, criarObterImagem(ctx, id, () => atual));
        baixarBlob(pdf.blob, pdf.nomeArquivo);
        feitos++;
        // Um intervalo entre os downloads: o navegador aceita vários arquivos seguidos.
        await new Promise((r) => setTimeout(r, 400));
      } catch (e) {
        const v = estado.itens.find((x) => x.id === id);
        falhas.push(`${v ? nomeVistoria(v) : "vistoria"}: ${e?.message || "erro desconhecido"}`);
      }
      if (!ativo) return;
    }
    estado.gerandoPdf = false;
    botao.disabled = false;
    desenharSelecao();
    if (feitos) ctx.avisar(feitos === 1 ? "1 PDF baixado." : `${num(feitos)} PDFs baixados.`, "sucesso");
    if (falhas.length) ctx.avisar(`Não foi possível gerar ${falhas.length === 1 ? "1 PDF" : `${num(falhas.length)} PDFs`}. ${falhas.join(" ")}`, "erro");
  }

  // ---------- Eventos ----------
  // O endereço acompanha os filtros (recarregar a página ou voltar do detalhe mantém a lista igual).
  function guardarEndereco() {
    if (!ctx.desktop || !/^#\/inicio(\?|$)/.test(location.hash)) return;
    const destino = enderecoDasVistorias(estado, estado.recebimento);
    if (location.hash !== destino) history.replaceState(history.state, "", destino);
  }
  const recomecar = () => {
    estado.pagina = 0;
    guardarEndereco();
    desenharTabela();
  };
  let espera = null;
  $("#dash-busca", raiz).addEventListener("input", (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      estado.busca = e.target.value;
      recomecar();
    }, 200);
  });
  const definirPeriodo = (valor) => {
    estado.periodo = valor;
    const sel = $("#dash-periodo", raiz);
    sel.value = valor;
    atualizarPilula(sel);
    $("#dash-datas", raiz).hidden = valor !== "personalizado";
  };
  $("#dash-periodo", raiz).addEventListener("change", (e) => {
    definirPeriodo(e.target.value);
    recomecar();
  });
  for (const [idCampo, campo] of [["dash-de", "de"], ["dash-ate", "ate"]]) {
    $(`#${idCampo}`, raiz).value = estado[campo];
    $(`#${idCampo}`, raiz).addEventListener("change", (e) => {
      estado[campo] = e.target.value;
      recomecar();
    });
  }
  const definirFiltro = (campo, valor) => {
    estado[campo] = valor;
    const sel = $(`#dash-${campo}`, raiz);
    if (!sel) return; // recebimento: só pela barra lateral
    sel.value = valor;
    atualizarPilula(sel);
  };
  for (const campo of ["marca", "loja"]) {
    $(`#dash-${campo}`, raiz).addEventListener("change", (e) => {
      definirFiltro(campo, e.target.value);
      recomecar();
    });
  }
  // Atalhos da barra lateral: na lista, filtram sem recarregar (os outros filtros ficam).
  const aoClicarLateral = (e) => {
    const a = e.target.closest?.("[data-lat]");
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const f = filtrosDoAtalho(a.dataset.lat);
    definirPeriodo(f.periodo);
    definirFiltro("recebimento", f.recebimento);
    recomecar();
  };
  document.addEventListener("click", aoClicarLateral);
  function limparFiltros() {
    clearTimeout(espera);
    estado.busca = "";
    $("#dash-busca", raiz).value = "";
    for (const campo of ["marca", "loja", "recebimento"]) definirFiltro(campo, "");
    definirPeriodo("todos");
    recomecar();
  }
  raiz.addEventListener("click", (e) => {
    if (e.target.closest("[data-limpar]")) limparFiltros();
    const pagina = e.target.closest("[data-pagina]");
    if (pagina) {
      estado.pagina = Number(pagina.dataset.pagina);
      desenharTabela();
    }
  });
  $("#dash-atualizar", raiz).addEventListener("click", async () => {
    $("#dash-atualizar", raiz).disabled = true;
    await (ctx.sincronizar || ctx.sync.sincronizar)();
    recarregar();
  });
  // Mensagem do WhatsApp do gerente com os carros do dia (views/relatorio-envios.js).
  // Botão tirado por enquanto (teste do usuário); a janela continua pronta para voltar.
  $("#dash-relatorio", raiz)?.addEventListener("click", () => abrirRelatorioEnvios(estado.itens, { avisar: ctx.avisar }));
  $("#dash-pdf-lote", raiz).addEventListener("click", baixarPdfs);
  $("#dash-limpar-sel", raiz).addEventListener("click", () => {
    estado.selecionadas.clear();
    for (const caixa of $$("[data-sel]", corpo)) {
      caixa.checked = false;
      caixa.closest("tr").classList.remove("cb-marcada");
    }
    desenharSelecao();
  });
  $("#dash-anterior", raiz).addEventListener("click", () => { estado.pagina -= 1; desenharTabela(); });
  $("#dash-proxima", raiz).addEventListener("click", () => { estado.pagina += 1; desenharTabela(); });

  // Seleção: caixa de cada linha e a do cabeçalho (todas desta página).
  corpo.addEventListener("change", (e) => {
    const caixa = e.target.closest("[data-sel]");
    if (!caixa) return;
    if (caixa.checked) estado.selecionadas.add(caixa.dataset.sel);
    else estado.selecionadas.delete(caixa.dataset.sel);
    caixa.closest("tr").classList.toggle("cb-marcada", caixa.checked);
    desenharSelecao();
  });
  $("#dash-sel-pagina", raiz).addEventListener("change", (e) => {
    for (const caixa of $$("[data-sel]", corpo)) {
      caixa.checked = e.target.checked;
      if (e.target.checked) estado.selecionadas.add(caixa.dataset.sel);
      else estado.selecionadas.delete(caixa.dataset.sel);
      caixa.closest("tr").classList.toggle("cb-marcada", e.target.checked);
    }
    desenharSelecao();
  });

  // Linha inteira abre os detalhes; o link da linha navega sozinho e a caixa de
  // seleção só marca (por isso o clique neles não passa por aqui). Selecionar texto não navega.
  corpo.addEventListener("click", (e) => {
    if (e.target.closest("a, button, input, label")) return;
    if (globalThis.getSelection?.().toString()) return;
    const tr = e.target.closest("tr[data-id]");
    if (tr) ctx.navegar(`#/vistoria/${encodeURIComponent(tr.dataset.id)}`);
  });

  // Uma rodada de envio que termina traz novas vistorias do servidor.
  let estavaSincronizando = false;
  const aoMudar = (e) => {
    if (!ativo) return;
    const sincronizando = Boolean(e.detail?.sincronizando);
    if (estavaSincronizando && !sincronizando) recarregar();
    else atualizarDados();
    estavaSincronizando = sincronizando;
  };
  ctx.sync.eventos.addEventListener("mudou", aoMudar);

  // Filtros vindos no endereço (#/inicio?periodo=…&recebimento=…): período, marca, loja e recebimento.
  const inicial = filtrosDoEndereco(params.busca);
  for (const campo of ["de", "ate"]) {
    if (!inicial[campo]) continue;
    estado[campo] = inicial[campo];
    $(`#dash-${campo}`, raiz).value = inicial[campo];
  }
  if (inicial.periodo) definirPeriodo(inicial.periodo);
  for (const campo of ["marca", "loja"]) {
    if (!inicial[campo]) continue;
    const sel = $(`#dash-${campo}`, raiz);
    if (![...sel.options].some((o) => o.value === inicial[campo])) sel.add(new Option(inicial[campo], inicial[campo]));
    definirFiltro(campo, inicial[campo]);
  }
  if (inicial.recebimento) definirFiltro("recebimento", inicial.recebimento);

  desenharTabela(); // mostra "Carregando…" enquanto lê
  await atualizarDados(); // offline ou local: já aparece o que está guardado
  recarregar();

  return {
    desmontar() {
      ativo = false;
      clearTimeout(espera);
      document.removeEventListener("click", aoClicarLateral);
      ctx.sync.eventos.removeEventListener("mudou", aoMudar);
    },
  };
}
