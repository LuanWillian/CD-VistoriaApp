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

export const primeiroNome = (nome) => String(nome ?? "").trim().split(/\s+/)[0] || "";

// Junta a vistoria do servidor com a cópia do aparelho (a do aparelho manda no
// estado local, como status e fotos), mas o recebimento na loja é sempre o do
// servidor quando ele veio: a cópia guardada pode ser de antes do recebimento.
export function juntarComServidor(remoto, local) {
  return { ...remoto, ...local, recebimento: remoto.recebimento !== undefined ? remoto.recebimento : local.recebimento };
}
