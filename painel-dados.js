// Regras do painel do computador (views/painel.js): métricas, busca e paginação.
// Só funções puras sobre a lista de vistorias; nada de tela nem de armazenamento.
import { nomeVistoria, periodo } from "./formatos.js";
import { dentro, intervaloDoDashboard, lojaDe, marcaDe } from "./dashboard-dados.js";
import { situacaoRecebimento } from "./recebimento-dados.js";

// Sem acento e sem diferenciar maiúsculas: "Ônix" acha "onix".
export const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const maisRecentesPrimeiro = (itens) => [...itens].sort((a, b) => b.realizadaEm.localeCompare(a.realizadaEm));

// Busca nos mesmos campos da tela Vistorias (chassi, marca, modelo, número).
// Período, marca e loja funcionam igual aos filtros do dashboard: "todos" ou
// os períodos de intervaloDoDashboard (hoje, 7d, 30d, mes, personalizado com
// de/ate "aaaa-mm-dd"). Personalizado incompleto ou invertido não filtra a data.
// recebimento: "" (todos) | "aguardando" | "conforme" | "divergencia".
export function filtrarVistorias(itens, { busca = "", periodo: tipo = "todos", de = "", ate = "", marca = "", loja = "", recebimento = "" } = {}, agora = new Date()) {
  const intervalo = tipo === "todos" ? null : intervaloDoDashboard(tipo, agora, { de, ate });
  const t = semAcento(busca).trim();
  return itens.filter((v) => {
    if (intervalo && !dentro(v.realizadaEm, intervalo)) return false;
    if (marca && marcaDe(v) !== marca) return false;
    if (loja && lojaDe(v) !== loja) return false;
    if (recebimento && situacaoRecebimento(v) !== recebimento) return false;
    if (!t) return true;
    return [v.chassi, v.marca, v.modelo, nomeVistoria(v)].some((x) => semAcento(x).includes(t));
  });
}

// "Pendentes" = tudo que ainda não tem o selo Sincronizada (pendente ou com erro).
export function calcularMetricas(itens, agora = new Date()) {
  const hoje = periodo("hoje", agora).de;
  const semana = periodo("7d", agora).de;
  return {
    hoje: itens.filter((v) => v.realizadaEm >= hoje).length,
    semana: itens.filter((v) => v.realizadaEm >= semana).length,
    pendentes: itens.filter((v) => v.status !== "sincronizada").length,
    total: itens.length,
  };
}

// Página (começa em 0) já corrigida para caber no total; "de" e "ate" são 1-based.
export function paginar(itens, pagina, tamanho) {
  const paginas = Math.max(1, Math.ceil(itens.length / tamanho));
  const atual = Math.min(Math.max(pagina, 0), paginas - 1);
  const inicio = atual * tamanho;
  const fatia = itens.slice(inicio, inicio + tamanho);
  return { itens: fatia, pagina: atual, paginas, de: fatia.length ? inicio + 1 : 0, ate: inicio + fatia.length, total: itens.length };
}

// Botões numerados da paginação (páginas começam em 0): a primeira, a última e as
// vizinhas da atual; null marca um salto ("…"). Até 7 páginas, todas aparecem.
export function numerosDePagina(atual, total) {
  if (total <= 7) return [...Array(Math.max(total, 0)).keys()];
  const s = new Set([0, total - 1, atual - 1, atual, atual + 1]);
  if (atual <= 3) [1, 2, 3, 4].forEach((p) => s.add(p));
  if (atual >= total - 4) [total - 5, total - 4, total - 3, total - 2].forEach((p) => s.add(p));
  const paginas = [...s].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const saida = [];
  paginas.forEach((p, i) => {
    if (i && p - paginas[i - 1] > 1) saida.push(null);
    saida.push(p);
  });
  return saida;
}

// Anterior/Próxima no detalhe da vistoria: as vizinhas na ordem da lista (ids).
// Fora da lista, nenhuma das duas.
export function vizinhasNaLista(ids, id) {
  const i = Array.isArray(ids) ? ids.indexOf(id) : -1;
  if (i < 0) return { anterior: null, proxima: null };
  return { anterior: ids[i - 1] ?? null, proxima: ids[i + 1] ?? null };
}

export const primeiroNome = (nome) => String(nome ?? "").trim().split(/\s+/)[0] || "";

