// Barra lateral preta do computador (só contas do CD): atalhos da lista de
// vistorias com as contagens. Fica dentro do topo (index.html), que no computador
// vira a barra lateral (styles.css, html.computador.com-lateral). O painel
// (views/painel.js) põe as contagens e marca o atalho ativo; na lista, o clique
// filtra sem recarregar; em outras telas, o link abre a lista já filtrada.
import { icone } from "../ui.js";

// [chave, texto, ícone, endereço, cor do ponto]
const ATALHOS = [
  ["todas", "Todas", "camadas", "#/inicio", ""],
  ["hoje", "Hoje", "calendario", "#/inicio?periodo=hoje", ""],
];
const RECEBIMENTO = [
  ["aguardando", "Aguardando", "relogio", "#/inicio?recebimento=aguardando", "lat-ponto-pendente"],
  ["divergencia", "Com divergência", "alertaCirculo", "#/inicio?recebimento=divergencia", "lat-ponto-erro"],
  ["conforme", "Nenhuma divergência", "checkCirculo", "#/inicio?recebimento=conforme", ""],
];

const item = ([chave, texto, ic, href, ponto]) => `
    <a class="lat-item" href="${href}" data-lat="${chave}">${icone(ic)}<span class="lat-texto">${texto}</span>
      <span class="lat-n">${ponto ? `<span class="lat-ponto ${ponto}" aria-hidden="true"></span>` : ""}<span data-lat-n="${chave}"></span></span></a>`;

export function htmlLateral() {
  return `<nav class="lat-nav" id="lat-nav" aria-label="Vistorias">
    <p class="lat-grupo">Vistorias</p>${ATALHOS.map(item).join("")}
    <p class="lat-grupo">Recebimento na loja</p>${RECEBIMENTO.map(item).join("")}
  </nav>`;
}

// Filtros que cada atalho liga na lista (o resto dos filtros fica como está).
export function filtrosDoAtalho(chave) {
  if (chave === "hoje") return { periodo: "hoje", recebimento: "" };
  if (["aguardando", "divergencia", "conforme"].includes(chave)) return { periodo: "todos", recebimento: chave };
  return { periodo: "todos", recebimento: "" };
}

// Atalho que corresponde aos filtros escolhidos (null quando nenhum corresponde).
export function atalhoAtivo({ periodo, recebimento }) {
  if (recebimento) return periodo === "todos" ? recebimento : null;
  if (periodo === "hoje") return "hoje";
  return periodo === "todos" ? "todas" : null;
}

const TITULOS = {
  todas: "Todas as vistorias", hoje: "Vistorias de hoje", aguardando: "Aguardando recebimento",
  divergencia: "Recebidas com divergência", conforme: "Recebidas sem divergência",
};
export const tituloDoAtalho = (chave) => TITULOS[chave] || "Vistorias";

// contagens: { todas, hoje, aguardando, divergencia, conforme } (números) ou null para não mexer.
export function atualizarLateral({ contagens = null, ativo } = {}, raiz = document) {
  const nav = raiz.querySelector("#lat-nav");
  if (!nav) return;
  if (contagens) {
    for (const el of nav.querySelectorAll("[data-lat-n]")) {
      const n = contagens[el.dataset.latN];
      el.textContent = Number.isFinite(n) ? n.toLocaleString("pt-BR") : "";
    }
  }
  if (ativo !== undefined) {
    for (const a of nav.querySelectorAll("[data-lat]")) {
      if (a.dataset.lat === ativo) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  }
}
