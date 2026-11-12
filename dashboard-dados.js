// Regras do dashboard do gerente (views/dashboard.js): períodos, filtros e
// indicadores. Só funções puras sobre a lista de vistorias do período; nada de
// tela nem de servidor. Datas sempre no fuso do navegador.
//
// Cada item tem o formato de supabase.js → itemDoDashboard():
// { id, numero, realizadaEm (ISO), chassi, marca, modelo, loja ("" se não tem),
//   avarias: [{ area, tipo, gravidade }] }
import { periodoPersonalizado } from "./formatos.js";

export const SEM_LOJA = "Sem loja informada";
const ORDEM_GRAVIDADE = ["Leve", "Moderada", "Grave"];
const DIA_MS = 86400000;

const meiaNoite = (ano, mes, dia) => new Date(ano, mes, dia);

// ---------- Período ----------
// tipo: "hoje" | "7d" | "30d" | "mes" | "personalizado" (com de/ate "aaaa-mm-dd").
// Devolve o intervalo [de, ate) em ISO, o período anterior de mesmo tamanho
// (para comparar) e se o gráfico é por hora (um dia só) ou por dia.
// null quando o personalizado está incompleto ou invertido.
export function intervaloDoDashboard(tipo, agora = new Date(), personalizado = {}) {
  const a = agora.getFullYear(), m = agora.getMonth(), d = agora.getDate();
  const amanha = meiaNoite(a, m, d + 1);
  let de, ate;
  if (tipo === "hoje") [de, ate] = [meiaNoite(a, m, d), amanha];
  else if (tipo === "7d") [de, ate] = [meiaNoite(a, m, d - 6), amanha];
  else if (tipo === "30d") [de, ate] = [meiaNoite(a, m, d - 29), amanha];
  else if (tipo === "mes") [de, ate] = [meiaNoite(a, m, 1), amanha];
  else if (tipo === "personalizado") {
    const p = periodoPersonalizado(personalizado.de, personalizado.ate);
    if (!p.de || !p.ate || p.de >= p.ate) return null;
    [de, ate] = [new Date(p.de), new Date(p.ate)];
  } else return null;

  // Conta em dias de calendário (não em ms), para atravessar horário de verão sem erro.
  const dias = Math.round((ate - de) / DIA_MS);
  const anteriorDe = meiaNoite(de.getFullYear(), de.getMonth(), de.getDate() - dias);
  return {
    de: de.toISOString(),
    ate: ate.toISOString(),
    dias,
    porHora: dias === 1,
    anterior: { de: anteriorDe.toISOString(), ate: de.toISOString() },
  };
}

export const dentro = (iso, { de, ate }) => iso >= de && iso < ate;

// ---------- Filtros ----------
export const lojaDe = (v) => (String(v.loja ?? "").trim() || SEM_LOJA);
export const marcaDe = (v) => String(v.marca ?? "").trim() || "—";

export function filtrarDashboard(itens, { marca = "", loja = "" } = {}) {
  return itens.filter((v) => (!marca || marcaDe(v) === marca) && (!loja || lojaDe(v) === loja));
}

// Marcas presentes nos itens, em ordem alfabética (para o filtro).
export function marcasDisponiveis(itens) {
  return [...new Set(itens.map(marcaDe))].sort((x, y) => x.localeCompare(y, "pt-BR"));
}

// ---------- Indicadores ----------
const temAvaria = (v) => (v.avarias?.length ?? 0) > 0;
const graves = (v) => (v.avarias || []).filter((a) => a.gravidade === "Grave").length;
const pct = (parte, total) => (total ? (parte / total) * 100 : 0);

export function resumo(itens, anteriores = []) {
  const total = itens.length;
  const comAvaria = itens.filter(temAvaria).length;
  const avarias = itens.reduce((s, v) => s + (v.avarias?.length ?? 0), 0);
  const gravesQtd = itens.reduce((s, v) => s + graves(v), 0);
  return {
    total,
    totalAnterior: anteriores.length,
    // null quando não há base de comparação (período anterior vazio).
    variacao: anteriores.length ? ((total - anteriores.length) / anteriores.length) * 100 : null,
    comAvaria,
    pctComAvaria: pct(comAvaria, total),
    avarias,
    graves: gravesQtd,
    pctGraves: pct(gravesQtd, avarias),
  };
}

