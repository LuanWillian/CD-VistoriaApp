import { teste, igual, ok, esperar } from "./runner.js";
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
    await esperar(300);
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
