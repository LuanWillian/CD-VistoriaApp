// Dashboard do gerente (#/dashboard), só no navegador do computador. Versão enxuta:
// faixa com 5 números, gráfico de veículos enviados (sem e com avaria, com as médias)
// e, ao lado, o recebimento nas lojas e o % com avaria por marca.
// Lê direto do servidor (precisa de internet); as contas ficam em dashboard-dados.js.
import { LOJAS } from "../config.js";
import {
  SEM_LOJA, dentro, diasUteis, filtrarDashboard, formatarPct, intervaloDoDashboard, maisAntigoAguardando, marcasDisponiveis,
  mediasDaSerie, porMarca, resumo, serie, topoDoEixo,
} from "../dashboard-dados.js";
import { enderecoDasVistorias } from "../painel-dados.js";
import { contarRecebimentos } from "../recebimento-dados.js";
import { $, $$, esc, icone } from "../ui.js";
import { atualizarPilula, ligarPilulas, pilulaSelect } from "./pilulas.js";

const PERIODOS = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["tudo", "Tudo"], ["personalizado", "Personalizado"]];
const NOME_UNIDADE = { hora: "hora", dia: "dia", semana: "semana", mes: "mês" };
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
// Até este número de colunas cabe o valor em cima de cada barra.
const MAX_COLUNAS_COM_VALOR = 31;
// Marca "bem acima da média": pelo menos 5 pontos percentuais acima do % geral com avaria.
const ACIMA_DA_MEDIA_PP = 5;

