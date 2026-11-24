// Dashboard do gerente (#/dashboard), só no navegador do computador. Versão enxuta:
// faixa com 5 números e o gráfico de veículos enviados por dia (largura toda).
// Lê direto do servidor (precisa de internet); as contas ficam em dashboard-dados.js.
import { LOJAS } from "../config.js";
import { capitalizar } from "../formatos.js";
import {
  SEM_LOJA, dentro, diasUteis, filtrarDashboard, formatarPct, intervaloDoDashboard, maisAntigoAguardando, marcasDisponiveis,
  mediasDaSerie, resumo, serie, topoDoEixo,
} from "../dashboard-dados.js";
import { enderecoDasVistorias } from "../painel-dados.js";
import { contarRecebimentos } from "../recebimento-dados.js";
import { $, $$, esc, icone } from "../ui.js";
import { atualizarPilula, ligarPilulas, pilulaSelect } from "./pilulas.js";

const PERIODOS = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["tudo", "Tudo"], ["personalizado", "Personalizado"]];
const NOME_UNIDADE = { hora: "hora", dia: "dia", semana: "semana", mes: "mês" };
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

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
  // Posição de cada coluna do gráfico: o CSS usa --i para as barras entrarem em sequência.
  $$(".db-coluna", el).forEach((c, i) => { c.style.setProperty("--i", i); });
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
// Uma barra por coluna, cinza-claro, com o número em cima; o dia de pico em preto
// (a cor da marca) e com o rótulo destacado embaixo. Grade tracejada ao fundo.
// Passando o mouse, a dica mostra enviados, com avaria e o período anterior.
// Divisões da grade: 5, 4 ou 2 partes, a que der números inteiros.
function divisoesDaGrade(topo) {
  const partes = [5, 4, 2].find((d) => topo % d === 0) || 1;
  return Array.from({ length: partes + 1 }, (_, k) => (topo / partes) * k);
}
function graficoVolume(s, { semAnterior, rotuloDia }) {
  const n = s.atual.length;
  const topo = topoDoEixo(Math.max(...s.atual, 1));
  const pico = s.atual.indexOf(Math.max(...s.atual));
  const passo = Math.max(1, Math.ceil(n / 11));
  const grade = divisoesDaGrade(topo)
    .map((k) => `<div class="db-grade-linha${k ? "" : " db-grade-base"}" data-baixo="${pctDe(k, topo)}"><span>${num(k)}</span></div>`).join("");
  const colunas = s.atual.map((total, i) => {
    const domingo = s.unidade === "dia" && rotuloDia(i).getDay() === 0;
    const ePico = i === pico && total > 0;
    const dica = `<span class="db-dica" aria-hidden="true"><strong>${esc(s.unidade === "dia" ? `${SEMANA[rotuloDia(i).getDay()]}, ${s.rotulos[i]}` : s.rotulos[i])}</strong>
        <span><span>Enviados</span><b>${num(total)}</b></span><span><span>Com avaria</span><b>${num(s.comAvaria[i])}</b></span>
        ${semAnterior ? "" : `<span><span>Período anterior</span><b>${num(s.anterior[i])}</b></span>`}</span>`;
    return `<div class="db-coluna${total ? "" : " db-coluna-vazia"}">
        ${total ? `<span class="db-barra${ePico ? " db-barra-pico" : ""}" data-altura="${pctDe(total, topo)}"></span>
        <span class="db-valor${ePico ? " db-valor-pico" : ""}" data-baixo="${pctDe(total, topo)}">${num(total)}</span>` : ""}
        ${domingo && !total ? '<span class="db-dom">dom</span>' : ""}
        ${dica}
      </div>`;
  }).join("");
  // Por dia, o rótulo leva o dia da semana em cima da data ("Qui" / "13/11").
  const texto = (r, i) => (s.unidade === "dia"
    ? `<small class="db-rot-semana">${capitalizar(SEMANA[rotuloDia(i).getDay()])}</small>${esc(r)}` : esc(r));
  const rotulos = s.rotulos.map((r, i) => (i === pico && s.atual[i] ? `<span><b class="db-rot-pico">${texto(r, i)}</b></span>`
    : `<span>${i % passo === 0 && (passo === 1 || Math.abs(i - pico) > 1) ? texto(r, i) : ""}</span>`)).join("");
  return `<div class="db-plot-area">
      <div class="db-plot" role="img" aria-label="Veículos enviados por ${NOME_UNIDADE[s.unidade]}; pico em ${esc(s.rotulos[pico])}, com ${num(s.atual[pico])}">${grade}<div class="db-colunas">${colunas}</div></div>
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
    const recebidos = rec.conforme + rec.divergencia;
    const antigo = maisAntigoAguardando(itens);
    const uteis = diasUteis(intervalo);
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
          semAnterior ? "todas as vistorias" : r.totalAnterior && r.total === r.totalAnterior ? `igual ao período anterior (${num(r.totalAnterior)})`
            : `${variacaoTotal} vs. ${num(r.totalAnterior)} no período anterior`,
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
      ? `Média de <strong>${dec(medias.atual)}</strong> por ${medias.unidade}`
      : "Hoje, hora a hora";
    const volume = `<section class="cb-cartao db-volume" aria-labelledby="db-h-volume">
      <div class="db-cartao-topo">
        <div><h2 id="db-h-volume">Veículos enviados por ${NOME_UNIDADE[s.unidade]}</h2><p class="db-cartao-sub">${subVolume}</p></div>
        <p class="db-legenda">
          <span><span class="db-quad db-quad-pico"></span>Dia de pico</span>
          <span><span class="db-quad db-quad-regular"></span>Demais dias</span>
        </p>
      </div>
      ${r.total ? graficoVolume(s, { semAnterior, rotuloDia: deDia }) : '<p class="db-vazio">Nenhum veículo enviado no período.</p>'}
    </section>`;

    conteudo.innerHTML = `<div class="db-corpo${estado.carregando ? " cb-atualizando" : ""}" aria-busy="${estado.carregando}">
      ${faixa}
      ${volume}
    </div>`;
    aplicarMedidas(conteudo);
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
