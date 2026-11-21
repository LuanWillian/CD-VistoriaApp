import { teste, igual, ok, esperarAte } from "./runner.js";
import { montarAssinatura } from "../../signature.js";

function quadro() {
  const palco = document.getElementById("palco");
  const caixa = document.createElement("div");
  caixa.style.width = "300px";
  caixa.style.height = "150px";
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  caixa.append(canvas);
  palco.append(caixa);
  return { caixa, canvas };
}

function riscar(canvas) {
  const r = canvas.getBoundingClientRect();
  const evento = (tipo, x, y) => canvas.dispatchEvent(new PointerEvent(tipo, {
    bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, pointerType: "touch", button: 0, buttons: 1,
    clientX: r.left + x, clientY: r.top + y,
  }));
  evento("pointerdown", 20, 20);
  for (let i = 1; i <= 10; i++) evento("pointermove", 20 + i * 20, 20 + i * 8);
  evento("pointerup", 220, 100);
}

teste("assinatura: densidade de pixels, traço vira PNG, limpar e carregar", async () => {
  const original = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => 2 });
  const { caixa, canvas } = quadro();
  const recebidos = [];
  try {
    const a = montarAssinatura(canvas, { aoMudar: (b) => recebidos.push(b) });
    igual(canvas.width, 600);
    igual(canvas.height, 300);
    ok(a.vazio(), "começa vazia");
    riscar(canvas);
    await esperarAte(() => recebidos.at(-1) instanceof Blob);
    ok(recebidos.at(-1) instanceof Blob, "aoMudar não recebeu Blob");
    igual(recebidos.at(-1).type, "image/png");
    ok(!a.vazio(), "deveria ter traço");
    const png = recebidos.at(-1);
    a.limpar();
    igual(recebidos.at(-1), null);
    ok(a.vazio(), "limpar deveria esvaziar");
    await a.carregar(png);
    ok(!a.vazio(), "carregar deveria preencher");
    ok(canvas.classList.contains("toque-livre"), "falta touch-action: none");
    a.destruir();
  } finally {
    if (original) Object.defineProperty(window, "devicePixelRatio", original);
    else delete window.devicePixelRatio;
    caixa.remove();
  }
});

teste("assinatura deitada: recorta em volta do traço e gira para ficar na horizontal", async () => {
  const { imagemFinal } = await import("../../assinatura-tela.js");
  const c = document.createElement("canvas");
  c.width = 400;
  c.height = 400;
  const g = c.getContext("2d");
  g.fillStyle = "#ff0000";
  g.fillRect(100, 200, 10, 80); // traço em pé na tela
  g.fillStyle = "#0000ff";
  g.fillRect(100, 200, 10, 10); // ponta de cima do traço
  const m = Math.round(16 * (window.devicePixelRatio || 1));

  const emPe = imagemFinal(c, { deitada: false });
  igual(emPe.width, 10 + 2 * m);
  igual(emPe.height, 80 + 2 * m);

  const deitada = imagemFinal(c, { deitada: true });
  igual(deitada.width, 80 + 2 * m, "largura vira a altura do traço");
  igual(deitada.height, 10 + 2 * m);
  const cor = (x, y) => [...deitada.getContext("2d").getImageData(x, y, 1, 1).data];
  igual(cor(m + 5, m + 5).join(), "0,0,255,255", "a ponta de cima vai para a esquerda");
  igual(cor(75 + m, m + 5).join(), "255,0,0,255");

  const vazio = document.createElement("canvas");
  vazio.width = vazio.height = 50;
  igual(imagemFinal(vazio, { deitada: false }), null);
});

teste("assinatura: avisa na hora que tem traço e guarda os limites, sem gerar PNG a cada traço", async () => {
  const original = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => 2 });
  const { caixa, canvas } = quadro();
  const tracos = [];
  const pngs = [];
  try {
    const a = montarAssinatura(canvas, { aoTracar: (tem) => tracos.push(tem), aoMudar: (b) => pngs.push(b), exportarPng: false });
    igual(a.limites(), null);
    riscar(canvas);
    igual(tracos, [true], "aoTracar deveria ser chamado no mesmo instante do pointerup");
    const l = a.limites();
    ok(l.x0 <= 40 && l.y0 <= 40 && l.x1 >= 440 && l.y1 >= 200, `limites errados: ${JSON.stringify(l)}`);
    await new Promise((r) => setTimeout(r, 150));
    igual(pngs.length, 0, "não deveria gerar PNG a cada traço");
    a.limpar();
    igual(tracos, [true, false]);
    igual(a.limites(), null);
    a.destruir();
  } finally {
    if (original) Object.defineProperty(window, "devicePixelRatio", original);
    else delete window.devicePixelRatio;
    caixa.remove();
  }
});

teste("assinatura: com os limites do traço o recorte não precisa ler a tela inteira", async () => {
  const { imagemFinal } = await import("../../assinatura-tela.js");
  const c = document.createElement("canvas");
  c.width = c.height = 400;
  const m = Math.round(16 * (window.devicePixelRatio || 1));
  const final = imagemFinal(c, { deitada: false, limites: { x0: 100, y0: 200, x1: 109, y1: 279 } });
  igual(final.width, 10 + 2 * m);
  igual(final.height, 80 + 2 * m);
});

teste("tela de assinatura: Confirmar libera no fim do traço e fecha na hora", async () => {
  const { abrirTelaAssinatura } = await import("../../assinatura-tela.js");
  const promessa = abrirTelaAssinatura({ titulo: "Teste" });
  const d = document.querySelector("dialog.assinar");
  try {
    const confirmar = d.querySelector('[data-acao="confirmar"]');
    igual(confirmar.disabled, true);
    riscar(d.querySelector("canvas"));
    igual(confirmar.disabled, false, "Confirmar deveria liberar no mesmo instante");
    confirmar.click();
    igual(d.open, false, "a tela deveria fechar no mesmo instante");
    const blob = await promessa;
    ok(blob instanceof Blob && blob.type === "image/png", "deveria devolver o PNG");
  } finally {
    if (d.isConnected) d.close();
  }
});