// Série do gráfico: uma coluna por dia (ou por hora, se o período é um dia só),
// com a contagem do período anterior na mesma posição.
export function serie(itens, anteriores, intervalo) {
  const de = new Date(intervalo.de);
  const deAnterior = new Date(intervalo.anterior.de);
  const n = intervalo.porHora ? 24 : intervalo.dias;
  const indice = (iso, base) => {
    const t = new Date(iso);
    if (intervalo.porHora) return t.getHours() + Math.round((meiaNoite(t.getFullYear(), t.getMonth(), t.getDate()) - base) / DIA_MS) * 24;
    return Math.round((meiaNoite(t.getFullYear(), t.getMonth(), t.getDate()) - base) / DIA_MS);
  };
  const atual = Array(n).fill(0);
  const anterior = Array(n).fill(0);
  for (const v of itens) {
    const i = indice(v.realizadaEm, de);
    if (i >= 0 && i < n) atual[i]++;
  }
  for (const v of anteriores) {
    const i = indice(v.realizadaEm, deAnterior);
    if (i >= 0 && i < n) anterior[i]++;
  }
  const rotulos = Array.from({ length: n }, (_, i) => {
    if (intervalo.porHora) return `${String(i).padStart(2, "0")}h`;
    const dia = meiaNoite(de.getFullYear(), de.getMonth(), de.getDate() + i);
    return `${String(dia.getDate()).padStart(2, "0")}/${String(dia.getMonth() + 1).padStart(2, "0")}`;
  });
  return { rotulos, atual, anterior };
}

export function porGravidade(itens) {
  const c = Object.fromEntries(ORDEM_GRAVIDADE.map((g) => [g, 0]));
  for (const v of itens) for (const a of v.avarias || []) if (a.gravidade in c) c[a.gravidade]++;
  const total = ORDEM_GRAVIDADE.reduce((s, g) => s + c[g], 0);
  return ORDEM_GRAVIDADE.map((g) => ({ gravidade: g, qtd: c[g], pct: pct(c[g], total) }));
}

function ranking(itens, campo, limite) {
  const c = new Map();
  for (const v of itens) for (const a of v.avarias || []) {
    const k = String(a[campo] ?? "").trim();
    if (k) c.set(k, (c.get(k) || 0) + 1);
  }
  return [...c].map(([nome, qtd]) => ({ nome, qtd }))
    .sort((x, y) => y.qtd - x.qtd || x.nome.localeCompare(y.nome, "pt-BR"))
    .slice(0, limite);
}

export const rankingAreas = (itens, limite = 5) => ranking(itens, "area", limite);
export const rankingTipos = (itens, limite = 3) => ranking(itens, "tipo", limite);

function agrupar(itens, chave) {
  const grupos = new Map();
  for (const v of itens) {
    const k = chave(v);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(v);
  }
  return [...grupos].map(([nome, lista]) => {
    const comAvaria = lista.filter(temAvaria).length;
    return {
      nome,
      vistorias: lista.length,
      comAvaria,
      pctComAvaria: pct(comAvaria, lista.length),
      graves: lista.reduce((s, v) => s + graves(v), 0),
      ultima: lista.reduce((u, v) => (v.realizadaEm > u ? v.realizadaEm : u), ""),
    };
  }).sort((x, y) => y.vistorias - x.vistorias || x.nome.localeCompare(y.nome, "pt-BR"));
}

export const porMarca = (itens) => agrupar(itens, marcaDe);
// "Sem loja informada" (vistorias de antes do campo Loja) fica sempre por último.
export const porLoja = (itens) => {
  const linhas = agrupar(itens, lojaDe);
  return [...linhas.filter((l) => l.nome !== SEM_LOJA), ...linhas.filter((l) => l.nome === SEM_LOJA)];
};

// Gravidade mais alta entre as avarias da vistoria ("" se não tem avaria).
export function gravidadeMaxima(v) {
  return (v.avarias || []).reduce((max, a) => {
    const i = ORDEM_GRAVIDADE.indexOf(a.gravidade);
    return i > ORDEM_GRAVIDADE.indexOf(max) ? a.gravidade : max;
  }, "");
}

// Vistorias com avaria, mais recentes primeiro. soGraves: só as que têm ao menos
// uma avaria Grave. limite null = todas (lista aberta pelos cartões do topo).
export function ultimasComAvaria(itens, limite = 8, { soGraves = false } = {}) {
  const lista = itens.filter((v) => (soGraves ? graves(v) > 0 : temAvaria(v)))
    .sort((x, y) => y.realizadaEm.localeCompare(x.realizadaEm));
  return (limite == null ? lista : lista.slice(0, limite))
    .map((v) => ({ ...v, gravidadeMaxima: gravidadeMaxima(v) }));
}

// Escala "redonda" do eixo do gráfico (1, 2, 5, 10, 20, 50…), com no mínimo 4.
export function topoDoEixo(maximo) {
  if (maximo <= 4) return 4;
  const base = 10 ** Math.floor(Math.log10(maximo));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * base >= maximo) return f * base;
  return 10 * base;
}

// "12,5%" / "+12%" no formato brasileiro.
export function formatarPct(valor, { sinal = false, casas = 1 } = {}) {
  const arred = Number(valor.toFixed(casas));
  const texto = arred.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
  return `${sinal && arred > 0 ? "+" : ""}${texto}%`;
}