// Junta a vistoria do servidor com a cópia do aparelho (a do aparelho manda no
// estado local, como status e fotos), mas o recebimento na loja é sempre o do
// servidor quando ele veio: a cópia guardada pode ser de antes do recebimento.
export function juntarComServidor(remoto, local) {
  return { ...remoto, ...local, recebimento: remoto.recebimento !== undefined ? remoto.recebimento : local.recebimento };
}

// ---------- Link para a aba Vistorias já filtrada ----------
// Monta e lê #/inicio?periodo=…&marca=…&loja=…&recebimento=…, para outra tela (como o
// relatório mensal) abrir a aba Vistorias filtrada. "Tudo" vira "Todo o período".
const PERIODOS_DO_ENDERECO = ["todos", "hoje", "7d", "30d", "mes", "personalizado"];
const RECEBIMENTOS_DO_ENDERECO = ["aguardando", "conforme", "divergencia"];
const DATA_CAMPO = /^\d{4}-\d{2}-\d{2}$/;

export function enderecoDasVistorias({ periodo = "todos", de = "", ate = "", marca = "", loja = "" } = {}, recebimento = "") {
  const p = new URLSearchParams();
  p.set("periodo", periodo === "tudo" ? "todos" : periodo);
  if (periodo === "personalizado") {
    if (de) p.set("de", de);
    if (ate) p.set("ate", ate);
  }
  if (marca) p.set("marca", marca);
  if (loja) p.set("loja", loja);
  if (recebimento) p.set("recebimento", recebimento);
  return `#/inicio?${p}`;
}

// Filtros iniciais da aba Vistorias lidos do endereço (URLSearchParams). Só entram
// valores conhecidos; marca e loja vão como texto (a tela trata as que não existem).
export function filtrosDoEndereco(busca) {
  const f = {};
  if (!busca?.get) return f;
  const periodo = busca.get("periodo");
  if (PERIODOS_DO_ENDERECO.includes(periodo)) f.periodo = periodo;
  if (f.periodo === "personalizado") {
    for (const campo of ["de", "ate"]) if (DATA_CAMPO.test(busca.get(campo) ?? "")) f[campo] = busca.get(campo);
  }
  for (const campo of ["marca", "loja"]) {
    const valor = String(busca.get(campo) ?? "").trim();
    if (valor) f[campo] = valor;
  }
  if (RECEBIMENTOS_DO_ENDERECO.includes(busca.get("recebimento"))) f.recebimento = busca.get("recebimento");
  return f;
}

// ---------- Relatório de carros enviados (mensagem do WhatsApp do gerente) ----------
// Todo dia o gerente manda no grupo do WhatsApp a lista dos carros que saíram:
//   Carros enviados;
//
//   GWM:
//   Poer - 603799
//   ...
// Marcas em ordem alfabética; dentro da marca, na ordem em que os carros saíram.
const dois = (n) => String(n).padStart(2, "0");
export const diaDoCampo = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; };

// Vistorias feitas no dia "aaaa-mm-dd" (no fuso do navegador), mais antigas primeiro.
export function carrosDoDia(itens, dia) {
  if (!dia) return [];
  return itens.filter((v) => v.status !== "excluindo" && v.realizadaEm && diaDoCampo(v.realizadaEm) === dia)
    .sort((a, b) => a.realizadaEm.localeCompare(b.realizadaEm));
}

const porMarcaDoDia = (carros) => {
  const grupos = new Map();
  for (const v of carros) {
    const m = marcaDe(v);
    if (!grupos.has(m)) grupos.set(m, []);
    grupos.get(m).push(v);
  }
  return [...grupos].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
};

export const marcasDosCarros = (carros) => porMarcaDoDia(carros).map(([nome, lista]) => ({ nome, qtd: lista.length }));

// marcas: lista das marcas escolhidas (null = todas). Sem carros, texto vazio.
export function textoCarrosEnviados(carros, marcas = null) {
  const grupos = porMarcaDoDia(carros).filter(([nome]) => !marcas || marcas.includes(nome));
  if (!grupos.length) return "";
  const linha = (v) => `${String(v.modelo ?? "").trim() || "(sem modelo)"} - ${String(v.chassi ?? "").trim() || "(sem chassi)"}`;
  return ["Carros enviados;", ...grupos.map(([nome, lista]) => `\n${nome}:\n${lista.map(linha).join("\n")}`)].join("\n");
}
