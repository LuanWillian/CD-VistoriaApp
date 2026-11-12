// Filtro em "pílula" do visual do computador (painel e dashboard): o texto da
// opção escolhida + ícone, com um <select> nativo transparente por cima (abre a
// lista do sistema, funciona no teclado e no leitor de tela). A pílula fica azul
// quando há filtro escolhido (ou sempre, com sempreAtiva). Com fechar, a pílula
// ativa mostra um X que limpa o filtro.
import { esc, icone } from "../ui.js";

// opcoes: [[valor, texto]]. iconeNome: ícone à direita.
export function pilulaSelect({ id, rotulo, opcoes, valor = "", iconeNome = "setaBaixo", sempreAtiva = false, fechar = false }) {
  const escolhida = opcoes.find(([v]) => v === valor) || opcoes[0];
  const ativa = sempreAtiva || valor !== "";
  return `<label class="cb-pilula${fechar ? " cb-pilula-com-x" : ""}" data-pilula${ativa ? " data-ativa" : ""}${sempreAtiva ? " data-sempre" : ""}>
      <span class="cb-pilula-texto">${esc(escolhida?.[1] ?? "")}</span>${icone(iconeNome, "ic cb-pilula-ic cb-pilula-seta")}
      <select id="${esc(id)}" aria-label="${esc(rotulo)}">${opcoes.map(([v, t]) => `<option value="${esc(v)}"${v === valor ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
      ${fechar ? `<span class="cb-pilula-fechar" data-fechar-pilula title="Limpar este filtro">${icone("x", "ic cb-pilula-ic")}</span>` : ""}
    </label>`;
}

// Depois de trocar o valor ou as opções do <select>: atualiza o texto e a cor.
export function atualizarPilula(select) {
  const pilula = select.closest("[data-pilula]");
  if (!pilula) return;
  pilula.querySelector(".cb-pilula-texto").textContent = select.selectedOptions[0]?.textContent ?? "";
  pilula.toggleAttribute("data-ativa", pilula.hasAttribute("data-sempre") || select.value !== "");
}

// O X da pílula ativa limpa o filtro (dispara o mesmo "change" do <select>).
export function ligarPilulas(raiz) {
  raiz.addEventListener("click", (e) => {
    const x = e.target.closest("[data-fechar-pilula]");
    if (!x) return;
    e.preventDefault();
    const select = x.closest("[data-pilula]")?.querySelector("select");
    if (!select || select.value === "") return;
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
