// Dashboard do gerente (#/dashboard), só no navegador do computador: volume de
// vistorias, avarias, marcas e lojas de destino no período escolhido. Lê direto
// do servidor (precisa de internet); as contas ficam em dashboard-dados.js.
import { GRAVIDADES, LOJAS } from "../config.js";
import { formatarDataHora, nomeVistoria } from "../formatos.js";
import {
  SEM_LOJA, dentro, filtrarDashboard, marcaDe, formatarPct, intervaloDoDashboard, marcasDisponiveis, porGravidade, porLoja,
  porMarca, rankingAreas, rankingTipos, resumo, serie, topoDoEixo, ultimasComAvaria,
} from "../dashboard-dados.js";
import { $, $$, esc, icone } from "../ui.js";

const PERIODOS = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["personalizado", "Personalizado"]];
const COR_GRAVIDADE = Object.fromEntries(GRAVIDADES.map((g) => [g.valor, g]));
const num = (n) => Number(n).toLocaleString("pt-BR");
const hojeCampo = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// "Hoje 14:32", "Ontem 16:40" ou "12/10 15:30".
function quando(iso, agora = new Date()) {
  if (!iso) return "—";
  const t = new Date(iso);
  const hora = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  const dia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dia(agora) - dia(t)) / 86400000);
  if (diff === 0) return `Hoje ${hora}`;
  if (diff === 1) return `Ontem ${hora}`;
  return `${String(t.getDate()).padStart(2, "0")}/${String(t.getMonth() + 1).padStart(2, "0")} ${hora}`;
}

function seloGravidade(g) {
  return COR_GRAVIDADE[g] ? `<span class="db-gravidade db-g-${g.toLowerCase()}">${esc(g)}</span>` : "—";
}

// ---------- Gráficos (SVG desenhado aqui, sem biblioteca) ----------
function graficoColunas({ rotulos, atual, anterior }) {
  const L = 1000, A = 260, esq = 36, dir = 8, topo = 12, base = 28;
  const n = atual.length;
  const max = topoDoEixo(Math.max(...atual, ...anterior, 0));
  const largura = (L - esq - dir) / n;
  const x = (i) => esq + i * largura;
  const y = (v) => topo + (A - topo - base) * (1 - v / max);
  const linhasGrade = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = max * f;
    return `<line x1="${esq}" x2="${L - dir}" y1="${y(v)}" y2="${y(v)}" class="db-grade"/>`
      + `<text x="${esq - 8}" y="${y(v) + 4}" text-anchor="end" class="db-eixo">${num(Math.round(v))}</text>`;
  }).join("");
  const colunas = atual.map((v, i) => {
    const h = Math.max(0, y(0) - y(v));
    const w = Math.max(2, largura * 0.62);
    return `<rect x="${x(i) + (largura - w) / 2}" y="${y(v)}" width="${w}" height="${h}" rx="2" class="db-coluna">`
      + `<title>${esc(rotulos[i])}: ${num(v)} ${v === 1 ? "vistoria" : "vistorias"} (período anterior: ${num(anterior[i])})</title></rect>`;
  }).join("");
  const pontos = anterior.map((v, i) => `${x(i) + largura / 2},${y(v)}`).join(" ");
  const passo = Math.ceil(n / 10);
  const legendas = rotulos.map((r, i) => (i % passo === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < passo)
    ? `<text x="${x(i) + largura / 2}" y="${A - 8}" text-anchor="middle" class="db-eixo">${esc(r)}</text>` : "").join("");
  return `<svg class="db-svg" viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" role="img" aria-label="Vistorias por ${n === 24 ? "hora" : "dia"}">
    ${linhasGrade}${colunas}
    <polyline points="${pontos}" class="db-anterior"/>
    ${legendas}
  </svg>`;
}

function graficoRosca(fatias) {
  const total = fatias.reduce((s, f) => s + f.qtd, 0);
  const R = 15.915; // circunferência = 100
  let acumulado = 0;
  const arcos = total ? fatias.filter((f) => f.qtd).map((f) => {
    const parte = (f.qtd / total) * 100;
    const arco = `<circle r="${R}" cx="21" cy="21" fill="none" stroke="${COR_GRAVIDADE[f.gravidade].cor}" stroke-width="6"
      stroke-dasharray="${parte} ${100 - parte}" stroke-dashoffset="${25 - acumulado}"><title>${esc(f.gravidade)}: ${num(f.qtd)}</title></circle>`;
    acumulado += parte;
    return arco;
  }).join("") : "";
  return `<svg class="db-rosca" viewBox="0 0 42 42" role="img" aria-label="Avarias por gravidade">
    <circle r="${R}" cx="21" cy="21" fill="none" stroke="var(--linha)" stroke-width="6"/>${arcos}
    <text x="21" y="21" text-anchor="middle" class="db-rosca-num">${num(total)}</text>
    <text x="21" y="27" text-anchor="middle" class="db-rosca-rot">avarias</text>
  </svg>`;
}

