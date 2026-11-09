import { teste, igual, ok, esperar } from "./runner.js";
import { montarEtapa } from "./apoio.js";
import * as etapaVeiculo from "../../views/etapa-veiculo.js";
import * as etapaAvarias from "../../views/etapa-avarias.js";

// iPhone: o Safari só abre a câmera se o input de arquivo for acionado NO MESMO
// toque. Qualquer espera antes (como a consulta de permissão, que no Safari é
// assíncrona) faz o clique ser ignorado em silêncio. Estes testes simulam essa
// consulta lenta e conferem que o seletor é aberto antes de qualquer espera.
function simularPermissaoLenta() {
  const original = Object.getOwnPropertyDescriptor(Navigator.prototype, "permissions");
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: () => new Promise((resolve) => setTimeout(() => resolve({ state: "prompt" }), 300)) },
  });
  const cliqueOriginal = HTMLInputElement.prototype.click;
  const cliques = [];
  HTMLInputElement.prototype.click = function () {
    if (this.type === "file") cliques.push({ capture: this.getAttribute("capture"), accept: this.accept });
    // não abre nada de verdade
  };
  return {
    cliques,
    restaurar() {
      HTMLInputElement.prototype.click = cliqueOriginal;
      delete navigator.permissions;
      if (original) Object.defineProperty(Navigator.prototype, "permissions", original);
    },
  };
}

teste("iPhone: tocar na foto do veículo abre a câmera na hora, sem esperar a permissão", async () => {
  const s = simularPermissaoLenta();
  const t = await montarEtapa(etapaVeiculo);
  try {
    const alvo = t.el.querySelector('.foto-slot[data-chave="frente"] .foto-alvo');
    alvo.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // Nada de await aqui: o clique no seletor precisa ter acontecido dentro do toque.
    igual(s.cliques.length, 1, "o seletor de arquivo não foi acionado dentro do toque");
    igual(s.cliques[0].capture, "environment");
  } finally {
    document.querySelectorAll('input[type="file"]').forEach((i) => i.remove());
    s.restaurar();
    await t.fim();
  }
});

teste("iPhone: 'Adicionar foto' da avaria abre a câmera na hora, sem esperar a permissão", async () => {
  const s = simularPermissaoLenta();
  const t = await montarEtapa(etapaAvarias);
  try {
    [...t.el.querySelectorAll("button")].find((b) => b.textContent.includes("Adicionar avaria")).click();
    const d = document.querySelector("dialog.cheio[open]");
    ok(d, "o editor de avaria não abriu");
    [...d.querySelectorAll("button")].find((b) => b.textContent.includes("Adicionar foto")).click();
    igual(s.cliques.length, 1, "o seletor de arquivo não foi acionado dentro do toque");
    d.close();
  } finally {
    document.querySelectorAll('input[type="file"]').forEach((i) => i.remove());
    s.restaurar();
    await t.fim();
  }
});

teste("iPhone: o input da câmera existe na página (não fica com display:none)", async () => {
  const s = simularPermissaoLenta();
  const { escolherFoto } = await import("../../photos.js");
  try {
    escolherFoto();
    const input = document.querySelector('input[type="file"][capture]');
    ok(input, "o input não foi colocado na página");
    ok(!input.hidden && getComputedStyle(input).display !== "none", "input com display:none: o Safari antigo ignora o clique");
    igual(input.getAttribute("accept"), "image/*");
    input.remove();
  } finally {
    s.restaurar();
  }
});
