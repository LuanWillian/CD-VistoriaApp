// Dashboard do gerente (#/dashboard), só no navegador do computador: volume de
// vistorias, avarias, recebimento, marcas e lojas de destino no período escolhido.
// Lê direto do servidor (precisa de internet); as contas ficam em dashboard-dados.js.
import { GRAVIDADES, LOJAS } from "../config.js";
import { formatarDataHora, formatarMarca, nomeVistoria } from "../formatos.js";
import {
  SEM_LOJA, dentro, filtrarDashboard, formatarPct, intervaloDoDashboard, listaPorRecebimento, lojaDe, marcasDisponiveis,
  porGravidade, porLoja, porMarca, rankingAreas, resumo, serie, ultimasComAvaria,
} from "../dashboard-dados.js";
import { maisRecentesPrimeiro } from "../painel-dados.js";
import { contarRecebimentos, situacaoRecebimento } from "../recebimento-dados.js";
import { baixarCsv, linhasDeVistorias } from "../exportar.js";
import { $, $$, esc, icone } from "../ui.js";
import { seloRecebimento } from "./card-recebimento.js";
import { atualizarPilula, ligarPilulas, pilulaSelect } from "./pilulas.js";

const PERIODOS = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["tudo", "Tudo"], ["personalizado", "Personalizado"]];
const dataCurta = (aaaaMmDd) => (aaaaMmDd ? aaaaMmDd.split("-").reverse().slice(0, 2).join("/") : "");
const COR_GRAVIDADE = Object.fromEntries(GRAVIDADES.map((g) => [g.valor, g]));
const num = (n) => Number(n).toLocaleString("pt-BR");
const dois = (n) => String(n).padStart(2, "0");
const hojeCampo = (d = new Date()) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const semPrefixo = (loja) => String(loja ?? "").replace(/^PG Prime /, "");
const ULTIMAS = 8;

// Primeiro e último dia do intervalo [de, ate) (ate é exclusivo).
function diasDoIntervalo({ de, ate }) {
  const fimEx = new Date(ate);
  return [new Date(de), new Date(fimEx.getFullYear(), fimEx.getMonth(), fimEx.getDate() - 1)];
}
const dataBr = (d) => `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;

// ---------- Gráficos (HTML/SVG desenhado aqui, sem biblioteca) ----------
// Colunas agrupadas: período anterior (cinza) e atual (azul) lado a lado, por hora,
// dia, semana ou mês (dashboard-dados.js escolhe pelo tamanho do período). A altura vai em data-altura (a CSP bloqueia style="" no HTML).
const NOME_UNIDADE = { hora: "hora", dia: "dia", semana: "semana", mes: "mês" };
function graficoColunas({ rotulos, atual, anterior, unidade }) {
  const max = Math.max(...atual, ...anterior, 1);
  const passo = Math.max(1, Math.ceil(rotulos.length / 15));
  const alt = (v) => ((v / max) * 100).toFixed(1);
  return `<div class="cb-colunas" role="img" aria-label="Vistorias por ${NOME_UNIDADE[unidade]}: período atual e anterior">
    ${rotulos.map((r, i) => `<div class="cb-coluna-grupo" title="${esc(r)}: ${num(atual[i])} ${atual[i] === 1 ? "vistoria" : "vistorias"} (período anterior: ${num(anterior[i])})">
      <div class="cb-barras"><span class="cb-barra-anterior" data-altura="${alt(anterior[i])}"></span><span class="db-coluna cb-barra-atual" data-altura="${alt(atual[i])}"></span></div>
      <span class="cb-coluna-rot">${i % passo === 0 ? esc(r) : "&nbsp;"}</span>
    </div>`).join("")}
  </div>`;
}

// Linha do volume diário (dentro do cartão "Vistorias no período").
function minigrafico(valores) {
  const max = Math.max(...valores, 1);
  const n = valores.length;
  const pontos = valores.map((v, i) => `${n > 1 ? ((i * 100) / (n - 1)).toFixed(1) : 50},${(28 - (v / max) * 26).toFixed(1)}`).join(" ");
  return `<svg class="cb-minigrafico" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pontos}"/></svg>`;
}