// A CSP do site (style-src 'self') bloqueia style="" no HTML: a largura vai em
// data-largura e é aplicada pelo DOM depois de desenhar (aplicarLarguras).
const barra = (p, classe = "") => `<span class="db-barra ${classe}" aria-hidden="true"><span data-largura="${Math.max(0, Math.min(100, p)).toFixed(1)}"></span></span>`;
const aplicarLarguras = (el) => $$("[data-largura]", el).forEach((b) => { b.style.width = `${b.dataset.largura}%`; });

export async function montar(raiz, ctx) {
  const estado = {
    periodo: "30d", de: hojeCampo(new Date(Date.now() - 29 * 86400000)), ate: hojeCampo(),
    marca: "", loja: "", itens: [], anteriores: [], intervalo: null, carregando: true, erro: "",
    // Lista de baixo: "" = últimas com avaria; "avaria" ou "graves" = aberta pelos cartões.
    lista: "",
  };
  let rolarParaLista = false;
  let ativo = true;
  let geracao = 0;

  raiz.innerHTML = `
    <div class="dashboard-desktop db pilha">
      <div class="db-cabecalho">
        <div>
          <h1 class="titulo">Dashboard</h1>
          <p class="texto-2">Vistorias de envio para as lojas</p>
        </div>
        <div class="db-filtros">
          <div class="db-segmentos" role="radiogroup" aria-label="Período" id="db-periodos">
            ${PERIODOS.map(([v, r]) => `<button type="button" role="radio" aria-checked="${v === estado.periodo}" data-periodo="${v}">${v === "personalizado" ? `${r} ${icone("calendario", "ic db-ic-peq")}` : r}</button>`).join("")}
          </div>
          <select class="entrada db-select" id="db-marca" aria-label="Marca"><option value="">Todas as marcas</option></select>
          <select class="entrada db-select" id="db-loja" aria-label="Loja de destino">
            <option value="">Todas as lojas</option>
            ${LOJAS.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}
            <option value="${esc(SEM_LOJA)}">${esc(SEM_LOJA)}</option>
          </select>
        </div>
      </div>
      <div class="db-datas" id="db-datas" hidden>
        <label>De <input class="entrada" type="date" id="db-de"></label>
        <label>Até <input class="entrada" type="date" id="db-ate"></label>
      </div>
      <p class="db-aviso" id="db-aviso" role="status" hidden></p>
      <div id="db-conteudo"></div>
    </div>`;

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
    const intervalo = intervaloDoDashboard(estado.periodo, new Date(), { de: estado.de, ate: estado.ate });
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
      const todos = await ctx.remoto.listarParaDashboard({ de: intervalo.anterior.de, ate: intervalo.ate });
      if (!ativo || minha !== geracao) return;
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
  }

  // ---------- Desenho ----------
  function desenhar() {
    if (estado.erro) {
      conteudo.innerHTML = `<div class="secao db-vazio"><p>${esc(estado.erro)}</p>
        <button type="button" class="btn btn-secundario" data-acao="tentar">${icone("atualizar")} Tentar de novo</button></div>`;
      return;
    }
    if (estado.carregando && !estado.intervalo) {
      conteudo.innerHTML = `<div class="secao db-vazio"><p>${icone("carregando", "ic gira")} Carregando…</p></div>`;
      return;
    }
    if (!estado.intervalo) { conteudo.replaceChildren(); return; }

    const filtros = { marca: estado.marca, loja: estado.loja };
    const itens = filtrarDashboard(estado.itens, filtros);
    const anteriores = filtrarDashboard(estado.anteriores, filtros);
    const r = resumo(itens, anteriores);
    const s = serie(itens, anteriores, estado.intervalo);
    const gravidades = porGravidade(itens);
    const areas = rankingAreas(itens);
    const tipos = rankingTipos(itens);
    const marcas = porMarca(itens);
    const lojas = porLoja(itens);
    const ultimas = estado.lista
      ? ultimasComAvaria(itens, null, { soGraves: estado.lista === "graves" })
      : ultimasComAvaria(itens);
    const tituloLista = { "": "Últimas vistorias com avaria", avaria: "Veículos com avaria", graves: "Veículos com avaria grave" }[estado.lista];
    const vazioLista = estado.lista === "graves" ? "Nenhum veículo com avaria grave no período." : "Nenhuma vistoria com avaria no período.";
    // Cartão que abre a lista: botão de verdade (teclado e leitor de tela), marcado quando ativo.
    const cartaoLista = (tipo, classe, conteudoHtml, rotulo) => `<button type="button" class="cartao db-kpi db-kpi-botao ${classe}" data-lista="${tipo}"
      aria-pressed="${estado.lista === tipo}" aria-controls="db-lista" title="${rotulo}">${conteudoHtml}
      <span class="db-kpi-ver">${estado.lista === tipo ? "Mostrando a lista abaixo" : "Ver veículos"} ${icone("avancar", "ic db-ic-peq")}</span></button>`;
    const maxArea = areas[0]?.qtd || 1;
    const variacao = r.variacao === null ? ""
      : `<span class="db-variacao ${r.variacao >= 0 ? "db-sobe" : "db-desce"}">${formatarPct(r.variacao, { sinal: true, casas: 0 })}</span>`;

    conteudo.innerHTML = `
      <div class="pilha${estado.carregando ? " db-atualizando" : ""}" aria-busy="${estado.carregando}">
      <section class="db-kpis" aria-label="Resumo do período">
        <div class="cartao db-kpi"><p class="db-kpi-rot">Vistorias no período</p>
          <p class="db-kpi-linha"><span class="db-kpi-num">${num(r.total)}</span>${variacao}</p>
          <p class="db-kpi-sub">${num(r.totalAnterior)} no período anterior</p></div>
        ${cartaoLista("avaria", "", `<span class="db-kpi-rot">Veículos com avaria</span>
          <span class="db-kpi-linha"><span class="db-kpi-num">${num(r.comAvaria)}</span><span class="db-kpi-extra">(${formatarPct(r.pctComAvaria)})</span></span>`, "Ver os veículos com avaria")}
        <div class="cartao db-kpi"><p class="db-kpi-rot">Avarias registradas</p>
          <p class="db-kpi-linha"><span class="db-kpi-num">${num(r.avarias)}</span></p></div>
        ${cartaoLista("graves", "db-kpi-grave", `<span class="db-kpi-rot">Avarias graves</span>
          <span class="db-kpi-linha"><span class="db-kpi-num">${num(r.graves)}</span><span class="db-kpi-extra">(${formatarPct(r.pctGraves)} do total)</span></span>`, "Ver os veículos com avaria grave")}
      </section>

      <section class="secao" aria-labelledby="db-h-volume">
        <div class="db-titulo-linha">
          <h2 id="db-h-volume">Vistorias por ${estado.intervalo.porHora ? "hora" : "dia"}</h2>
          <p class="db-legenda"><span class="db-leg-atual"></span>Período atual <span class="db-leg-anterior"></span>Período anterior</p>
        </div>
        ${graficoColunas(s)}
      </section>

      <div class="db-duas">
        <section class="secao" aria-labelledby="db-h-grav">
          <h2 id="db-h-grav">Avarias por gravidade</h2>
          <div class="db-grav">
            ${graficoRosca(gravidades)}
            <ul class="db-grav-lista">
              ${gravidades.map((g) => `<li><span class="db-ponto db-g-${g.gravidade.toLowerCase()}"></span>
                <span class="db-grav-nome">${esc(g.gravidade)}</span><strong>${num(g.qtd)}</strong><span class="texto-2">${formatarPct(g.pct)}</span></li>`).join("")}
            </ul>
          </div>
        </section>
        <section class="secao" aria-labelledby="db-h-areas">
          <h2 id="db-h-areas">Áreas com mais avarias</h2>
          ${areas.length ? `<ol class="db-ranking">
            ${areas.map((a) => `<li><div class="db-rank-linha"><span>${esc(a.nome)}</span><strong>${num(a.qtd)}</strong></div>
              ${barra((a.qtd / maxArea) * 100, "db-barra-larga")}</li>`).join("")}
          </ol>
          <p class="db-tipos"><span class="texto-2">Tipos mais comuns:</span> ${tipos.map((t) => `<span class="db-chip">${esc(t.nome)} · ${num(t.qtd)}</span>`).join("")}</p>`
          : `<p class="texto-2">Nenhuma avaria no período.</p>`}
        </section>
      </div>

      <div class="db-duas">
        <section class="secao" aria-labelledby="db-h-marca">
          <h2 id="db-h-marca">Por marca</h2>
          ${marcas.length ? `<div class="dash-rolagem"><table class="db-tabela">
            <thead><tr><th scope="col">Marca</th><th scope="col" class="db-n">Vistorias</th><th scope="col" class="db-n">Com avaria</th><th scope="col">%</th><th scope="col" class="db-n">Graves</th></tr></thead>
            <tbody>${marcas.map((m) => `<tr><td class="db-forte">${esc(m.nome)}</td><td class="db-n">${num(m.vistorias)}</td><td class="db-n">${num(m.comAvaria)}</td>
              <td><span class="db-pct">${barra(m.pctComAvaria)}${formatarPct(m.pctComAvaria, { casas: 0 })}</span></td>
              <td class="db-n${m.graves ? " db-grave" : ""}">${num(m.graves)}</td></tr>`).join("")}</tbody>
          </table></div>` : `<p class="texto-2">Nenhuma vistoria no período.</p>`}
        </section>
        <section class="secao" aria-labelledby="db-h-loja">
          <h2 id="db-h-loja">Por loja de destino</h2>
          ${lojas.length ? `<div class="dash-rolagem"><table class="db-tabela">
            <thead><tr><th scope="col">Loja</th><th scope="col" class="db-n">Vist.</th><th scope="col" class="db-n">Avaria</th><th scope="col" class="db-n">%</th><th scope="col" class="db-n">Última vistoria</th></tr></thead>
            <tbody>${lojas.map((l) => `<tr><td class="db-forte${l.nome === SEM_LOJA ? " texto-2" : ""}">${esc(l.nome)}</td><td class="db-n">${num(l.vistorias)}</td>
              <td class="db-n">${num(l.comAvaria)}</td><td class="db-n">${formatarPct(l.pctComAvaria)}</td><td class="db-n texto-2">${quando(l.ultima)}</td></tr>`).join("")}</tbody>
          </table></div>` : `<p class="texto-2">Nenhuma vistoria no período.</p>`}
        </section>
      </div>

      <section class="secao db-lista${estado.lista ? " db-lista-aberta" : ""}" id="db-lista" aria-labelledby="db-h-ultimas" tabindex="-1">
        <div class="db-titulo-linha">
          <h2 id="db-h-ultimas">${tituloLista}${estado.lista ? ` <span class="texto-2">(${num(ultimas.length)})</span>` : ""}</h2>
          ${estado.lista ? `<button type="button" class="btn btn-texto db-fechar-lista" data-lista="">${icone("x", "ic db-ic-peq")} Voltar às últimas</button>` : ""}
        </div>
        ${ultimas.length ? `<div class="dash-rolagem"><table class="db-tabela db-clicavel">
          <thead><tr><th scope="col">Nº</th><th scope="col">Data/Hora</th><th scope="col">Marca/Modelo</th><th scope="col">Chassi</th><th scope="col">Loja</th><th scope="col">Gravidade</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${ultimas.map((v) => `<tr data-id="${esc(v.id)}">
            <td class="db-forte">${esc(nomeVistoria(v))}</td><td class="dash-num">${formatarDataHora(v.realizadaEm)}</td>
            <td>${esc([v.marca && marcaDe(v), v.modelo].filter(Boolean).join(" ") || "—")}</td><td class="dash-chassi">${esc(v.chassi || "—")}</td>
            <td class="texto-2">${esc(v.loja || "—")}</td><td>${seloGravidade(v.gravidadeMaxima)}</td>
            <td class="db-acoes"><a class="db-ver" href="#/vistoria/${encodeURIComponent(v.id)}">Ver ${icone("avancar", "ic db-ic-peq")}</a></td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="texto-2">${vazioLista}</p>`}
      </section>
      </div>`;
    aplicarLarguras(conteudo);
    if (rolarParaLista) {
      rolarParaLista = false;
      const lista = $("#db-lista", conteudo);
      lista.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      lista.focus({ preventScroll: true });
    }
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
  $("#db-marca", raiz).addEventListener("change", (e) => { estado.marca = e.target.value; desenhar(); });
  $("#db-loja", raiz).addEventListener("change", (e) => { estado.loja = e.target.value; desenhar(); });
  conteudo.addEventListener("click", (e) => {
    if (e.target.closest('[data-acao="tentar"]')) return carregar();
    // Cartões "Veículos com avaria" / "Avarias graves": abrem (ou fecham) a lista de baixo.
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
