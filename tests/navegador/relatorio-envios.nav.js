import { teste, igual, ok, esperar } from "./runner.js";
import { abrirRelatorioEnvios } from "../../views/relatorio-envios.js";

const AGORA = new Date(2026, 10, 17, 18, 0);
const carro = (id, marca, modelo, chassi, dia, hora) => ({ id, marca, modelo, chassi, realizadaEm: new Date(2026, 10, dia, hora, 0).toISOString(), status: "sincronizada" });
const ITENS = [
  carro("1", "GWM", "Tank 400", "603985", 17, 10),
  carro("2", "Jeep", "Renegade", "741485", 17, 9),
  carro("3", "GWM", "Poer", "603799", 17, 8),
  carro("4", "Leapmotor", "B10", "063374", 17, 15),
  carro("5", "<b>GWM</b>", "<i>Ora</i>", "604893", 16, 11),
];

function abrir(avisos = []) {
  const d = abrirRelatorioEnvios(ITENS, { avisar: (t) => avisos.push(t), agora: AGORA });
  return { d, texto: () => d.querySelector("#re-texto").value, marcas: () => [...d.querySelectorAll("[data-marca]")].map((b) => b.textContent.trim()),
    escolhidas: () => [...d.querySelectorAll('[data-marca][aria-pressed="true"]')].map((b) => b.dataset.marca), fim: () => d.close() };
}

teste("relatório de carros enviados: abre com os carros de hoje, todas as marcas", async () => {
  const t = abrir();
  try {
    ok(t.d.open, "a janela abriu");
    igual(t.d.querySelector("#re-dia").value, "2026-11-17");
    igual(t.marcas(), ["Todas (4)", "GWM (2)", "Jeep (1)", "Leapmotor (1)"]);
    igual(t.escolhidas(), [""], "Todas vem marcada");
    igual(t.texto(), "Carros enviados;\n\nGWM:\nPoer - 603799\nTank 400 - 603985\n\nJeep:\nRenegade - 741485\n\nLeapmotor:\nB10 - 063374");
    ok(t.d.querySelector("#re-nota").textContent.includes("4 carros"), "faltou o total na nota");
  } finally {
    t.fim();
  }
});

teste("relatório de carros enviados: só a GWM, depois GWM e Jeep, e volta para todas", async () => {
  const t = abrir();
  try {
    t.d.querySelector('[data-marca="GWM"]').click();
    igual(t.escolhidas(), ["GWM"]);
    igual(t.texto(), "Carros enviados;\n\nGWM:\nPoer - 603799\nTank 400 - 603985");
    ok(t.d.querySelector("#re-nota").textContent.includes("2 de 4 carros"), "a nota mostra quantos ficaram");
    t.d.querySelector('[data-marca="Jeep"]').click();
    igual(t.escolhidas(), ["GWM", "Jeep"]);
    ok(t.texto().includes("Jeep:") && !t.texto().includes("Leapmotor"), "GWM e Jeep, sem Leapmotor");
    t.d.querySelector('[data-marca="Leapmotor"]').click();
    igual(t.escolhidas(), [""], "com as três escolhidas, volta para Todas");
    t.d.querySelector('[data-marca="GWM"]').click();
    t.d.querySelector('[data-marca="GWM"]').click();
    igual(t.escolhidas(), [""], "desmarcar a única escolhida volta para Todas");
  } finally {
    t.fim();
  }
});

teste("relatório de carros enviados: trocar o dia, dia sem carros e nada de HTML vindo dos dados", async () => {
  const t = abrir();
  try {
    const dia = t.d.querySelector("#re-dia");
    dia.value = "2026-11-16";
    dia.dispatchEvent(new Event("change"));
    igual(t.texto(), "Carros enviados;\n\n<b>GWM</b>:\n<i>Ora</i> - 604893", "o texto é texto puro");
    igual(t.d.querySelector("#re-marcas b, #re-marcas i, #re-nota i"), null, "marca com HTML não vira tag");
    dia.value = "2026-11-10";
    dia.dispatchEvent(new Event("change"));
    igual(t.texto(), "");
    ok(t.d.querySelector("#re-nota").textContent.includes("Nenhuma vistoria em 10/11/2026"), "faltou o aviso do dia vazio");
    ok(t.d.querySelector("[data-copiar]").disabled && t.d.querySelector("[data-whatsapp]").disabled, "sem texto, os botões ficam desligados");
  } finally {
    t.fim();
  }
});

teste("relatório de carros enviados: copiar leva o texto (com a edição) e avisa", async () => {
  const avisos = [];
  const t = abrir(avisos);
  const original = Object.getOwnPropertyDescriptor(Navigator.prototype, "clipboard");
  let copiado = null;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (v) => { copiado = v; } } });
  try {
    const campo = t.d.querySelector("#re-texto");
    campo.value += "\n\nBom dia a todos!";
    t.d.querySelector("[data-copiar]").click();
    await esperar(20);
    ok(copiado?.endsWith("Bom dia a todos!"), "copiou o texto editado");
    igual(avisos, ["Mensagem copiada. É só colar no grupo do WhatsApp."]);
  } finally {
    delete navigator.clipboard;
    if (original) Object.defineProperty(Navigator.prototype, "clipboard", original);
    t.fim();
  }
});

teste("relatório de carros enviados: fechar remove a janela", async () => {
  const t = abrir();
  t.d.querySelector("[data-fechar]").click();
  await esperar(20);
  ok(!t.d.isConnected, "a janela saiu da página");
});