function rosca(fatias) {
  const total = fatias.reduce((s, f) => s + f.qtd, 0);
  const T = 150, E = 18, R = (T - E) / 2, C = 2 * Math.PI * R;
  let acumulado = 0;
  const arcos = total ? fatias.filter((f) => f.qtd).map((f) => {
    const parte = (f.qtd / total) * C;
    const arco = `<circle cx="75" cy="75" r="${R}" fill="none" stroke="${COR_GRAVIDADE[f.gravidade].cor}" stroke-width="${E}"
      stroke-dasharray="${parte.toFixed(2)} ${(C - parte).toFixed(2)}" stroke-dashoffset="${(-acumulado).toFixed(2)}" transform="rotate(-90 75 75)"><title>${esc(f.gravidade)}: ${num(f.qtd)}</title></circle>`;
    acumulado += parte;
    return arco;
  }).join("") : `<circle cx="75" cy="75" r="${R}" fill="none" stroke="#E4E7EB" stroke-width="${E}"/>`;
  return `<div class="cb-rosca">
    <svg width="${T}" height="${T}" viewBox="0 0 ${T} ${T}" role="img" aria-label="Avarias por gravidade">${arcos}</svg>
    <div class="cb-rosca-centro"><p class="cb-rosca-num">${num(total)}</p><p class="cb-rosca-rot">avarias</p></div>
  </div>`;
}

// A CSP do site (style-src 'self') bloqueia style="" no HTML: larguras e alturas
// vão em data-largura / data-altura e são aplicadas pelo DOM depois de desenhar.
const barra = (p) => `<span class="cb-trilho" aria-hidden="true"><span data-largura="${Math.max(0, Math.min(100, p)).toFixed(1)}"></span></span>`;
function aplicarMedidas(el) {
  $$("[data-largura]", el).forEach((b) => { b.style.width = `${b.dataset.largura}%`; });
  $$("[data-altura]", el).forEach((b) => { b.style.height = `${b.dataset.altura}%`; });
}