const num = (n) => Number(n).toLocaleString("pt-BR");
const dec = (n) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dois = (n) => String(n).padStart(2, "0");
const hojeCampo = (d = new Date()) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const semPrefixo = (loja) => String(loja ?? "").replace(/^PG Prime /, "");
const dataBr = (d) => `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;

// Primeiro e último dia do intervalo [de, ate) (ate é exclusivo).
function diasDoIntervalo({ de, ate }) {
  const fimEx = new Date(ate);
  return [new Date(de), new Date(fimEx.getFullYear(), fimEx.getMonth(), fimEx.getDate() - 1)];
}

// A CSP do site (style-src 'self') bloqueia style="" no HTML: medidas vão em
// data-largura / data-altura / data-baixo (em %) e são aplicadas pelo DOM depois de desenhar.
function aplicarMedidas(el) {
  $$("[data-largura]", el).forEach((b) => { b.style.width = `${b.dataset.largura}%`; });
  $$("[data-altura]", el).forEach((b) => { b.style.height = `${b.dataset.altura}%`; });
  $$("[data-baixo]", el).forEach((b) => { b.style.bottom = `${b.dataset.baixo}%`; });
}
const pctDe = (v, max) => (max ? Math.max(0, Math.min(100, (v / max) * 100)) : 0).toFixed(2);

// Seta e texto da comparação com o período anterior. bomQuandoCai: verde quando
// diminui (avarias), vermelho quando aumenta; senão, sem cor (volume).
function comparacao(diferenca, texto, { bomQuandoCai = false } = {}) {
  if (Math.abs(diferenca) < 0.05) return '<span class="db-igual">igual</span>';
  const seta = diferenca > 0 ? "▲" : "▼";
  const classe = !bomQuandoCai ? "db-neutro" : diferenca < 0 ? "db-bom" : "db-ruim";
  return `<span class="${classe}">${seta} ${texto}</span>`;
}

// ---------- Gráfico: veículos enviados por hora, dia, semana ou mês ----------
// Cada coluna empilha sem avaria (preto) e com avaria (laranja). Linhas tracejadas:
// média do período e do período anterior (não existem no gráfico por hora nem, a
// anterior, no "Tudo"). Passando o mouse, a dica mostra os números da coluna.
function graficoVolume(s, medias, { semAnterior, rotuloDia }) {
  const n = s.atual.length;
  const topo = topoDoEixo(Math.max(...s.atual, medias?.atual ?? 0, medias?.anterior ?? 0, 1));
  const comValores = n <= MAX_COLUNAS_COM_VALOR;
  const passo = Math.max(1, Math.ceil(n / 11));
  const grade = [0, topo / 2, topo].filter((k) => Number.isInteger(k))
    .map((k) => `<div class="db-grade-linha" data-baixo="${pctDe(k, topo)}"><span>${num(k)}</span></div>`).join("");
  const linhas = !medias ? "" : [
    medias.anterior == null ? "" : `<div class="db-media db-media-anterior" data-baixo="${pctDe(medias.anterior, topo)}"><span>ant. ${dec(medias.anterior)}</span></div>`,
    `<div class="db-media" data-baixo="${pctDe(medias.atual, topo)}"><span>média ${dec(medias.atual)}</span></div>`,
  ].join("");
  const colunas = s.atual.map((total, i) => {
    const avaria = s.comAvaria[i];
    const domingo = s.unidade === "dia" && rotuloDia(i).getDay() === 0;
    const dica = `<span class="db-dica" aria-hidden="true"><strong>${esc(s.unidade === "dia" ? `${SEMANA[rotuloDia(i).getDay()]}, ${s.rotulos[i]}` : s.rotulos[i])}</strong>
        <span><span>Enviados</span><b>${num(total)}</b></span><span><span>Com avaria</span><b>${num(avaria)}</b></span>
        ${semAnterior ? "" : `<span><span>Período anterior</span><b>${num(s.anterior[i])}</b></span>`}</span>`;
    return `<div class="db-coluna${total ? "" : " db-coluna-vazia"}">
        ${total ? `<span class="db-pilha" data-altura="${pctDe(total, topo)}">
          ${avaria ? `<span class="db-seg-avaria" data-altura="${pctDe(avaria, total)}"></span>` : ""}<span class="db-seg-ok"></span></span>` : ""}
        ${total && comValores ? `<span class="db-valor" data-baixo="${pctDe(total, topo)}">${num(total)}</span>` : ""}
        ${domingo && !total ? '<span class="db-dom">dom</span>' : ""}
        ${dica}
      </div>`;
  }).join("");
  const rotulos = s.rotulos.map((r, i) => `<span>${i % passo === 0 ? esc(r) : ""}</span>`).join("");
  return `<div class="db-plot-area">
      <div class="db-plot" role="img" aria-label="Veículos enviados por ${NOME_UNIDADE[s.unidade]}, sem e com avaria">${grade}${linhas}<div class="db-colunas">${colunas}</div></div>
      <div class="db-rotulos" aria-hidden="true">${rotulos}</div>
    </div>`;
}

export async function montar(raiz, ctx) {
  const estado = {
    periodo: "30d", de: hojeCampo(new Date(Date.now() - 29 * 86400000)), ate: hojeCampo(),
    marca: "", loja: "", itens: [], anteriores: [], intervalo: null, carregando: true, erro: "",
  };
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
  // "Ver veículos": a aba Vistorias com o mesmo período, marca e loja, filtrada pelo recebimento.
  const verVeiculos = (recebimento) => esc(enderecoDasVistorias(estado, recebimento));

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

    const intervalo = estado.intervalo;
    const semAnterior = Boolean(intervalo.tudo);
    const itens = filtrarDashboard(estado.itens, filtros());
    const anteriores = filtrarDashboard(estado.anteriores, filtros());
    const r = resumo(itens, anteriores);
    const ra = resumo(anteriores);
    const s = serie(itens, anteriores, intervalo);
    const medias = mediasDaSerie(s, intervalo);
    const rec = contarRecebimentos(itens);
    const paraLojas = rec.aguardando + rec.conforme + rec.divergencia;
    const recebidos = rec.conforme + rec.divergencia;
    const antigo = maisAntigoAguardando(itens);
    const uteis = diasUteis(intervalo);
    const marcas = porMarca(itens);
    const deDia = (i) => { const d = new Date(intervalo.de); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + i); };

    // ----- Faixa de indicadores -----
    const indicador = ({ icone: ic, rot, valor, classeValor = "", linhas, link = "" }) => {
      const corpo = `<span class="db-ind-rot">${icone(ic, "ic db-ind-ic")}${rot}</span>
        <span class="db-ind-num${classeValor ? ` ${classeValor}` : ""}">${valor}</span>
        ${linhas.filter(Boolean).map((l) => `<span class="db-ind-linha">${l}</span>`).join("")}`;
      return link
        ? `<a class="db-ind db-ind-link" href="${link}">${corpo}<span class="db-ind-ver">Ver veículos ${icone("setaDireita", "ic")}</span></a>`
        : `<div class="db-ind">${corpo}</div>`;
    };
    const variacaoTotal = r.variacao === null ? "" : comparacao(r.variacao, formatarPct(Math.abs(r.variacao), { casas: 0 }));
    const difAvaria = r.pctComAvaria - ra.pctComAvaria;
    const difGraves = r.graves - ra.graves;
    const diasAntigo = antigo && (antigo.dias === 0 ? "o mais antigo saiu hoje" : `mais antigo há ${plural(antigo.dias, "dia", "dias")}`);
    const faixa = `<section class="cb-cartao db-faixa" aria-label="Resumo do período">
      ${indicador({
        icone: "carro", rot: "Veículos enviados", valor: num(r.total),
        linhas: [
          semAnterior ? "todas as vistorias" : `${variacaoTotal} vs. ${num(r.totalAnterior)} no período anterior`,
          uteis > 1 ? `${dec(r.total / uteis)} por dia útil` : "",
        ],
      })}
      ${indicador({
        icone: "escudoAlerta", rot: "Saíram com avaria", valor: formatarPct(r.pctComAvaria),
        linhas: [
          `${num(r.comAvaria)} de ${plural(r.total, "veículo", "veículos")}`,
          semAnterior || !ra.total ? "" : `${comparacao(difAvaria, `${dec(Math.abs(difAvaria))} p.p.`, { bomQuandoCai: true })} vs. ${formatarPct(ra.pctComAvaria)} anterior`,
        ],
      })}
      ${indicador({
        icone: "octogonoAlerta", rot: "Avarias graves", valor: num(r.graves), classeValor: r.graves ? "db-grave" : "",
        linhas: [
          r.graves ? `em ${plural(r.veiculosComGrave, "veículo", "veículos")}` : "nenhuma no período",
          semAnterior || (!r.graves && !ra.graves) ? "" : difGraves === 0 ? `igual ao período anterior (${num(ra.graves)})`
            : `${comparacao(difGraves, num(Math.abs(difGraves)), { bomQuandoCai: true })} vs. ${num(ra.graves)} anterior`,
        ],
      })}
      ${indicador({
        icone: "relogio", rot: "Aguardando recebimento", valor: num(rec.aguardando),
        linhas: antigo ? [diasAntigo, esc(semPrefixo(antigo.vistoria.loja))] : ["nenhum veículo esperando"],
        link: rec.aguardando ? verVeiculos("aguardando") : "",
      })}
      ${indicador({
        icone: "alerta", rot: "Recebidos com divergência", valor: num(rec.divergencia), classeValor: rec.divergencia ? "db-erro" : "",
        linhas: [recebidos ? `${formatarPct((rec.divergencia / recebidos) * 100)} dos ${num(recebidos)} recebidos` : "nenhum recebido ainda"],
        link: rec.divergencia ? verVeiculos("divergencia") : "",
      })}
    </section>`;

    // ----- Gráfico de volume -----
    const subVolume = medias
      ? `Média de <strong>${dec(medias.atual)}</strong> por ${medias.unidade}${medias.anterior == null ? "" : ` · período anterior: ${dec(medias.anterior)}`}`
      : "Hoje, hora a hora";
    const volume = `<section class="cb-cartao db-volume" aria-labelledby="db-h-volume">
      <div class="db-cartao-topo">
        <div><h2 id="db-h-volume">Veículos enviados por ${NOME_UNIDADE[s.unidade]}</h2><p class="db-cartao-sub">${subVolume}</p></div>
        <p class="db-legenda">
          <span><span class="db-quad db-quad-sem"></span>Sem avaria</span>
          <span><span class="db-quad db-quad-avaria"></span>Com avaria</span>
          ${medias ? '<span><span class="db-traco"></span>Média</span>' : ""}
          ${medias?.anterior != null ? '<span><span class="db-traco db-traco-anterior"></span>Média anterior</span>' : ""}
        </p>
      </div>
      ${r.total ? graficoVolume(s, medias, { semAnterior, rotuloDia: deDia }) : '<p class="db-vazio">Nenhum veículo enviado no período.</p>'}
    </section>`;

    // ----- Recebimento nas lojas -----
    const linhaRec = (rot, n, classe, situacao) => `<li class="db-rec-linha">
        <span class="db-quad db-quad-${classe}"></span><span class="db-rec-rot">${rot}</span>
        <span class="db-rec-num">${num(n)}</span><span class="db-rec-pct">${formatarPct(paraLojas ? (n / paraLojas) * 100 : 0, { casas: 0 })}</span>
        ${situacao && n ? `<a class="db-rec-ver" href="${verVeiculos(situacao)}" title="Ver veículos" aria-label="Ver veículos: ${rot.toLowerCase()}">${icone("avancar")}</a>` : '<span class="db-rec-ver"></span>'}
      </li>`;
    const recebimento = `<section class="cb-cartao db-receb" aria-labelledby="db-h-receb">
      <h2 id="db-h-receb">Recebimento nas lojas</h2>
      ${paraLojas ? `<p class="db-cartao-sub">Situação dos ${plural(paraLojas, "veículo enviado", "veículos enviados")} para as lojas no período</p>
      <div class="db-barra-h" aria-hidden="true">
        ${[["conforme", rec.conforme], ["divergencia", rec.divergencia], ["aguardando", rec.aguardando]].filter(([, n]) => n)
    .map(([c, n]) => `<span class="db-quad-${c}" data-largura="${pctDe(n, paraLojas)}"></span>`).join("")}
      </div>
      <ul class="db-rec-lista">
        ${linhaRec("Recebidos sem divergência", rec.conforme, "conforme", "")}
        ${linhaRec("Recebidos com divergência", rec.divergencia, "divergencia", "divergencia")}
        ${linhaRec("Aguardando recebimento", rec.aguardando, "aguardando", "aguardando")}
      </ul>` : '<p class="db-vazio">Nenhum veículo enviado para loja no período.</p>'}
    </section>`;

    // ----- Por marca: % com avaria contra a média geral -----
    const escala = Math.max(50, Math.ceil(Math.max(0, ...marcas.map((m) => m.pctComAvaria)) / 10) * 10);
    const linhaMarca = (m) => {
      const acima = m.pctComAvaria >= r.pctComAvaria + ACIMA_DA_MEDIA_PP;
      return `<tr${acima ? ' class="db-acima"' : ""}>
        <th scope="row">${esc(m.nome)}</th><td class="cb-dir cb-tnum">${num(m.vistorias)}</td>
        <td class="db-col-trilho"><span class="db-trilho"><span class="db-trilho-barra" data-largura="${pctDe(m.pctComAvaria, escala)}"></span><span class="db-trilho-media" data-esquerda="${pctDe(r.pctComAvaria, escala)}"></span></span></td>
        <td class="cb-dir cb-tnum db-pct">${formatarPct(m.pctComAvaria, { casas: 0 })}</td>
        <td class="cb-dir cb-tnum${m.graves ? " db-grave" : " db-zero"}">${num(m.graves)}</td></tr>`;
    };
    const porMarcaHtml = `<section class="cb-cartao db-marcas" aria-labelledby="db-h-marca">
      <h2 id="db-h-marca">Por marca</h2>
      <p class="db-cartao-sub">Traço = média geral (${formatarPct(r.pctComAvaria)}) · laranja = bem acima</p>
      ${marcas.length ? `<table class="db-tabela-marcas">
        <thead><tr><th scope="col">Marca</th><th scope="col" class="cb-dir">Veículos</th><th scope="col" colspan="2">% com avaria</th><th scope="col" class="cb-dir">Graves</th></tr></thead>
        <tbody>${marcas.map(linhaMarca).join("")}</tbody></table>` : '<p class="db-vazio">Nenhuma vistoria no período.</p>'}
    </section>`;

    conteudo.innerHTML = `<div class="db-corpo${estado.carregando ? " cb-atualizando" : ""}" aria-busy="${estado.carregando}">
      ${faixa}
      <div class="db-grade">${volume}<div class="db-lateral">${recebimento}${porMarcaHtml}</div></div>
    </div>`;
    aplicarMedidas(conteudo);
    $$("[data-esquerda]", conteudo).forEach((b) => { b.style.left = `${b.dataset.esquerda}%`; });
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
  conteudo.addEventListener("click", (e) => {
    if (e.target.closest('[data-acao="tentar"]')) carregar();
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