export async function montar(raiz, ctx) {
  const estado = {
    periodo: "30d", de: hojeCampo(new Date(Date.now() - 29 * 86400000)), ate: hojeCampo(),
    marca: "", loja: "", itens: [], anteriores: [], intervalo: null, carregando: true, erro: "",
    // Lista de baixo: "" = últimas vistorias; "avaria", "graves", "aguardando" ou "divergencia" = aberta pelos cartões.
    lista: "",
  };
  let rolarParaLista = false;
  let ativo = true;
  let geracao = 0;

  raiz.innerHTML = `
    <div class="cb-dash dashboard-desktop">
      <div class="cb-pagina-cabeca cb-cabeca-centro">
        <div>
          <h1 class="cb-h1">Dashboard</h1>
          <p class="cb-sub" id="db-subtitulo">Saídas do CD</p>
        </div>
        <div class="cb-acoes">
          <div class="cb-segmentos" role="radiogroup" aria-label="Período" id="db-periodos">
            ${PERIODOS.map(([v, r]) => `<button type="button" role="radio" aria-checked="${v === estado.periodo}" data-periodo="${v}">${r}</button>`).join("")}
          </div>
          ${pilulaSelect({ id: "db-marca", rotulo: "Marca", opcoes: [["", "Todas as marcas"]] })}
          ${pilulaSelect({ id: "db-loja", rotulo: "Loja de destino", opcoes: [["", "Todas as lojas"], ...LOJAS.map((l) => [l, l]), [SEM_LOJA, SEM_LOJA]] })}
          <button type="button" class="cb-btn" id="db-exportar">${icone("baixar")} Exportar</button>
        </div>
      </div>
      <div class="cb-datas cb-datas-dir" id="db-datas" hidden>
        <label>De <input class="cb-data" type="date" id="db-de"></label>
        <label>Até <input class="cb-data" type="date" id="db-ate"></label>
      </div>
      <p class="cb-aviso" id="db-aviso" role="status" hidden></p>
      <div id="db-conteudo"></div>
    </div>`;

  ligarPilulas(raiz);
  const conteudo = $("#db-conteudo", raiz);
  $("#db-de", raiz).value = estado.de;
  $("#db-ate", raiz).value = estado.ate;

  function aviso(texto) {
    const p = $("#db-aviso", raiz);
    p.textContent = texto;
    p.hidden = !texto;
  }

  // ---------- Dados ----------
  async function carregar() {
    const minha = ++geracao;
    let intervalo = intervaloDoDashboard(estado.periodo, new Date(), { de: estado.de, ate: estado.ate });
    if (!intervalo) {
      aviso("Escolha as datas De e Até (a data inicial não pode ser depois da final).");
      return;
    }
    if (!ctx.online()) {
      estado.carregando = false;
      aviso("Sem internet. O dashboard precisa de conexão para ler as vistorias do servidor.");
      desenhar();
      return;
    }
    estado.carregando = true;
    aviso("");
    desenhar();
    try {
      // Uma consulta só, do início do período anterior até o fim do atual.
      // Tudo: busca desde sempre e começa no dia da primeira vistoria.
      const todos = await ctx.remoto.listarParaDashboard(intervalo.tudo
        ? { de: new Date(2000, 0, 1).toISOString(), ate: intervalo.ate }
        : { de: intervalo.anterior.de, ate: intervalo.ate });
      if (!ativo || minha !== geracao) return;
      if (intervalo.tudo) {
        const inicio = todos.reduce((min, v) => (!min || v.realizadaEm < min ? v.realizadaEm : min), null);
        intervalo = intervaloDoDashboard("tudo", new Date(), { inicio });
      }
      estado.intervalo = intervalo;
      estado.itens = todos.filter((v) => dentro(v.realizadaEm, intervalo));
      estado.anteriores = todos.filter((v) => dentro(v.realizadaEm, intervalo.anterior));
      estado.erro = "";
    } catch (e) {
      console.error(e);
      if (!ativo || minha !== geracao) return;
      estado.erro = ctx.remoto.classificarErro(e, ctx.online()).mensagem;
    }
    estado.carregando = false;
    atualizarMarcas();
    desenhar();
  }

  function atualizarMarcas() {
    const sel = $("#db-marca", raiz);
    const marcas = marcasDisponiveis([...estado.itens, ...estado.anteriores]);
    if (estado.marca && !marcas.includes(estado.marca)) marcas.push(estado.marca);
    sel.replaceChildren(new Option("Todas as marcas", ""), ...marcas.map((m) => new Option(m, m)));
    sel.value = estado.marca;
    atualizarPilula(sel);
  }

  const filtros = () => ({ marca: estado.marca, loja: estado.loja });

  function desenharSubtitulo() {
    const p = $("#db-subtitulo", raiz);
    if (!estado.intervalo) { p.textContent = "Saídas do CD"; return; }
    const [ini, fim] = diasDoIntervalo(estado.intervalo);
    const datas = estado.intervalo.dias === 1 ? dataBr(ini) : `${dataBr(ini)} – ${dataBr(fim)}`;
    if (estado.intervalo.tudo) { p.textContent = `Saídas do CD · todas as vistorias, desde ${dataBr(ini)}`; return; }
    const compara = estado.intervalo.dias === 1 ? "comparado ao dia anterior" : `comparado aos ${num(estado.intervalo.dias)} dias anteriores`;
    p.textContent = `Saídas do CD · ${datas} · ${compara}`;
  }

  // ---------- Desenho ----------
  function desenhar() {
    desenharSubtitulo();
    if (estado.erro) {
      conteudo.innerHTML = `<div class="cb-cartao cb-vazio"><p>${esc(estado.erro)}</p>
        <button type="button" class="cb-btn" data-acao="tentar">${icone("recarregar")} Tentar de novo</button></div>`;
      return;
    }
    if (estado.carregando && !estado.intervalo) {
      conteudo.innerHTML = `<div class="cb-cartao cb-vazio"><p>${icone("carregando", "ic gira")} Carregando…</p></div>`;
      return;
    }
    if (!estado.intervalo) { conteudo.replaceChildren(); return; }

    const itens = filtrarDashboard(estado.itens, filtros());
    const anteriores = filtrarDashboard(estado.anteriores, filtros());
    const r = resumo(itens, anteriores);
    const s = serie(itens, anteriores, estado.intervalo);
    const gravidades = porGravidade(itens);
    const areas = rankingAreas(itens, 6);
    const marcas = porMarca(itens);
    const lojas = porLoja(itens);
    const contRec = contarRecebimentos(itens);
    const recebidos = contRec.conforme + contRec.divergencia;

    // Aguardando e conforme por loja (a tabela de lojas mostra a situação do recebimento).
    const recPorLoja = new Map();
    for (const v of itens) {
      const sit = situacaoRecebimento(v);
      const k = lojaDe(v);
      if (!recPorLoja.has(k)) recPorLoja.set(k, { aguardando: 0, conforme: 0 });
      if (sit === "aguardando" || sit === "conforme") recPorLoja.get(k)[sit]++;
    }

    const lista = estado.lista;
    const listaReceb = lista === "aguardando" || lista === "divergencia";
    const ultimas = listaReceb ? listaPorRecebimento(itens, lista)
      : lista ? ultimasComAvaria(itens, null, { soGraves: lista === "graves" })
        : maisRecentesPrimeiro(itens).slice(0, ULTIMAS);
    const tituloLista = {
      "": "Últimas vistorias", avaria: "Veículos com avaria", graves: "Veículos com avaria grave",
      aguardando: "Veículos aguardando recebimento", divergencia: "Veículos recebidos com divergência",
    }[lista];
    const vazioLista = {
      avaria: "Nenhum veículo com avaria no período.", graves: "Nenhum veículo com avaria grave no período.",
      aguardando: "Nenhum veículo aguardando recebimento no período.", divergencia: "Nenhum veículo recebido com divergência no período.",
    }[lista] || "Nenhuma vistoria no período.";

    // Nome do período no cartão: "7 dias", "Hoje"…; no personalizado, as datas escolhidas.
    const nomeDoPeriodo = () => {
      if (estado.periodo === "personalizado") {
        return estado.de && estado.ate ? `${dataCurta(estado.de)} a ${dataCurta(estado.ate)}` : "Personalizado";
      }
      return PERIODOS.find(([v]) => v === estado.periodo)?.[1] ?? "";
    };
    const ponto = (classe) => (classe ? `<span class="cb-kpi-ponto cb-cor-${classe}"></span>` : "");
    const kpi = (rot, n, sub, classe = "", extra = "") => `<div class="cb-cartao cb-kpi">
        <div class="cb-kpi-topo"><span class="cb-kpi-rot">${rot}</span>${ponto(classe)}</div>
        <p class="cb-kpi-num db-kpi-num">${num(n)}</p><p class="cb-kpi-sub">${sub}</p>${extra}</div>`;
    // Cartão que abre a lista de baixo: botão de verdade (teclado e leitor de tela), marcado quando ativo.
    const kpiLista = (tipo, rot, n, sub, classe) => `<button type="button" class="cb-cartao cb-kpi db-kpi-botao" data-lista="${tipo}"
        aria-pressed="${lista === tipo}" aria-controls="db-lista" title="${esc(`Ver: ${rot.toLowerCase()}`)}">
        <span class="cb-kpi-topo"><span class="cb-kpi-rot">${rot}</span>${ponto(classe)}</span>
        <span class="cb-kpi-num db-kpi-num">${num(n)}</span><span class="cb-kpi-sub">${sub}</span>
        <span class="cb-kpi-ver">${lista === tipo ? "Mostrando a lista abaixo" : "Ver veículos →"}</span></button>`;

    const variacao = r.variacao === null ? ""
      : r.variacao > 0 ? `<span class="cb-sobe">▲ ${formatarPct(r.variacao, { casas: 0 })}</span> `
        : r.variacao < 0 ? `<span class="cb-desce">▼ ${formatarPct(-r.variacao, { casas: 0 })}</span> ` : "<span>0%</span> ";
    const media = r.comAvaria ? (r.avarias / r.comAvaria).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : null;
    const dosRecebidos = (n) => (recebidos ? `${formatarPct((n / recebidos) * 100)} dos recebidos` : "nenhum recebido");

    const tabela = (cab, linhas) => `<table class="cb-tabela cb-tabela-resumo">
        <thead><tr>${cab.map((c, i) => `<th scope="col"${i ? ' class="cb-dir"' : ""}>${c}</th>`).join("")}</tr></thead>
        <tbody>${linhas.map((l) => `<tr>${l.map((c, i) => `<td${i ? ' class="cb-dir cb-tnum"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>`;

    conteudo.innerHTML = `
      <div class="cb-dash-corpo${estado.carregando ? " cb-atualizando" : ""}" aria-busy="${estado.carregando}">
      <section class="cb-indicadores" aria-label="Resumo do período">
        <div class="db-kpis">
          ${kpi(`Vistorias no período · <span class="cb-kpi-periodo">${esc(nomeDoPeriodo())}</span>`, r.total, (estado.intervalo.tudo ? "todas as vistorias" : `${variacao}vs. ${num(r.totalAnterior)} ${r.totalAnterior === 1 ? "anterior" : "anteriores"}`), "", minigrafico(s.atual))}
          ${kpi("Avarias registradas", r.avarias, media ? `${media} por veículo` : "nenhuma no período")}
        </div>
        <div class="db-receb" role="group" aria-labelledby="db-h-receb">
          <h2 class="sr-only" id="db-h-receb">Recebimento nas lojas</h2>
          ${kpiLista("aguardando", "Aguardando recebimento", contRec.aguardando, "na loja", "pendente")}
          ${kpi("Recebido conforme vistoria", contRec.conforme, dosRecebidos(contRec.conforme), "ok")}
          ${kpiLista("divergencia", "Recebido com divergência", contRec.divergencia, dosRecebidos(contRec.divergencia), "erro")}
        </div>
      </section>

      <div class="cb-graficos">
        <section class="cb-cartao cb-p4 cb-volume" aria-labelledby="db-h-volume">
          <div class="cb-graf-topo">
            <h2 id="db-h-volume">Vistorias por ${NOME_UNIDADE[s.unidade]}</h2>
            <p class="cb-legenda"><span><span class="cb-quad cb-quad-atual"></span>Atual</span><span><span class="cb-quad cb-quad-anterior"></span>Anterior</span></p>
          </div>
          ${graficoColunas(s)}
        </section>
        <section class="cb-cartao cb-p4" aria-labelledby="db-h-grav">
          <h2 id="db-h-grav" class="cb-mb4">Avarias por gravidade</h2>
          <div class="cb-grav">
            ${rosca(gravidades)}
            <table class="cb-grav-tabela"><tbody>
              ${gravidades.map((g) => `<tr><td><span class="cb-ponto cb-${g.gravidade.toLowerCase()}"></span>${esc(g.gravidade)}</td>
                <td class="cb-dir cb-forte cb-tnum">${num(g.qtd)}</td><td class="cb-dir cb-cinza cb-tnum cb-pct">${formatarPct(g.pct, { casas: 0 })}</td></tr>`).join("")}
            </tbody></table>
          </div>
        </section>
        <section class="cb-cartao cb-p4" aria-labelledby="db-h-areas">
          <h2 id="db-h-areas" class="cb-mb3">Áreas com mais avarias</h2>
          ${areas.length ? areas.map((a) => `<div class="cb-area"><span class="cb-trunc" title="${esc(a.nome)}">${esc(a.nome)}</span>${barra((a.qtd / areas[0].qtd) * 100)}<span class="cb-dir cb-forte cb-tnum">${num(a.qtd)}</span></div>`).join("")
    : '<p class="cb-cinza">Nenhuma avaria no período.</p>'}
        </section>
      </div>

      <div class="cb-duas">
        <section class="cb-cartao" aria-labelledby="db-h-marca">
          <div class="cb-tab-topo"><h2 id="db-h-marca">Por marca</h2><span class="cb-nota">ordenado por volume</span></div>
          ${marcas.length ? tabela(["Marca", "Vistorias", "Com avaria", "% avaria", "Graves"],
    marcas.map((m) => [esc(m.nome), num(m.vistorias), num(m.comAvaria), formatarPct(m.pctComAvaria, { casas: 0 }), num(m.graves)]))
    : '<p class="cb-cartao-corpo cb-cinza">Nenhuma vistoria no período.</p>'}
        </section>
        <section class="cb-cartao" aria-labelledby="db-h-loja">
          <div class="cb-tab-topo"><h2 id="db-h-loja">Por loja de destino</h2><span class="cb-nota">ordenado por volume</span></div>
          ${lojas.length ? tabela(["Loja", "Enviados", "Aguardando", "Conforme", "Recebido com divergência"],
    lojas.map((l) => {
      const rec = recPorLoja.get(l.nome) || { aguardando: 0, conforme: 0 };
      return [esc(semPrefixo(l.nome)), num(l.vistorias), num(rec.aguardando), num(rec.conforme), num(l.divergencias)];
    }))
    : '<p class="cb-cartao-corpo cb-cinza">Nenhuma vistoria no período.</p>'}
        </section>
      </div>

      <section class="cb-cartao cb-lista${lista ? " cb-lista-aberta" : ""}" id="db-lista" aria-labelledby="db-h-ultimas" tabindex="-1">
        <div class="cb-tab-topo cb-tab-topo-lista">
          <h2 id="db-h-ultimas">${tituloLista}${lista ? ` <span class="cb-cinza">(${num(ultimas.length)})</span>` : ""}</h2>
          ${lista ? `<button type="button" class="cb-link db-fechar-lista" data-lista="">${icone("x")} Voltar às últimas</button>`
    : '<a class="cb-link" href="#/inicio">Ver todas →</a>'}
        </div>
        ${ultimas.length ? `<table class="cb-tabela cb-tabela-lista db-clicavel">
          <thead><tr><th scope="col">ID</th><th scope="col">Data/Hora</th><th scope="col">Veículo</th><th scope="col">Chassi</th><th scope="col">Loja</th>
            <th scope="col" class="cb-centro">Avarias</th><th scope="col">Recebimento</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${ultimas.map((v) => {
    const marca = formatarMarca(v.marca ?? "");
    return `<tr data-id="${esc(v.id)}">
            <td class="cb-mono cb-cinza-escuro">${esc(nomeVistoria(v))}</td><td class="cb-tnum">${formatarDataHora(v.realizadaEm)}</td>
            <td>${marca ? `<strong>${esc(marca)}</strong> ` : ""}${esc(v.modelo || (marca ? "" : "—"))}</td><td class="cb-mono">${esc(v.chassi || "—")}</td>
            <td>${esc(semPrefixo(v.loja) || "—")}</td><td class="cb-centro cb-tnum">${num(v.avarias?.length ?? 0)}</td>
            <td>${seloRecebimento(v, { curto: true }) || '<span class="cb-cinza">—</span>'}</td>
            <td class="cb-dir"><a class="cb-link" href="#/vistoria/${encodeURIComponent(v.id)}">Abrir</a></td></tr>`;
  }).join("")}</tbody>
        </table>` : `<p class="cb-cartao-corpo cb-cinza">${vazioLista}</p>`}
      </section>
      </div>`;
    aplicarMedidas(conteudo);
    if (rolarParaLista) {
      rolarParaLista = false;
      const el = $("#db-lista", conteudo);
      el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      el.focus({ preventScroll: true });
    }
  }

  // ---------- Exportar ----------
  function exportar() {
    if (!estado.intervalo || estado.erro) {
      ctx.avisar?.("Carregue o dashboard antes de exportar.");
      return;
    }
    const lista = maisRecentesPrimeiro(filtrarDashboard(estado.itens, filtros()));
    if (!lista.length) {
      ctx.avisar?.("Nenhuma vistoria no período para exportar.");
      return;
    }
    const [ini, fim] = diasDoIntervalo(estado.intervalo);
    baixarCsv(linhasDeVistorias(lista, { painel: false }), `dashboard_${hojeCampo(ini)}_${hojeCampo(fim)}.csv`);
  }

  // ---------- Eventos ----------
  $("#db-periodos", raiz).addEventListener("click", (e) => {
    const b = e.target.closest("[data-periodo]");
    if (!b) return;
    estado.periodo = b.dataset.periodo;
    $$("[data-periodo]", raiz).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    $("#db-datas", raiz).hidden = estado.periodo !== "personalizado";
    carregar();
  });
  for (const id of ["db-de", "db-ate"]) {
    $(`#${id}`, raiz).addEventListener("change", (e) => {
      estado[id === "db-de" ? "de" : "ate"] = e.target.value;
      carregar();
    });
  }
  $("#db-marca", raiz).addEventListener("change", (e) => { estado.marca = e.target.value; atualizarPilula(e.target); desenhar(); });
  $("#db-loja", raiz).addEventListener("change", (e) => { estado.loja = e.target.value; atualizarPilula(e.target); desenhar(); });
  $("#db-exportar", raiz).addEventListener("click", exportar);
  conteudo.addEventListener("click", (e) => {
    if (e.target.closest('[data-acao="tentar"]')) return carregar();
    // Cartões com "Ver veículos": abrem (ou fecham) a lista de baixo.
    const alvoLista = e.target.closest("[data-lista]");
    if (alvoLista) {
      const tipo = alvoLista.dataset.lista;
      const anterior = estado.lista;
      estado.lista = tipo && estado.lista === tipo ? "" : tipo;
      rolarParaLista = Boolean(estado.lista);
      desenhar();
      // Fechou a lista: o foco volta para o cartão que a tinha aberto.
      if (!estado.lista && anterior) $(`.db-kpi-botao[data-lista="${anterior}"]`, conteudo)?.focus();
      return;
    }
    if (e.target.closest("a, button")) return;
    if (globalThis.getSelection?.().toString()) return;
    const tr = e.target.closest("tr[data-id]");
    if (tr) ctx.navegar(`#/vistoria/${encodeURIComponent(tr.dataset.id)}`);
  });
  const aoVoltarInternet = () => { if (ativo) carregar(); };
  window.addEventListener("online", aoVoltarInternet);

  await carregar();

  return {
    desmontar() {
      ativo = false;
      window.removeEventListener("online", aoVoltarInternet);
    },
  };
}
